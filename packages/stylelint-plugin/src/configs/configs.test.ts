import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

	it("warns about a repeated property, unless its two values have different syntaxes", async () => {
		expect(await warningsOf(config, project(), ".page { color: red; color: blue; }")).toEqual([
			"declaration-block-no-duplicate-properties: warning",
		]);
		expect(await warningsOf(config, project(), ".page { block-size: 100vh; block-size: 100dvh; }")).toEqual(
			[],
		);
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

	// Core's four whole components. The last stage adds the rest of the corpus; from here on, each rule that lands
	// has to leave them clean.
	const components = fileURLToPath(new URL("../../../core/fixtures/components", import.meta.url));
	describe.each(readdirSync(components))("%s passes with no warning", (file) => {
		const code = readFileSync(path.join(components, file), "utf8");
		it.each(syntaxes)("%s", async (syntax) => {
			expect(await warningsOf(config, project(), code, syntax)).toEqual([]);
		});
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

	it("leaves a repeated custom property to Stylelint until bind-once reports it", async () => {
		expect(await warningsOf(config, project(), ".page { --s-color: red; --s-color: blue; }")).toEqual([
			"declaration-block-no-duplicate-custom-properties: error",
		]);
	});
});
