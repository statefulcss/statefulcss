import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

import { dedent, temporaryProject } from "../testing/test-rule.js";
import compatible from "./compatible.js";
import recommended from "./recommended.js";

/** The setup the package README gives for Sass and Vue: `recommended`, and a parser for each by file name. */
const setup: stylelint.Config = {
	extends: [recommended],
	overrides: [
		{ files: ["**/*.scss"], customSyntax: "postcss-scss" },
		{ files: ["**/*.vue"], customSyntax: "postcss-html" },
	],
};

/** Writes each file and lints them all as the `stylelint` command does, giving each file's warnings by rule. */
async function lintFiles(
	project: string,
	files: Readonly<Record<string, string>>,
	config: stylelint.Config = setup,
): Promise<Record<string, string[]>> {
	const paths = Object.entries(files).map(([file, code]) => {
		const full = path.join(project, file);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, `${dedent(code)}\n`);
		return full;
	});
	const { results } = await stylelint.lint({ files: paths, config, cwd: project, configBasedir: project });
	return Object.fromEntries(
		results.map((result) => {
			expect(result.invalidOptionWarnings).toEqual([]);
			expect(result.parseErrors).toEqual([]);
			const said = result.warnings.map((warning) => `${warning.line}: ${warning.rule}`);
			return [path.relative(project, result.source ?? ""), said];
		}),
	);
}

const sass = `
	@use "sass:math";
	@use "./tokens" as *;
	@forward "./mixins";
	@import "legacy";

	$gap: 4px !default;
	$breakpoint: 40rem;

	@mixin focus-ring($width: 2px) {
		outline: $width solid;
	}

	@function double($value) {
		@return $value * 2;
	}

	.button {
		--s-gap: #{$gap};
		--s-padding: #{double(2px)};
		--_radius: #{math.div(8px, 2)};
		--_shadow: #{rgba(black, 0.5)};

		gap: var(--s-gap);
		padding: var(--s-padding);
		border-radius: var(--_radius);
		box-shadow: 0 1px var(--_shadow);

		@media (min-width: $breakpoint) {
			--s-gap: #{$gap * 2};
		}

		@each $size in small, large {
			&[data-size="#{$size}"] {
				--s-padding: #{$gap};
			}
		}

		&:focus-visible {
			@include focus-ring;
		}
	}

	@if $gap == 4px {
		@debug "default gap";
	}
`;

const vue = `
	<template>
		<div class="card"><slot /></div>
	</template>

	<style scoped>
	.card {
		--_gap: 1rem;

		gap: var(--_gap);
	}

	.card :deep(a) {
		color: inherit;
	}

	:slotted(p) {
		margin: 0;
	}

	:global(.dark) .card {
		--_gap: 2rem;
	}
	</style>

	<style lang="scss">
	@mixin quiet {
		opacity: 0.5;
	}

	.notice {
		@include quiet;
	}
	</style>

	<style module>
	.panel {
		composes: surface from "./surface.module.css";
	}
	</style>
`;

const cssModule = `
	@value small from "./sizes.module.css";

	.button {
		composes: base from "./base.module.css";
		--_gap: 1rem;

		gap: var(--_gap);
	}

	:global(.dark) .button {
		--_gap: 2rem;
	}

	:local(.icon) {
		inline-size: 1em;
	}
`;

const sassModule = `
	@use "./tokens";

	@mixin quiet {
		opacity: 0.5;
	}

	.button {
		composes: base from "./base.module.scss";

		@include quiet;
	}

	:global(.dark) .button {
		opacity: 1;
	}
`;

describe("recommended in Sass, Vue and CSS Modules", () => {
	const project = temporaryProject();

	it("passes correct files, with the parsers the README gives", async () => {
		expect(
			await lintFiles(project(), {
				"src/button.scss": sass,
				"src/card.vue": vue,
				"src/button.module.css": cssModule,
				"src/notice.module.scss": sassModule,
			}),
		).toEqual({
			[path.join("src", "button.scss")]: [],
			[path.join("src", "card.vue")]: [],
			[path.join("src", "button.module.css")]: [],
			[path.join("src", "notice.module.scss")]: [],
		});
	});

	it("still reports names no syntax has, and the Stateful CSS rules", async () => {
		const said = await lintFiles(project(), {
			"src/typo.scss": "@inclde focus-ring;\n.button { --gap: 1px; }",
			"src/typo.vue":
				"<template><div /></template>\n<style>\n.card :dep(a) { colr: red; }\n.card { --gap: 1px; }\n</style>",
			"src/typo.module.css": "@valeu small: 1px;\n.button { compose: base; }",
		});
		expect(said).toEqual({
			[path.join("src", "typo.scss")]: ["1: at-rule-no-unknown", "2: statefulcss/variable-role-prefix"],
			[path.join("src", "typo.vue")]: [
				"3: property-no-unknown",
				"3: selector-pseudo-class-no-unknown",
				"4: statefulcss/variable-role-prefix",
			],
			[path.join("src", "typo.module.css")]: ["1: at-rule-no-unknown", "2: property-no-unknown"],
		});
	});

	it("keeps CSS's value checks in a plain CSS file and a .vue file", async () => {
		const said = await lintFiles(project(), {
			"src/value.css": ".button { padding: double(2px); }",
			"src/value.vue": "<template><div /></template>\n<style>\n.card { padding: double(2px); }\n</style>",
		});
		expect(said).toEqual({
			[path.join("src", "value.css")]: ["1: declaration-property-value-no-unknown"],
			[path.join("src", "value.vue")]: ["3: declaration-property-value-no-unknown"],
		});
	});

	it("passes Sass values and v-bind() in a .vue file with the README's rules for them switched off", async () => {
		const vueValues: stylelint.Config = {
			extends: [recommended],
			overrides: [
				{ files: ["**/*.scss"], customSyntax: "postcss-scss" },
				{
					files: ["**/*.vue"],
					customSyntax: "postcss-html",
					rules: {
						"declaration-property-value-no-unknown": null,
						"value-no-invalid": null,
						"media-query-no-invalid": null,
					},
				},
			],
		};
		const code = `
			<template><div class="card" /></template>

			<style lang="scss">
			$gap: 4px;

			.card {
				--_shadow: #{rgba(black, 0.5)};
				--_ink: v-bind(color);

				box-shadow: 0 1px var(--_shadow);
				color: var(--_ink);

				@media (min-width: $gap * 100) {
					padding: $gap;
				}
			}
			</style>
		`;
		expect(await lintFiles(project(), { "src/values.vue": code }, setup)).not.toEqual({
			[path.join("src", "values.vue")]: [],
		});
		expect(await lintFiles(project(), { "src/values.vue": code }, vueValues)).toEqual({
			[path.join("src", "values.vue")]: [],
		});
	});

	it("accepts a parent selector in a Sass mixin, and still reports one with no rule around it", async () => {
		const mixin = `
			@mixin focused {
				&:focus-visible {
					outline: 2px solid red;
				}
			}

			.button {
				@include focused;
			}
		`;
		const said = await lintFiles(project(), {
			"src/mixin.scss": mixin,
			"src/mixin.vue": `<template><div class="button" /></template>\n<style lang="scss">\n${dedent(mixin)}\n</style>`,
			"src/parent.css": "& .button { color: red; }",
			"src/parent.scss": "& .button { color: red; }",
		});
		expect(said).toEqual({
			[path.join("src", "mixin.scss")]: [],
			[path.join("src", "mixin.vue")]: [],
			[path.join("src", "parent.css")]: ["1: nesting-selector-no-missing-scoping-root"],
			[path.join("src", "parent.scss")]: ["1: nesting-selector-no-missing-scoping-root"],
		});
	});

	/** CSS Modules' values, exports and imports, with nothing reading the names they declare. */
	const moduleNames = `
		@value ink: red;

		:export {
			brand: red;
		}

		:import("./base.css") {
			other: source;
		}

		.card {
			color: red;
		}
	`;
	/** The same, with the names read. */
	const moduleValues = `
		@value ink: red;

		:import("./base.css") {
			other: source;
		}

		.card {
			color: ink;
			background-color: other;
		}
	`;
	const inVueModule = (code: string): string =>
		`<template><div /></template>\n<style module>\n${dedent(code)}\n</style>`;

	it("accepts CSS Modules' @value, :export and :import(), and still reports a misspelled block", async () => {
		const typo = ":exprt {\n\tbrand: red;\n}";
		const said = await lintFiles(project(), {
			"src/names.module.css": moduleNames,
			"src/names.module.scss": moduleNames,
			"src/names.vue": inVueModule(moduleNames),
			"src/typo.module.css": typo,
			"src/typo.module.scss": typo,
			"src/typo.vue": inVueModule(typo),
		});
		const reported = (line: number) => [
			`${line + 1}: property-no-unknown`,
			`${line}: selector-pseudo-class-no-unknown`,
		];
		expect(said).toEqual({
			[path.join("src", "names.module.css")]: [],
			[path.join("src", "names.module.scss")]: [],
			[path.join("src", "names.vue")]: [],
			[path.join("src", "typo.module.css")]: reported(1),
			[path.join("src", "typo.module.scss")]: reported(1),
			[path.join("src", "typo.vue")]: reported(3),
		});
	});

	it("passes values CSS Modules name with the README's rule for them switched off", async () => {
		const files = {
			"src/values.module.css": moduleValues,
			"src/values.module.scss": moduleValues,
			"src/values.vue": inVueModule(moduleValues),
		};
		expect(await lintFiles(project(), files)).toEqual({
			[path.join("src", "values.module.css")]: [
				"8: declaration-property-value-no-unknown",
				"9: declaration-property-value-no-unknown",
			],
			[path.join("src", "values.module.scss")]: [],
			[path.join("src", "values.vue")]: [
				"10: declaration-property-value-no-unknown",
				"11: declaration-property-value-no-unknown",
			],
		});
		const moduleValuesSetup: stylelint.Config = {
			extends: [recommended],
			overrides: [
				{ files: ["**/*.scss"], customSyntax: "postcss-scss" },
				{ files: ["**/*.vue"], customSyntax: "postcss-html" },
				{
					files: ["**/*.module.css", "**/*.vue"],
					rules: { "declaration-property-value-no-unknown": null },
				},
			],
		};
		expect(await lintFiles(project(), files, moduleValuesSetup)).toEqual({
			[path.join("src", "values.module.css")]: [],
			[path.join("src", "values.module.scss")]: [],
			[path.join("src", "values.vue")]: [],
		});
	});

	it("adds nothing to compatible, which leaves syntaxes to the project's own config", () => {
		expect(compatible.overrides).toHaveLength(1);
		expect(recommended.overrides?.length).toBeGreaterThan(1);
	});
});

/** The setup the package README gives for Astro and Svelte: `postcss-html` reads their `<style>` blocks. */
const components: stylelint.Config = {
	...setup,
	overrides: [{ files: ["**/*.astro", "**/*.svelte", "**/*.vue"], customSyntax: "postcss-html" }],
};

/** A component whose parts, content and slot are written in the `<style>` given. */
const card = (style: string, limit: string, content: string, slot: string) => `
	<div class="card" data-component><h2 data-part="title">Card</h2><slot /></div>
	${style}
		@layer components {
			.card {
				padding: 1rem;
				& > ${slot} { margin: 0; }
			}
			@scope (.card) to (${limit}) {
				[data-part="title"] { font-weight: 600; }
				${content} { margin: 0; }
			}
		}
	</style>
`;

describe("recommended in Astro and Svelte components", () => {
	const project = temporaryProject();

	it("passes the @scope limit each kind of <style> ships as the component attribute", async () => {
		const global = ":global([data-component])";
		expect(
			await lintFiles(
				project(),
				{
					"src/scoped.astro": card("<style>", global, ":global(p)", ':global([data-slot="action"])'),
					"src/global.astro": card("<style is:global>", "[data-component]", "p", '[data-slot="action"]'),
					"src/card.svelte": card(
						"<style>",
						"[data-component]",
						":global(p)",
						':global([data-slot="action"])',
					),
				},
				components,
			),
		).toEqual({
			[path.join("src", "scoped.astro")]: [],
			[path.join("src", "global.astro")]: [],
			[path.join("src", "card.svelte")]: [],
		});
	});

	it("reports a limit that doesn't ship as the component attribute", async () => {
		const global = ":global([data-component])";
		expect(
			await lintFiles(
				project(),
				{
					"src/scoped.astro": card("<style>", "[data-component]", "p", '[data-slot="action"]'),
					"src/global.astro": card("<style is:global>", global, "p", '[data-slot="action"]'),
					"src/card.svelte": card("<style>", global, "p", '[data-slot="action"]'),
					"src/card.vue": `<template><div></div></template>\n${card("<style scoped>", global, ":deep(p)", '[data-slot="action"]')}`,
				},
				components,
			),
		).toEqual({
			[path.join("src", "scoped.astro")]: ["8: statefulcss/parts-in-scope"],
			[path.join("src", "global.astro")]: ["8: statefulcss/parts-in-scope"],
			[path.join("src", "card.svelte")]: ["8: statefulcss/parts-in-scope"],
			[path.join("src", "card.vue")]: ["10: statefulcss/parts-in-scope"],
		});
	});
});
