import path from "node:path";

import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

import plugins, { ruleMeta, ruleNames } from "../index.js";
import { lint, sourceFor, syntaxes, temporaryProject } from "../testing/test-rule.js";
import compatible from "./compatible.js";
import recommended from "./recommended.js";

const configs = [
	["recommended", recommended],
	["compatible", compatible],
] as const;

/** The warnings a config gives some CSS, each as its rule and its level. */
async function warningsOf(
	config: stylelint.Config,
	project: string,
	code: string,
	syntax: (typeof syntaxes)[number] = "css",
): Promise<string[]> {
	const { warnings, invalid } = await lint(sourceFor(syntax, { code }), project, config);
	expect(invalid).toEqual([]);
	return warnings.map((warning) => `${warning.rule}: ${warning.severity}`);
}

describe.each(configs)("%s", (_name, config) => {
	const project = temporaryProject();

	it("loads the plugin and switches on every Stateful CSS rule", () => {
		expect(config.plugins).toBe(plugins);
		expect(Object.keys(config.rules ?? {})).toEqual(expect.arrayContaining([...ruleNames]));
		expect(Object.keys(ruleMeta)).toEqual([...ruleNames]);
	});

	it("forbids !important", async () => {
		expect(await warningsOf(config, project(), ".page { color: red !important; }")).toEqual([
			"declaration-no-important: error",
		]);
	});

	it("warns about every repeated property, a fallback included, and suggests @supports", async () => {
		expect(await warningsOf(config, project(), ".page { color: red; color: blue; }")).toEqual([
			"declaration-block-no-duplicate-properties: warning",
		]);
		const fallback = ".page { block-size: 100vh; block-size: 100dvh; }";
		const { warnings } = await lint(sourceFor("css", { code: fallback }), project(), config);
		expect(warnings.map((warning) => [warning.severity, warning.text])).toEqual([
			[
				"warning",
				'Unexpected duplicate "block-size". Write the fallback with "@supports" instead. ' +
					"(declaration-block-no-duplicate-properties)",
			],
		]);
	});

	it("leaves a repeated property as written under --fix, so the fallback stays", async () => {
		const source = sourceFor("css", { code: ".page {\n\tblock-size: 100vh;\n\tblock-size: 100dvh;\n}" });
		const fixed = await lint(source, project(), config, true);
		expect(fixed.code).toBe(source.code);
		expect(fixed.warnings.map((warning) => warning.rule)).toEqual([
			"declaration-block-no-duplicate-properties",
		]);
	});

	it("reports a longhand that its shorthand then discards", async () => {
		expect(await warningsOf(config, project(), ".page { padding-left: 0; padding: 1px; }")).toEqual([
			"declaration-block-no-shorthand-property-overrides: error",
		]);
	});

	it("leaves state blocks in the methodology's order alone", async () => {
		const code = "#main .link { color: red; } .link { color: blue; }";
		expect(await warningsOf(config, project(), code)).toEqual([]);
	});

	const unmatchable = "a:has(::after) { color: red; } :where(::before) { color: red; }";

	it("reports selectors that can't match, in CSS", async () => {
		expect(await warningsOf(config, project(), unmatchable)).toEqual([
			"selector-no-invalid: error",
			"selector-no-unmatchable: error",
		]);
	});

	it("leaves those two rules off in SCSS, Sass and Less, as Stylelint's docs advise", async () => {
		expect(await warningsOf(config, project(), unmatchable, "scss")).toEqual([]);
		for (const extension of ["scss", "sass", "less"]) {
			const resolved = await stylelint.resolveConfig(path.join(project(), `src/button.${extension}`), {
				config,
			});
			expect(resolved?.rules).toMatchObject({ "selector-no-unmatchable": null, "selector-no-invalid": null });
		}
	});
});

describe("recommended", () => {
	const project = temporaryProject();

	it("includes Stylelint's own recommended rules", async () => {
		expect(await warningsOf(recommended, project(), ".page { colr: red; }")).toEqual([
			"property-no-unknown: error",
		]);
	});
});

describe("compatible", () => {
	const project = temporaryProject();

	it("adds no rules of Stylelint's beyond the ones the methodology needs", async () => {
		expect(await warningsOf(compatible, project(), ".page { colr: red; }")).toEqual([]);
	});

	it("switches off a project's rules that contradict the methodology, when it's listed last", async () => {
		// What `stylelint-config-standard` asks for: kebab-case names, and state blocks in order of specificity.
		const existing: stylelint.Config = {
			rules: {
				"custom-property-pattern": "^([a-z][a-z0-9]*)(-[a-z0-9]+)*$",
				"selector-class-pattern": "^([a-z][a-z0-9]*)(-[a-z0-9]+)*$",
				"no-descending-specificity": true,
				"declaration-empty-line-before": "always",
				"color-named": "never",
			},
		};
		const config: stylelint.Config = { extends: [existing, compatible] };
		const code = "#main .Button { color: var(--t-color); } .Button { --_gap: 1px; color: var(--_gap); }";
		expect(await warningsOf(existing, project(), code)).not.toEqual([]);
		expect(await warningsOf(config, project(), code)).toEqual([]);
		// The project's other rules stay.
		expect(await warningsOf(config, project(), ".Button { color: red; }")).toEqual(["color-named: error"]);
	});
});

describe.each(configs)("%s", (_name, config) => {
	const project = temporaryProject();

	it("reports a repeated custom property through bind-once, with Stylelint's own rule off", async () => {
		expect(await warningsOf(config, project(), ".page { --s-color: red; --s-color: blue; }")).toEqual([
			"statefulcss/bind-once: error",
		]);
		const existing: stylelint.Config = {
			rules: { "declaration-block-no-duplicate-custom-properties": true },
		};
		const extended: stylelint.Config = { extends: [existing, config] };
		expect(await warningsOf(extended, project(), ".page { --s-color: red; --s-color: blue; }")).toEqual([
			"statefulcss/bind-once: error",
		]);
	});
});

/** The guard that keeps interaction states off a blocked element, as the default settings list the blocking states. */
const guard = '&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert]))';

describe.each(configs)("%s", (_name, config) => {
	const project = temporaryProject();

	it.each(syntaxes)("accepts a guard on each side of focus, in the order of states (%s)", async (syntax) => {
		const code = `
.button {
	--_background-color: var(--t-color-neutral-100);
	--_background-color-hover: var(--t-color-neutral-200);
	--_background-color-active: var(--t-color-neutral-300);
	--s-background-color: var(--_background-color);
	--s-outline-width: 0px;
	--s-opacity: 1;
	background-color: var(--s-background-color);
	outline: var(--s-outline-width) solid var(--t-color-focus);
	opacity: var(--s-opacity);

	${guard} {
		&:hover { --s-background-color: var(--_background-color-hover); }
	}
	&:focus-visible { --s-outline-width: 2px; }
	${guard} {
		&:active { --s-background-color: var(--_background-color-active); }
	}
	&:disabled { --s-opacity: 0.5; }
}
`;
		expect(await warningsOf(config, project(), code, syntax)).toEqual([]);
	});

	it.each(syntaxes)("accepts a combined state's guard after its semantic state (%s)", async (syntax) => {
		const code = `
.button {
	--_background-color: var(--t-color-neutral-100);
	--_background-color-hover: var(--t-color-neutral-200);
	--_background-color-pressed: var(--t-color-neutral-300);
	--_background-color-pressed-hover: var(--t-color-neutral-400);
	--s-background-color: var(--_background-color);
	background-color: var(--s-background-color);

	${guard} {
		&:hover { --s-background-color: var(--_background-color-hover); }
	}
	&[aria-pressed="true"] { --s-background-color: var(--_background-color-pressed); }
	${guard} {
		&[aria-pressed="true"]:where(:hover) { --s-background-color: var(--_background-color-pressed-hover); }
	}
}
`;
		expect(await warningsOf(config, project(), code, syntax)).toEqual([]);
	});

	it.each(syntaxes)("accepts a component's defaults in a block of their own (%s)", async (syntax) => {
		const code = ".button {\n\t& {\n\t\t--s-opacity: 1;\n\t}\n\n\topacity: var(--s-opacity);\n}";
		expect(await warningsOf(config, project(), code, syntax)).toEqual([]);
	});
});

describe("compatible, listed after a config that refuses a repeated selector and a nested `&` block", () => {
	const project = temporaryProject();
	// What `stylelint-config-standard` turns on.
	const existing: stylelint.Config = {
		rules: { "no-duplicate-selectors": true, "block-no-redundant-nested-style-rules": true },
	};
	const code = `.button {\n\t& {\n\t\t--s-opacity: 1;\n\t}\n\n\topacity: var(--s-opacity);\n\n\t${guard} {\n\t\t&:hover { --s-opacity: 0.9; }\n\t}\n\t&:focus-visible { --s-opacity: 0.8; }\n\t${guard} {\n\t\t&:active { --s-opacity: 0.7; }\n\t}\n}`;

	it.each(syntaxes)("switches both off (%s)", async (syntax) => {
		expect(await warningsOf(existing, project(), code, syntax)).toEqual([
			"block-no-redundant-nested-style-rules: error",
			"no-duplicate-selectors: error",
			"no-duplicate-selectors: error",
		]);
		expect(await warningsOf({ extends: [existing, compatible] }, project(), code, syntax)).toEqual([]);
	});
});
