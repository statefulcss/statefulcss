import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import stylelint from "stylelint";
import { afterAll, describe, expect, it } from "vitest";

import { defineRule, type Finding, type RuleDefinition } from "../rules/rule.js";
import { lint, sourceFor, temporaryProject, testRule } from "../testing/test-rule.js";
import { toPlugin } from "./plugin.js";

// The glue is tested with rules that exist only here. Each is as small as a rule can be: it asks core's model one
// question and reports the answer, so what's tested is the way from the model to Stylelint's output.

/** Reports every place a selector names a part, and the root of every scope a block is written in. */
const names: RuleDefinition<Record<never, never>, "part" | "scope"> = {
	name: "test-names",
	severity: "error",
	fixable: false,
	messages: {
		part: (name) => `Part "${name}"`,
		scope: (root) => `Scope of "${root}"`,
	},
	check(model) {
		const parts = model.partReferences.map((reference) => ({
			message: "part" as const,
			args: [reference.name ?? ""],
			at: reference.at,
		}));
		const scopes = model.blocks
			.filter((block) => block.reach === "scope")
			.flatMap((block) => block.path.slice(0, 1))
			.map((step) => ({ message: "scope" as const, args: [step.text], at: step.at }));
		return [...parts, ...scopes];
	},
};

testRule(names, {
	accept: [{ description: "a stylesheet that names no part", code: ".card { color: red; }" }],
	reject: [
		{
			description: "a part on the second line of a selector",
			code: `
				.card,
				.card [data-part="title"] {
					color: red;
				}
			`,
			warnings: [{ message: 'Part "title"', line: 2, column: 7, endLine: 2, endColumn: 26 }],
		},
		{
			description: "a part after a comment in the selector",
			code: `
				.card /* the heading */ [data-part="title"] { color: red; }
			`,
			warnings: [{ message: 'Part "title"', line: 1, column: 25, endLine: 1, endColumn: 44 }],
		},
		{
			description: "a part before a comment, which stays outside what's reported",
			code: `
				.card [data-part="title"] /* and its links */ a { color: red; }
			`,
			warnings: [{ message: 'Part "title"', line: 1, column: 7, endLine: 1, endColumn: 26 }],
		},
		{
			description:
				"a scope's root, in the at-rule's parameters, and a part on the line after its own rule starts",
			code: `
				@scope   (.card) to ([data-component]) {
					p,
					[data-part="title"] { color: red; }
				}
			`,
			warnings: [
				// One selector list, one scope: the root is said once for the two blocks.
				{ message: 'Scope of ".card"', line: 1, column: 11, endLine: 1, endColumn: 16 },
				{ message: 'Part "title"', line: 3, column: 2, endLine: 3, endColumn: 21 },
			],
		},
		{
			description: "a scope's root after an SCSS line comment",
			code: `
				@scope // the card
				  (.card) to ([data-component]) { p { color: red; } }
			`,
			skip: { css: "a line comment is SCSS", vue: "a line comment is SCSS" },
			warnings: [{ message: 'Scope of ".card"', line: 2, column: 4, endLine: 2, endColumn: 9 }],
		},
		{
			description: "a scope's root after a comment in the parameters",
			code: `
				@scope /* the card */ (.card) to ([data-component]) { p { color: red; } }
			`,
			warnings: [{ message: 'Scope of ".card"', line: 1, column: 24, endLine: 1, endColumn: 29 }],
		},
	],
});

/** Reports every `color` declaration three times: whole, on its property and on its value. */
const sides: RuleDefinition<Record<never, never>, "whole" | "property" | "value"> = {
	name: "test-sides",
	severity: "warning",
	fixable: false,
	messages: { whole: () => "Whole", property: () => "Property", value: () => "Value" },
	check(model) {
		const written = model.declarations.filter((one) => one.property === "color" && one.written === one.id);
		return written.flatMap(({ node }) => [
			{ message: "whole" as const, args: [], at: { node } },
			{ message: "property" as const, args: [], at: { node, part: "property" as const } },
			{
				message: "value" as const,
				args: [],
				at: { node, part: "value" as const },
				severity: "warning" as const,
			},
		]);
	},
};

testRule(sides, {
	reject: [
		{
			description: "a value with an SCSS line comment inside it",
			code: `
				.card { color: rgb(1 // red
				 2 3); }
			`,
			skip: { css: "a line comment is SCSS", vue: "a line comment is SCSS" },
			warnings: [
				{ message: "Whole", line: 1, column: 9, endLine: 2, endColumn: 7 },
				{ message: "Property", line: 1, column: 9, endLine: 1, endColumn: 14 },
				{ message: "Value", line: 1, column: 16, endLine: 2, endColumn: 6, severity: "warning" },
			],
		},
		{
			description: "a declaration, its property and its value",
			code: `
				.card:hover,
				.card:focus {
					color :  var(--s-color);
				}
			`,
			warnings: [
				{ message: "Whole", line: 3, column: 2, endLine: 3, endColumn: 26 },
				{ message: "Property", line: 3, column: 2, endLine: 3, endColumn: 7 },
				{ message: "Value", line: 3, column: 11, endLine: 3, endColumn: 25, severity: "warning" },
			],
		},
	],
});

/**
 * Renames the part `icon` to `glyph` wherever a selector names it, and a scope's root `.icon` to `.glyph`, and warns
 * about a part called `old`.
 */
const rename: RuleDefinition<Record<never, never>, "renamed" | "old"> = {
	name: "test-rename",
	severity: "error",
	fixable: true,
	messages: { renamed: () => 'Expected "glyph"', old: () => "Unexpected old part" },
	check(model) {
		const parts = model.partReferences.flatMap((reference): Finding<"renamed" | "old">[] => {
			if (reference.name === "old") return [{ message: "old", args: [], at: reference.at }];
			if (reference.name !== "icon" || !reference.nameAt) return [];
			const at = reference.nameAt;
			return [
				{
					message: "renamed",
					args: [],
					at,
					edits: [{ kind: "replace", at, expects: "icon", text: "glyph" }],
				},
			];
		});
		const roots = model.blocks
			.filter((block) => block.reach === "scope")
			.flatMap((block) => block.path.slice(0, 1))
			.filter((step) => step.text === ".icon")
			.map(({ at }): Finding<"renamed" | "old"> => ({
				message: "renamed",
				args: [],
				at,
				edits: [{ kind: "replace", at, expects: ".icon", text: ".glyph" }],
			}));
		return [...parts, ...roots];
	},
};

testRule(rename, {
	reject: [
		{
			description: "a fix after two comments side by side, one of which PostCSS leaves out",
			code: `
				.card /*one*//*two*/[data-part="icon"] { color: red; }
			`,
			warnings: [{ message: 'Expected "glyph"', line: 1, column: 33, endLine: 1, endColumn: 37 }],
			fixed: `
				.card /*one*//*two*/[data-part="glyph"] { color: red; }
			`,
		},
		{
			description: "a fix after an SCSS line comment, which stays a line comment",
			code: `
				.card // the card
				 [data-part="icon"] { color: red; }
			`,
			skip: { css: "a line comment is SCSS", vue: "a line comment is SCSS" },
			warnings: [{ message: 'Expected "glyph"', line: 2, column: 14, endLine: 2, endColumn: 18 }],
			fixed: `
				.card // the card
				 [data-part="glyph"] { color: red; }
			`,
		},
		{
			description: "two fixes in one selector, and a comment that stays",
			code: `
				.card [data-part="icon"] /* inside */ [data-part="icon"] { color: red; }
			`,
			warnings: [
				{ message: 'Expected "glyph"', line: 1, column: 19, endLine: 1, endColumn: 23 },
				{ message: 'Expected "glyph"', line: 1, column: 51, endLine: 1, endColumn: 55 },
			],
			fixed: `
				.card [data-part="glyph"] /* inside */ [data-part="glyph"] { color: red; }
			`,
		},
		{
			description: "a fix in an at-rule's parameters, made once for the two blocks of a selector list",
			code: `
				@scope /* the icon */ (.icon) to ([data-component]) { p, a { color: red; } }
			`,
			warnings: [{ message: 'Expected "glyph"', line: 1, column: 24, endLine: 1, endColumn: 29 }],
			fixed: `
				@scope /* the icon */ (.glyph) to ([data-component]) { p, a { color: red; } }
			`,
		},
	],
});

describe("the glue", () => {
	const project = temporaryProject();
	const configFor = (...rules: RuleDefinition[]): stylelint.Config => ({
		plugins: rules.map((rule) => toPlugin(rule)),
		rules: Object.fromEntries(rules.map((rule) => [`statefulcss/${rule.name}`, true])),
	});

	it("reports a problem after a fixed one where the file wrote it", async () => {
		const source = sourceFor("css", {
			code: '.card [data-part="icon"] [data-part="old"] { color: red; }',
		});
		const fixed = await lint(source, project(), configFor(rename), true);
		expect(fixed.code).toBe('.card [data-part="glyph"] [data-part="old"] { color: red; }');
		expect(fixed.warnings.map(({ text, column, endColumn }) => ({ text, column, endColumn }))).toEqual([
			{ text: "Unexpected old part (statefulcss/test-rename)", column: 26, endColumn: 43 },
		]);
	});

	it("leaves a fix that another fix has overtaken, and reports its problem", async () => {
		// The second rule wants the same text changed, after the first has changed it.
		const again: RuleDefinition = { ...rename, name: "test-rename-again" };
		const source = sourceFor("css", { code: '.card [data-part="icon"] { color: red; }' });
		const fixed = await lint(source, project(), configFor(rename, again), true);
		expect(fixed.code).toBe('.card [data-part="glyph"] { color: red; }');
		expect(fixed.warnings.map((warning) => warning.text)).toEqual([
			'Expected "glyph" (statefulcss/test-rename-again)',
		]);
	});

	it("reports where the file wrote it, whatever another rule's fix does to the selector meanwhile", async () => {
		// Stylelint's own rule adds the quotes while the settings load.
		const config: stylelint.Config = {
			...configFor(names),
			rules: { "statefulcss/test-names": true, "selector-attribute-quotes": "always" },
		};
		const source = sourceFor("css", { code: ".card[data-mode=x] [data-part=icon] { color: red; }" });
		for (const fix of [false, true]) {
			const { warnings } = await lint(source, project(), config, fix);
			expect(
				warnings
					.filter((warning) => warning.rule === "statefulcss/test-names")
					.map(({ column, endColumn }) => ({ column, endColumn })),
			).toEqual([{ column: 20, endColumn: 36 }]);
		}
	});

	it("leaves a fix alone when another rule has rewritten its node, and reports the problem", async () => {
		// A second plugin takes a prefix off the selector after the model is read, so the second name stands where
		// the first one stood.
		const ruleName = "test/remove-prefix";
		const removePrefix: stylelint.Rule = () => (root) => {
			root.walkRules((rule) => {
				rule.selector = rule.selector.replace(".prefix12345678901 ", "");
			});
		};
		removePrefix.ruleName = ruleName;
		removePrefix.messages = {};
		/** Renames only the first part a selector names. */
		const first: RuleDefinition = {
			...rename,
			check: (model, context) => rename.check(model, context).slice(0, 1),
		};
		const config: stylelint.Config = {
			plugins: [toPlugin(first), stylelint.createPlugin(ruleName, removePrefix)],
			rules: { "statefulcss/test-rename": true, [ruleName]: true },
		};
		const source = sourceFor("css", {
			code: '.prefix12345678901 .a [data-part="icon"] [data-part="icon"] { color: red; }',
		});
		const fixed = await lint(source, project(), config, true);
		expect(fixed.code).toBe('.a [data-part="icon"] [data-part="icon"] { color: red; }');
		expect(fixed.warnings.map(({ text, column, endColumn }) => ({ text, column, endColumn }))).toEqual([
			{ text: 'Expected "glyph" (statefulcss/test-rename)', column: 35, endColumn: 39 },
		]);
	});

	it("offers an editor a fix for one problem, but not in a .vue file", async () => {
		const config = configFor(rename);
		const fixOf = async (syntax: "css" | "vue") => {
			const source = sourceFor(syntax, { code: '.card [data-part="icon"] { color: red; }' });
			const { results } = await stylelint.lint({
				code: source.code,
				codeFilename: path.join(project(), source.file),
				config,
				computeEditInfo: true,
				...(source.customSyntax ? { customSyntax: source.customSyntax } : {}),
			});
			return results[0]?.warnings.map((warning) => warning.fix);
		};
		expect(await fixOf("css")).toEqual([{ range: [18, 22], text: "glyph" }]);
		expect(await fixOf("vue")).toEqual([undefined]);
		// `--fix` still renames it there.
		const vue = sourceFor("vue", { code: '.card [data-part="icon"] { color: red; }' });
		expect((await lint(vue, project(), config, true)).code).toBe(
			vue.wrap('.card [data-part="glyph"] { color: red; }'),
		);
	});

	it("honours a disable comment", async () => {
		const source = sourceFor("css", {
			code: `
				/* stylelint-disable-next-line statefulcss/test-names -- the title is styled here on purpose */
				.card [data-part="title"] { color: red; }
				.card [data-part="body"] { color: red; }
			`,
		});
		const { warnings } = await lint(source, project(), configFor(names));
		expect(warnings.map((warning) => warning.text)).toEqual(['Part "body" (statefulcss/test-names)']);
	});

	it("gives every rule its page, and says whether it fixes", async () => {
		const source = sourceFor("css", { code: '.card [data-part="icon"] { color: red; }' });
		const { ruleMetadata } = await stylelint.lint({ code: source.code, config: configFor(names, rename) });
		expect(ruleMetadata).toEqual({
			"statefulcss/test-names": { url: "https://statefulcss.com/docs/lint-rules/test-names", fixable: false },
			"statefulcss/test-rename": {
				url: "https://statefulcss.com/docs/lint-rules/test-rename",
				fixable: true,
			},
		});
	});

	it("lints code that has no file", async () => {
		const { results } = await stylelint.lint({
			code: '.card [data-part="title"] { color: red; }',
			config: configFor(names),
		});
		expect(results[0]?.warnings.map((warning) => warning.text)).toEqual([
			'Part "title" (statefulcss/test-names)',
		]);
	});
});

describe("a .vue file", () => {
	const project = temporaryProject();
	let checks = 0;
	/** Reports every read that reaches no variable in its component. */
	const reads: RuleDefinition<Record<never, never>, "unreached"> = {
		name: "test-reads",
		severity: "error",
		fixable: false,
		messages: { unreached: (name) => `Nothing declares "${name}"` },
		check(model) {
			checks++;
			return model.reads
				.filter(
					(read) => read.role === "state" && read.source === undefined && read.declaration !== undefined,
				)
				.flatMap((read) => {
					const declaration = model.declarations[read.declaration ?? -1];
					return declaration
						? [{ message: "unreached" as const, args: [read.name], at: { node: declaration.node } }]
						: [];
				});
		},
	};
	const config: stylelint.Config = {
		plugins: [toPlugin(reads, { failLoudly: true })],
		rules: { "statefulcss/test-reads": true },
	};
	const vue = (code: string) => ({
		syntax: "vue" as const,
		code,
		file: "src/Card.vue",
		customSyntax: "postcss-html",
		linesBefore: 0,
		wrap: (css: string) => css,
	});

	it("is analyzed once, so its plain blocks are read as one stylesheet", async () => {
		checks = 0;
		const code = [
			"<template><div></div></template>",
			"<style>",
			".card { --s-color: red; }",
			"</style>",
			"<style>",
			".card { color: var(--s-color); }",
			".link { color: var(--s-missing); }",
			"</style>",
			"<style scoped>",
			".card { color: var(--s-color); }",
			"</style>",
		].join("\n");
		const { warnings } = await lint(vue(code), project(), config);
		expect(checks).toBe(1);
		// Each finding is reported once, in the block that holds it: the scoped block doesn't see the plain one's variable.
		expect(warnings.map(({ text, line, column }) => ({ text, line, column }))).toEqual([
			{ text: 'Nothing declares "--s-missing" (statefulcss/test-reads)', line: 7, column: 9 },
			{ text: 'Nothing declares "--s-color" (statefulcss/test-reads)', line: 10, column: 9 },
		]);
	});
});

describe("a config that can't be used", () => {
	const folder = mkdtempSync(path.join(tmpdir(), "statefulcss-"));
	mkdirSync(path.join(folder, "src"));
	writeFileSync(path.join(folder, "statefulcss.config.json"), '{ "strct": true }\n');
	afterAll(() => rmSync(folder, { recursive: true, force: true }));

	it("is reported once for a file, as an invalid option, and no rule runs", async () => {
		const config: stylelint.Config = {
			plugins: [toPlugin(names), toPlugin(rename)],
			rules: { "statefulcss/test-names": true, "statefulcss/test-rename": true },
		};
		const source = sourceFor("css", { code: '.card [data-part="icon"] { color: red; }' });
		const { warnings, invalid } = await lint(source, folder, config);
		expect(warnings).toEqual([]);
		expect(invalid).toHaveLength(1);
		expect(invalid[0]).toContain('"strct"');
		expect(invalid[0]).toContain("strict");
	});

	it("is printed once for a run, and fails it", async () => {
		const config: stylelint.Config = {
			plugins: [toPlugin(names)],
			rules: { "statefulcss/test-names": true },
		};
		writeFileSync(path.join(folder, "src/a.css"), ".a { color: red; }\n");
		writeFileSync(path.join(folder, "src/b.css"), ".b { color: red; }\n");
		const { report, errored } = await stylelint.lint({
			files: [path.join(folder, "src/*.css")],
			config,
			formatter: "string",
		});
		expect(errored).toBe(true);
		expect(report.match(/Invalid Option:/g)).toHaveLength(1);
	});
});

describe("a fault of the plugin's own", () => {
	const project = temporaryProject();
	const broken = (name: string): RuleDefinition => ({
		name,
		severity: "error",
		fixable: false,
		messages: {},
		check() {
			throw new Error("the check went wrong");
		},
	});
	const source = sourceFor("css", { code: ".card { color: red; }" });

	it("is one warning on the file, asking for an issue", async () => {
		const config: stylelint.Config = {
			plugins: [toPlugin(broken("test-broken")), toPlugin(broken("test-broken-too")), toPlugin(names)],
			rules: {
				"statefulcss/test-broken": true,
				"statefulcss/test-broken-too": true,
				"statefulcss/test-names": true,
			},
		};
		const { warnings } = await lint(source, project(), config);
		expect(warnings.map(({ text, severity, line, column }) => ({ text, severity, line, column }))).toEqual([
			{
				text: "The Stateful CSS plugin couldn't check this file: the check went wrong. Please open an issue at https://github.com/statefulcss/statefulcss/issues (statefulcss/test-broken)",
				severity: "warning",
				line: 1,
				column: 1,
			},
		]);
	});

	const part: RuleDefinition = {
		name: "test-faulty",
		severity: "error",
		fixable: true,
		messages: {
			part: () => "Part",
			throws: () => {
				throw new Error("the message went wrong");
			},
		},
		check: (model) =>
			model.partReferences.map((reference) => ({
				message: reference.name ?? "",
				args: [],
				at: reference.at,
			})),
	};
	const faulty = async (name: string, loudly: boolean) => {
		const config: stylelint.Config = {
			plugins: [toPlugin(part, { failLoudly: loudly })],
			rules: { "statefulcss/test-faulty": true },
		};
		const code = `.card [data-part="${name}"] { color: red; }`;
		return (await lint(sourceFor("css", { code }), project(), config)).warnings.map(
			(warning) => warning.text,
		);
	};

	it("covers a finding whose message key the rule doesn't have", async () => {
		expect(await faulty("part", false)).toEqual(["Part (statefulcss/test-faulty)"]);
		expect(await faulty("misspelled", false)).toEqual([
			expect.stringContaining('check this file: "statefulcss/test-faulty" has no message "misspelled"'),
		]);
		await expect(faulty("misspelled", true)).rejects.toThrow('has no message "misspelled"');
	});

	it("covers a message that throws, and still reports the finding", async () => {
		expect(await faulty("throws", false)).toEqual([
			expect.stringContaining("check this file: the message went wrong"),
			"A problem this rule couldn't describe (statefulcss/test-faulty)",
		]);
		await expect(faulty("throws", true)).rejects.toThrow("the message went wrong");
	});

	it("covers a fix whose edits overlap, and leaves the tree alone", async () => {
		const overlapping: RuleDefinition = {
			...part,
			check: (model) =>
				model.partReferences.flatMap((reference) => {
					const at = reference.nameAt;
					if (!at) return [];
					const inside = { ...at, index: at.index + 1, endIndex: at.index + 3 };
					return [
						{
							message: "part",
							args: [],
							at,
							edits: [
								{ kind: "replace" as const, at, expects: "icon", text: "badge" },
								{ kind: "replace" as const, at: inside, expects: "co", text: "X" },
							],
						},
					];
				}),
		};
		const source = sourceFor("css", { code: '.card [data-part="icon"] { color: red; }' });
		const config = (loudly: boolean): stylelint.Config => ({
			plugins: [toPlugin(overlapping, { failLoudly: loudly })],
			rules: { "statefulcss/test-faulty": true },
		});
		const fixed = await lint(source, project(), config(false), true);
		expect(fixed.code).toBe(source.code);
		expect(fixed.warnings.map((warning) => warning.text)).toEqual([
			expect.stringContaining("has edits that overlap"),
			"Part (statefulcss/test-faulty)",
		]);
		await expect(lint(source, project(), config(true), true)).rejects.toThrow("has edits that overlap");
	});

	it("fails a test loudly", async () => {
		const config: stylelint.Config = {
			plugins: [toPlugin(broken("test-broken"), { failLoudly: true })],
			rules: { "statefulcss/test-broken": true },
		};
		await expect(lint(source, project(), config)).rejects.toThrow("the check went wrong");
	});
});

describe("a rule written with defineRule", () => {
	it("doesn't compile with a finding whose message key it doesn't have", () => {
		const rule = defineRule({
			name: "test-keys",
			severity: "error",
			fixable: false,
			messages: { part: () => "Part" },
			// @ts-expect-error -- "misspelled" is no key of the rule's messages.
			check: (model) => [
				...model.partReferences.map((reference) => ({
					message: "part" as const,
					args: [],
					at: reference.at,
				})),
				...model.partReferences.map((reference) => ({
					message: "misspelled" as const,
					args: [],
					at: reference.at,
				})),
			],
		});
		expect(Object.keys(rule.messages)).toEqual(["part"]);
	});
});

describe("a rule's options", () => {
	const project = temporaryProject();
	/** Reports every part whose name isn't in `ignoreParts`. */
	const picky: RuleDefinition<{ ignoreParts: readonly string[] }, "part"> = {
		name: "test-options",
		severity: "error",
		fixable: false,
		messages: { part: (name) => `Part "${name}"` },
		options: {
			ignoreParts: { default: [], accepts: (value) => typeof value === "string" },
		},
		check(model, { options }) {
			return model.partReferences
				.filter((reference) => !options.ignoreParts.includes(reference.name ?? ""))
				.map((reference) => ({ message: "part" as const, args: [reference.name ?? ""], at: reference.at }));
		},
	};
	const source = sourceFor("css", {
		code: '.card [data-part="title"] { color: red; } .card [data-part="body"] { color: red; }',
	});
	const withOptions = (options: unknown): stylelint.Config => ({
		plugins: [toPlugin(picky, { failLoudly: true })],
		rules: { "statefulcss/test-options": options === undefined ? true : [true, options] },
	});
	const texts = async (options: unknown) => {
		const { warnings, invalid } = await lint(source, project(), withOptions(options));
		return { warnings: warnings.map((warning) => warning.text), invalid };
	};

	it("uses the defaults when none is given", async () => {
		expect(await texts(undefined)).toEqual({
			warnings: ['Part "title" (statefulcss/test-options)', 'Part "body" (statefulcss/test-options)'],
			invalid: [],
		});
	});

	it("passes the rule's own options to its check, beside Stylelint's", async () => {
		expect(await texts({ ignoreParts: ["title"], severity: "warning" })).toEqual({
			warnings: ['Part "body" (statefulcss/test-options)'],
			invalid: [],
		});
	});

	it("refuses a value the option doesn't take, and an option the rule doesn't have", async () => {
		expect(await texts({ ignoreParts: [1] })).toEqual({
			warnings: [],
			invalid: ['Invalid value "1" for option "ignoreParts" of rule "statefulcss/test-options"'],
		});
		expect(await texts({ ignore: ["title"] })).toEqual({
			warnings: [],
			invalid: ['Invalid option name "ignore" for rule "statefulcss/test-options"'],
		});
	});

	it("names the project setting when one is written as a rule option", async () => {
		expect(await texts({ themeFiles: ["**/themes/**"] })).toEqual({
			warnings: [],
			invalid: [
				'"themeFiles" is a project setting, not an option of "statefulcss/test-options". Set it in statefulcss.config.json instead',
			],
		});
	});
});
