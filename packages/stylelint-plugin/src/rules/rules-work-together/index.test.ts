import { writeFileSync } from "node:fs";
import path from "node:path";

import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

import { statefulRules } from "../../configs/adjustments.js";
import plugins, { ruleMeta, ruleNames } from "../../index.js";
import compatible from "../../configs/compatible.js";
import recommended from "../../configs/recommended.js";
import { toConfigPlugin } from "../../stylelint/config-check.js";
import { ruleNameOf } from "../../stylelint/plugin.js";
import {
	inEverySyntax,
	type Source,
	sourceFor,
	syntaxes,
	temporaryProject,
} from "../../testing/test-rule.js";
import rulesWorkTogether from "./index.js";

const ruleName = ruleNameOf(rulesWorkTogether);
const project = temporaryProject();

/**
 * A config with every Stateful CSS rule as the configs set them and `rules` on top, and a config check of its own,
 * which has said nothing yet. The other rules are there so the config can name them.
 */
function configWith(rules: NonNullable<stylelint.Config["rules"]>): stylelint.Config {
	const others = plugins.filter((plugin) => !("ruleName" in plugin && plugin.ruleName === ruleName));
	return {
		plugins: [...others, toConfigPlugin(rulesWorkTogether)],
		rules: { ...statefulRules, ...rules },
	};
}

interface Said {
	text: string;
	line: number;
	column: number;
	severity: string;
}

/** The config check's warnings for one file, each with its line counted in the case's own CSS. */
async function saidIn(
	source: Source,
	config: stylelint.Config,
	options: Partial<stylelint.LinterOptions> = {},
): Promise<{ said: Said[]; invalid: string[] }> {
	const { results } = await stylelint.lint({
		code: source.code,
		codeFilename: path.join(project(), source.file),
		config,
		...(source.customSyntax ? { customSyntax: source.customSyntax } : {}),
		...options,
	});
	const [result] = results;
	return {
		said: (result?.warnings ?? [])
			.filter((warning) => warning.rule === ruleName)
			.map((warning) => ({
				text: warning.text,
				line: warning.line - source.linesBefore,
				column: warning.column,
				severity: warning.severity,
			})),
		invalid: (result?.invalidOptionWarnings ?? []).map((warning) => warning.text),
	};
}

const code = `
	.page {
		color: red;
	}
`;

const bindThroughOff =
	'Unexpected "statefulcss/bind-once" without "statefulcss/bind-through-state-variables": a state that changes a ' +
	'property through a private goes unreported. Turn "statefulcss/bind-through-state-variables" on. ' +
	`(${ruleName})`;
const duplicatesUnreported =
	'Unexpected "statefulcss/bind-once" and "declaration-block-no-duplicate-custom-properties" both off: a repeated ' +
	'custom property goes unreported. Turn "statefulcss/bind-once" on. ' +
	`(${ruleName})`;
const contradicted =
	'Unexpected "no-descending-specificity": it reports state blocks written in the methodology\'s order. Turn it ' +
	`off, as "recommended" and "compatible" do. (${ruleName})`;

/** Said on the first line, at the level both configs give the rule. */
const onFirstLine = (text: string): Said => ({ text, line: 1, column: 1, severity: "warning" });

describe(ruleName, () => {
	it.each([
		["recommended", recommended],
		["compatible", compatible],
	] as const)("is on as a warning in %s, after every other rule", (_name, config) => {
		expect(ruleNames.at(-1)).toBe(ruleName);
		expect(config.rules?.[ruleName]).toEqual([true, { severity: "warning" }]);
		expect(ruleMeta[ruleName]).toEqual({
			url: "https://statefulcss.com/docs/lint-rules/rules-work-together",
			fixable: false,
		});
	});

	inEverySyntax("accepts: every rule as the configs set them", { code }, async (source) => {
		expect(await saidIn(source, configWith({}))).toEqual({ said: [], invalid: [] });
	});

	inEverySyntax(
		'rejects: "bind-once" on and "bind-through-state-variables" off',
		{ code },
		async (source) => {
			const config = configWith({ "statefulcss/bind-through-state-variables": null });
			expect(await saidIn(source, config)).toEqual({ said: [onFirstLine(bindThroughOff)], invalid: [] });
		},
	);

	inEverySyntax(
		'rejects: "bind-once" off and "declaration-block-no-duplicate-custom-properties" off too',
		{ code },
		async (source) => {
			const config = configWith({ "statefulcss/bind-once": null });
			expect(await saidIn(source, config)).toEqual({
				said: [onFirstLine(duplicatesUnreported)],
				invalid: [],
			});
		},
	);

	inEverySyntax(
		'accepts: "bind-once" off with Stylelint\'s own rule for repeated custom properties on',
		{ code },
		async (source) => {
			const config = configWith({
				"statefulcss/bind-once": null,
				"statefulcss/bind-through-state-variables": null,
				"declaration-block-no-duplicate-custom-properties": true,
			});
			expect(await saidIn(source, config)).toEqual({ said: [], invalid: [] });
		},
	);

	inEverySyntax('rejects: "no-descending-specificity" on', { code }, async (source) => {
		const config = configWith({ "no-descending-specificity": [true, { severity: "warning" }] });
		expect(await saidIn(source, config)).toEqual({ said: [onFirstLine(contradicted)], invalid: [] });
	});

	inEverySyntax("rejects: every problem at once, each said once", { code }, async (source) => {
		const config = configWith({ "statefulcss/bind-once": null, "no-descending-specificity": true });
		expect(await saidIn(source, config)).toEqual({
			said: [onFirstLine(duplicatesUnreported), onFirstLine(contradicted)],
			invalid: [],
		});
	});

	inEverySyntax("accepts: the config check switched off", { code }, async (source) => {
		const config = configWith({ "statefulcss/bind-through-state-variables": null, [ruleName]: null });
		expect(await saidIn(source, config)).toEqual({ said: [], invalid: [] });
	});

	inEverySyntax(
		"accepts: a disable comment for the config check",
		{
			code: `/* stylelint-disable ${ruleName} -- bind-through-state-variables is off on purpose */\n${code}`,
		},
		async (source) => {
			const config = configWith({ "statefulcss/bind-through-state-variables": null });
			expect(await saidIn(source, config)).toEqual({ said: [], invalid: [] });
		},
	);

	it.each(syntaxes)(
		"says a problem once for a run: on the first file, and that file again (%s)",
		async (syntax) => {
			const config = configWith({ "statefulcss/bind-through-state-variables": null });
			const first = sourceFor(syntax, { code, file: "src/first.css" });
			const second = sourceFor(syntax, { code, file: "src/second.css" });
			expect((await saidIn(first, config)).said).toEqual([onFirstLine(bindThroughOff)]);
			expect((await saidIn(second, config)).said).toEqual([]);
			// An editor lints the first file again, and keeps showing the warning there.
			expect((await saidIn(first, config)).said).toEqual([onFirstLine(bindThroughOff)]);
		},
	);

	it("says a problem on one file of a run that lints several", async () => {
		const config = configWith({ "statefulcss/bind-through-state-variables": null });
		const files = ["src/one.css", "src/two.css", "src/three.css"].map((file) => path.join(project(), file));
		for (const file of files) writeFileSync(file, ".page {\n\tcolor: red;\n}\n");
		const { results } = await stylelint.lint({ files, config });
		const said = results.flatMap((result) => result.warnings.filter((warning) => warning.rule === ruleName));
		expect(said.map((warning) => warning.text)).toEqual([bindThroughOff]);
	});

	it("says each problem on the first file it's found in, so a problem only some files have is said too", async () => {
		// `overrides` can switch a rule off for some files only.
		const config: stylelint.Config = {
			...configWith({}),
			overrides: [{ files: ["**/legacy/**"], rules: { "statefulcss/bind-through-state-variables": null } }],
		};
		const first = sourceFor("css", { code, file: "src/first.css" });
		const legacy = sourceFor("css", { code, file: "src/legacy/old.css" });
		// Override globs are matched from the config's folder.
		const options = { configBasedir: project() };
		expect((await saidIn(first, config, options)).said).toEqual([]);
		expect((await saidIn(legacy, config, options)).said).toEqual([onFirstLine(bindThroughOff)]);
		expect((await saidIn(first, config, options)).said).toEqual([]);
	});

	it("says it once in a .vue file with two <style> blocks", async () => {
		const config = configWith({ "statefulcss/bind-through-state-variables": null });
		const source: Source = {
			...sourceFor("vue", { code }),
			code: "<template>\n\t<div></div>\n</template>\n\n<style>\na { color: red; }\n</style>\n\n<style>\nb { color: red; }\n</style>\n",
		};
		expect((await saidIn(source, config)).said).toEqual([onFirstLine(bindThroughOff)]);
	});

	it("says it for code with no file, and for an empty file", async () => {
		const config = configWith({ "statefulcss/bind-through-state-variables": null });
		const { results } = await stylelint.lint({ code: ".page { color: red; }", config });
		expect(results[0]?.warnings.map((warning) => [warning.rule, warning.line, warning.column])).toEqual([
			[ruleName, 1, 1],
		]);
		const fresh = configWith({ "statefulcss/bind-through-state-variables": null });
		const empty = await saidIn(sourceFor("css", { code: "", file: "src/empty.css" }), fresh);
		expect(empty.said.map((one) => one.text)).toEqual([bindThroughOff]);
	});

	it("takes no options of its own, and no project setting", async () => {
		const source = sourceFor("css", { code });
		expect((await saidIn(source, configWith({ [ruleName]: [true, { ignore: ["x"] }] }))).invalid).toEqual([
			`Invalid option name "ignore" for rule "${ruleName}"`,
		]);
		expect((await saidIn(source, configWith({ [ruleName]: [true, { strict: true }] }))).invalid).toEqual([
			`"strict" is a project setting, not an option of "${ruleName}". Set it in statefulcss.config.json instead`,
		]);
		expect((await saidIn(source, configWith({ [ruleName]: false }))).invalid).toEqual([
			`Invalid option value "false" for rule "${ruleName}". Are you trying to disable this rule? If so use "null" instead`,
		]);
	});

	it("keeps its own messages when validation is off and a falsy secondary option is given", async () => {
		const config = configWith({ "statefulcss/bind-through-state-variables": null, [ruleName]: [true, null] });
		const { said, invalid } = await saidIn(sourceFor("css", { code }), config, { validate: false });
		expect(invalid).toEqual([]);
		expect(said.map((one) => one.text)).toEqual([bindThroughOff]);
	});
});
