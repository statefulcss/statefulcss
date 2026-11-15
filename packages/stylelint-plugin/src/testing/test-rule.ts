// The helper every rule's tests are written with, in the shape of Stylelint's own test presets: `accept`, `reject`
// and `fixed`. Each case goes through Stylelint itself, as plain CSS, as SCSS and as the `<style>` block of a `.vue`
// file, so positions, messages, severities and fixes are tested the way a project gets them.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { StatefulCSSConfig } from "@statefulcss/config";
import stylelint from "stylelint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import plugins, { ruleNames } from "../index.js";
import type { RuleDefinition } from "../rules/rule.js";
import { ruleNameOf, toPlugin } from "../stylelint/plugin.js";

/** Every case runs in each of these, unless it opts out with a reason. */
export const syntaxes = ["css", "scss", "vue"] as const;
export type Syntax = (typeof syntaxes)[number];

export interface Case {
	description: string;
	/** The CSS. Its first and last blank lines and its shared indentation are left out, so line 1 is its first line. */
	code: string;
	/** The file's path inside the project, as the CSS form names it: `src/styles/themes/base/index.css`. */
	file?: string;
	/** The syntaxes this case doesn't translate to, each with the reason. */
	skip?: Partial<Record<Syntax, string>>;
}

export interface ExpectedWarning {
	/** The message, without the rule's name at its end. */
	message: string;
	/** Counted in the case's CSS, from 1. */
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	/** Checked only when given; the rule's own level otherwise. */
	severity?: "error" | "warning";
}

export interface RejectCase extends Case {
	warnings: ExpectedWarning[];
	/** What `--fix` writes, for a rule with a fix. */
	fixed?: string;
}

export interface RuleTests {
	/** The project's `statefulcss.config.json`. The defaults when left out. */
	settings?: StatefulCSSConfig;
	/** The rule's own options, as a Stylelint config gives them. */
	options?: Record<string, unknown>;
	accept?: Case[];
	reject?: RejectCase[];
}

/** Tests one rule: every `accept` case reports nothing, and every `reject` case reports exactly its warnings. */
export function testRule(definition: RuleDefinition, tests: RuleTests): void {
	const ruleName = ruleNameOf(definition);
	// A fault of the plugin's own fails the test, where a project would get a warning.
	const plugin = toPlugin(definition, { failLoudly: true });
	const config: stylelint.Config = {
		plugins: [plugin],
		rules: { [ruleName]: [true, { severity: definition.severity, ...tests.options }] },
	};
	const project = temporaryProject(tests.settings);

	describe(ruleName, () => {
		for (const one of tests.accept ?? []) {
			inEverySyntax(`accepts: ${one.description}`, one, async (source) => {
				const { warnings, invalid } = await lint(source, project(), config);
				expect(invalid).toEqual([]);
				expect(warnings).toEqual([]);
			});
		}

		for (const one of tests.reject ?? []) {
			inEverySyntax(`rejects: ${one.description}`, one, async (source) => {
				const { warnings, invalid } = await lint(source, project(), config);
				expect(invalid).toEqual([]);
				expect(warnings.map((warning) => comparable(warning, source))).toEqual(
					one.warnings.map((expected) => ({
						severity: definition.severity,
						...expected,
						message: `${expected.message} (${ruleName})`,
					})),
				);
				// A warning names its end only when the case does.
				function comparable(warning: stylelint.Warning, from: Source): ExpectedWarning {
					const expected = one.warnings.find(
						(candidate) =>
							candidate.line === warning.line - from.linesBefore && candidate.column === warning.column,
					);
					return {
						message: warning.text,
						line: warning.line - from.linesBefore,
						column: warning.column,
						...(expected?.endLine === undefined || warning.endLine === undefined
							? {}
							: { endLine: warning.endLine - from.linesBefore }),
						...(expected?.endColumn === undefined || warning.endColumn === undefined
							? {}
							: { endColumn: warning.endColumn }),
						severity: warning.severity,
					};
				}

				if (one.fixed === undefined) return;
				const fixed = await lint(source, project(), config, true);
				expect(fixed.code).toBe(source.wrap(dedent(one.fixed)));

				// A fix never produces CSS that a rule reports: not this one again, and no other rule newly.
				const everyRule: stylelint.Config = {
					plugins: [...plugins.filter((other) => !isRule(other, ruleName)), plugin],
					rules: Object.fromEntries([...new Set([...ruleNames, ruleName])].map((name) => [name, true])),
				};
				const before = await lint(source, project(), everyRule);
				const after = await lint({ ...source, code: fixed.code ?? "" }, project(), everyRule);
				const had = new Set(before.warnings.map((warning) => warning.text));
				expect(after.warnings.filter((warning) => !had.has(warning.text))).toEqual([]);
			});
		}
	});
}

function isRule(plugin: stylelint.Plugin, ruleName: string): boolean {
	return "ruleName" in plugin && plugin.ruleName === ruleName;
}

/** One case in one syntax: the code Stylelint gets, its file, and how the case's own lines map onto it. */
export interface Source {
	syntax: Syntax;
	code: string;
	/** The file's path inside the project. */
	file: string;
	customSyntax: string | undefined;
	/** The lines the syntax puts before the case's CSS. */
	linesBefore: number;
	/** Puts CSS where the case's CSS stands. */
	wrap: (css: string) => string;
}

const vueBefore = "<template>\n\t<div></div>\n</template>\n\n<style>\n";
const vueAfter = "\n</style>\n";

export function sourceFor(syntax: Syntax, one: Pick<Case, "code" | "file">): Source {
	const css = dedent(one.code);
	const stem = (one.file ?? "src/button.css").replace(/\.css$/, "");
	switch (syntax) {
		case "css":
			return {
				syntax,
				code: css,
				file: `${stem}.css`,
				customSyntax: undefined,
				linesBefore: 0,
				wrap: (code) => code,
			};
		case "scss":
			return {
				syntax,
				code: css,
				file: `${stem}.scss`,
				customSyntax: "postcss-scss",
				linesBefore: 0,
				wrap: (code) => code,
			};
		case "vue": {
			const wrap = (code: string): string => `${vueBefore}${code}${vueAfter}`;
			return {
				syntax,
				code: wrap(css),
				file: `${stem}.vue`,
				customSyntax: "postcss-html",
				linesBefore: vueBefore.split("\n").length - 1,
				wrap,
			};
		}
	}
}

/** A test that runs in every syntax. A syntax the case doesn't translate to is skipped, with the reason in its name. */
export function inEverySyntax(
	name: string,
	one: Pick<Case, "code" | "file" | "skip">,
	test: (source: Source) => Promise<void>,
): void {
	describe(name, () => {
		for (const syntax of syntaxes) {
			const reason = one.skip?.[syntax];
			if (reason) it.skip(`${syntax}: ${reason}`, () => {});
			else it(syntax, () => test(sourceFor(syntax, one)));
		}
	});
}

export interface Linted {
	warnings: stylelint.Warning[];
	/** Invalid options and config errors, which Stylelint prints at the top of its output. */
	invalid: string[];
	/** The code after `--fix`. */
	code: string | undefined;
}

/** Lints one source as a file of a project. */
export async function lint(
	source: Source,
	project: string,
	config: stylelint.Config,
	fix = false,
): Promise<Linted> {
	const { results, code } = await stylelint.lint({
		code: source.code,
		codeFilename: path.join(project, source.file),
		config,
		fix,
		...(source.customSyntax ? { customSyntax: source.customSyntax } : {}),
	});
	const [result] = results;
	return {
		warnings: result?.warnings ?? [],
		invalid: (result?.invalidOptionWarnings ?? []).map((warning) => warning.text),
		code,
	};
}

/**
 * A project folder for the tests of one file, with its `statefulcss.config.json`. It's made before the tests run
 * and removed after them; the function returns its path.
 */
export function temporaryProject(settings: StatefulCSSConfig = {}): () => string {
	let folder = "";
	beforeAll(() => {
		folder = mkdtempSync(path.join(tmpdir(), "statefulcss-"));
		mkdirSync(path.join(folder, "src"), { recursive: true });
		writeFileSync(path.join(folder, "statefulcss.config.json"), `${JSON.stringify(settings, null, "\t")}\n`);
	});
	afterAll(() => {
		if (folder) rmSync(folder, { recursive: true, force: true });
	});
	return () => folder;
}

/** CSS as a test writes it in a template string, without its first and last blank lines and its shared indentation. */
export function dedent(code: string): string {
	const lines = code
		.replace(/^[ \t]*\n/, "")
		.replace(/\n[ \t]*$/, "")
		.split("\n");
	const indents = lines
		.filter((line) => line.trim() !== "")
		.map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
	const shared = indents.length > 0 ? Math.min(...indents) : 0;
	return lines.map((line) => line.slice(shared)).join("\n");
}
