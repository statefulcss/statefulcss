import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import postcss, { type Rule } from "postcss";
import stylelint from "stylelint";
import { afterAll, describe, expect, it } from "vitest";

import { defineRule, type Finding, type RuleDefinition } from "../rules/rule.js";
import { lint, sourceFor, temporaryProject, testRule } from "../testing/test-rule.js";
import { rulesUrl, toPlugin } from "./plugin.js";

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
				@scope (.card) to ([data-component]) { :scope > /*one*//*two*/[data-part="icon"] { color: red; } }
			`,
			warnings: [{ message: 'Expected "glyph"', line: 1, column: 75, endLine: 1, endColumn: 79 }],
			fixed: `
				@scope (.card) to ([data-component]) { :scope > /*one*//*two*/[data-part="glyph"] { color: red; } }
			`,
		},
		{
			description: "a fix after an SCSS line comment, which stays a line comment",
			code: `
				@scope (.card) to ([data-component]) {
					:scope > // the part
					 [data-part="icon"] { color: red; }
				}
			`,
			skip: { css: "a line comment is SCSS", vue: "a line comment is SCSS" },
			warnings: [{ message: 'Expected "glyph"', line: 3, column: 15, endLine: 3, endColumn: 19 }],
			fixed: `
				@scope (.card) to ([data-component]) {
					:scope > // the part
					 [data-part="glyph"] { color: red; }
				}
			`,
		},
		{
			description: "two fixes in one selector, and a comment that stays",
			code: `
				@scope (.card) to ([data-component]) { :scope > [data-part="icon"] /* inside */ [data-part="icon"] { color: red; } }
			`,
			warnings: [
				{ message: 'Expected "glyph"', line: 1, column: 61, endLine: 1, endColumn: 65 },
				{ message: 'Expected "glyph"', line: 1, column: 93, endLine: 1, endColumn: 97 },
			],
			fixed: `
				@scope (.card) to ([data-component]) { :scope > [data-part="glyph"] /* inside */ [data-part="glyph"] { color: red; } }
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

/**
 * Wraps each run of nested `&:hover` and `&:active` rules with no guard in `&:where(:not(:disabled))`. Every rule of a
 * run reports, and carries the same wrap.
 */
const guard: RuleDefinition<Record<never, never>, "unguarded"> = defineRule({
	name: "test-guard",
	severity: "error",
	fixable: true,
	messages: { unguarded: () => "Expected a guard" },
	check(model) {
		const unguarded = new Set(
			model.blocks.flatMap((block) =>
				block.node.type === "rule" &&
				block.guard === undefined &&
				/^&:(?:hover|active)$/.test(block.node.selector)
					? [block.node]
					: [],
			),
		);
		const findings: Finding<"unguarded">[] = [];
		for (const rule of unguarded) {
			const siblings = rule.parent?.nodes ?? [];
			let start = siblings.indexOf(rule);
			while (start > 0 && unguarded.has(siblings[start - 1] as Rule)) start -= 1;
			let end = siblings.indexOf(rule);
			while (unguarded.has(siblings[end + 1] as Rule)) end += 1;
			const rules = siblings.slice(start, end + 1) as Rule[];
			findings.push({
				message: "unguarded",
				args: [],
				at: { node: rule },
				edits: [{ kind: "wrap", rules, selector: "&:where(:not(:disabled))" }],
			});
		}
		return findings;
	},
});

testRule(guard, {
	reject: [
		{
			description: "rules on lines of their own move one level deeper, in their order",
			code: `
				.button {
					--s-color: red;
					color: var(--s-color);

					&:hover { --s-color: blue; }
					&:active {
						--s-color: green;
					}
					&:focus-visible { --s-color: black; }
				}
			`,
			warnings: [
				{ message: "Expected a guard", line: 5, column: 2 },
				{ message: "Expected a guard", line: 6, column: 2 },
			],
			fixed: `
				.button {
					--s-color: red;
					color: var(--s-color);

					&:where(:not(:disabled)) {
						&:hover { --s-color: blue; }
						&:active {
							--s-color: green;
						}
					}
					&:focus-visible { --s-color: black; }
				}
			`,
		},
		{
			description: "rules on one line stay on it",
			code: `
				.button { --s-color: red; color: var(--s-color); &:hover { --s-color: blue; } }
			`,
			warnings: [{ message: "Expected a guard", line: 1, column: 50 }],
			fixed: `
				.button { --s-color: red; color: var(--s-color); &:where(:not(:disabled)) { &:hover { --s-color: blue; } } }
			`,
		},
		{
			description: "indentation of two spaces, inside a media query",
			code: `
				.button {
				  --s-color: red;
				  color: var(--s-color);
				  @media (hover: hover) {
				    &:hover { --s-color: blue; }
				  }
				}
			`,
			warnings: [{ message: "Expected a guard", line: 5, column: 5 }],
			fixed: `
				.button {
				  --s-color: red;
				  color: var(--s-color);
				  @media (hover: hover) {
				    &:where(:not(:disabled)) {
				      &:hover { --s-color: blue; }
				    }
				  }
				}
			`,
		},
		{
			description: "two runs apart, each wrapped on its own",
			code: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:hover { --s-color: blue; }
					&[aria-pressed="true"] { --s-color: green; }
					&:active { --s-color: black; }
				}
			`,
			warnings: [
				{ message: "Expected a guard", line: 4, column: 2 },
				{ message: "Expected a guard", line: 6, column: 2 },
			],
			fixed: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:where(:not(:disabled)) {
						&:hover { --s-color: blue; }
					}
					&[aria-pressed="true"] { --s-color: green; }
					&:where(:not(:disabled)) {
						&:active { --s-color: black; }
					}
				}
			`,
		},
		// The wrapper is the file's own, with nothing taken from the first rule's spelling.
		{
			description: "a file with CRLF line endings keeps them",
			code: [
				".button {",
				"\t--s-color: red;",
				"\tcolor: var(--s-color);",
				"\t&:hover { --s-color: blue; }",
				"}",
			].join("\r\n"),
			warnings: [{ message: "Expected a guard", line: 4, column: 2 }],
			fixed: [
				".button {",
				"\t--s-color: red;",
				"\tcolor: var(--s-color);",
				"\t&:where(:not(:disabled)) {",
				"\t\t&:hover { --s-color: blue; }",
				"\t}",
				"}",
			].join("\r\n"),
		},
		{
			description: "a comment before the first rule's brace stays on that rule, not the wrapper",
			code: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:hover /* for the label */ { --s-color: blue; }
				}
			`,
			warnings: [{ message: "Expected a guard", line: 4, column: 2 }],
			fixed: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:where(:not(:disabled)) {
						&:hover /* for the label */ { --s-color: blue; }
					}
				}
			`,
		},
		{
			description:
				"a line comment before the first rule's brace stays on that rule, its brace one level deeper",
			skip: { css: "a line comment is SCSS", vue: "a line comment is SCSS" },
			code: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:hover // for the label
					{ --s-color: blue; }
				}
			`,
			warnings: [{ message: "Expected a guard", line: 4, column: 2 }],
			fixed: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:where(:not(:disabled)) {
						&:hover // for the label
						{ --s-color: blue; }
					}
				}
			`,
		},
		{
			description: "the first rule's optional semicolon stays on it, and the wrapper gets none",
			code: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:hover { --s-color: blue; };
				}
			`,
			warnings: [{ message: "Expected a guard", line: 4, column: 2 }],
			fixed: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:where(:not(:disabled)) {
						&:hover { --s-color: blue; };
					}
				}
			`,
		},
		// What a moved rule holds moves with it, byte for byte, one level deeper.
		{
			description: "a moved rule keeps its comments and the at-rules nested in it",
			code: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:hover {
						/* the label's color */
						--s-color: blue;
						@media (prefers-contrast: more) {
							/* darker */
							--s-color: navy;
						}
					}
					&:active { --s-color: green; }
				}
			`,
			warnings: [
				{ message: "Expected a guard", line: 4, column: 2 },
				{ message: "Expected a guard", line: 12, column: 2 },
			],
			fixed: `
				.button {
					--s-color: red;
					color: var(--s-color);
					&:where(:not(:disabled)) {
						&:hover {
							/* the label's color */
							--s-color: blue;
							@media (prefers-contrast: more) {
								/* darker */
								--s-color: navy;
							}
						}
						&:active { --s-color: green; }
					}
				}
			`,
		},
	],
});

/** Renames every part `icon` to `glyph` in one finding, wherever the file names it. */
const renameAll: RuleDefinition<Record<never, never>, "renamed"> = defineRule({
	name: "test-rename-all",
	severity: "error",
	fixable: true,
	messages: { renamed: () => 'Expected "glyph"' },
	check(model) {
		const edits = model.partReferences.flatMap((reference) =>
			reference.name === "icon" && reference.nameAt
				? [{ kind: "replace" as const, at: reference.nameAt, expects: "icon", text: "glyph" }]
				: [],
		);
		const [first] = edits;
		return first ? [{ message: "renamed", args: [], at: first.at, edits }] : [];
	},
});

describe("the glue", () => {
	const project = temporaryProject();
	const configFor = (...rules: RuleDefinition[]): stylelint.Config => ({
		plugins: rules.map((rule) => toPlugin(rule)),
		rules: Object.fromEntries(rules.map((rule) => [`statefulcss/${rule.name}`, true])),
	});

	// With `--fix`, Stylelint runs the rules again on the fixed code until a pass fixes nothing, and reports what the
	// last pass found, where the fixed code has it.
	it("reports a problem after a fixed one where the fixed code has it", async () => {
		const source = sourceFor("css", {
			code: '.card [data-part="icon"] [data-part="old"] { color: red; }',
		});
		const fixed = await lint(source, project(), configFor(rename), true);
		expect(fixed.code).toBe('.card [data-part="glyph"] [data-part="old"] { color: red; }');
		expect(fixed.warnings.map(({ text, column, endColumn }) => ({ text, column, endColumn }))).toEqual([
			{ text: "Unexpected old part (statefulcss/test-rename)", column: 27, endColumn: 44 },
		]);
	});

	it("leaves a fix that another fix has overtaken", async () => {
		// The second rule wants the same text changed, after the first has changed it. The next pass finds nothing.
		const again: RuleDefinition = { ...rename, name: "test-rename-again" };
		const source = sourceFor("css", { code: '.card [data-part="icon"] { color: red; }' });
		const fixed = await lint(source, project(), configFor(rename, again), true);
		expect(fixed.code).toBe('.card [data-part="glyph"] { color: red; }');
		expect(fixed.warnings).toEqual([]);
	});

	it("reports where the code it reads has it, whatever another rule's fix does to the selector meanwhile", async () => {
		// Stylelint's own rule adds the quotes while the settings load.
		const config: stylelint.Config = {
			...configFor(names),
			rules: { "statefulcss/test-names": true, "selector-attribute-quotes": "always" },
		};
		const source = sourceFor("css", { code: ".card[data-mode=x] [data-part=icon] { color: red; }" });
		const columnsOf = async (fix: boolean) =>
			(await lint(source, project(), config, fix)).warnings
				.filter((warning) => warning.rule === "statefulcss/test-names")
				.map(({ column, endColumn }) => ({ column, endColumn }));
		// `[data-part=icon]` as written, and `[data-part="icon"]` in the fixed code.
		expect(await columnsOf(false)).toEqual([{ column: 20, endColumn: 36 }]);
		expect(await columnsOf(true)).toEqual([{ column: 22, endColumn: 40 }]);
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

	// PostCSS counts offsets without the byte order mark, and the editor's text has it.
	it("offers an editor no fix in a file that starts with a byte order mark, and --fix still makes it", async () => {
		const config = configFor(guard);
		const code = ".button { &:hover { color: blue; } }";
		const wrapped = ".button { &:where(:not(:disabled)) { &:hover { color: blue; } } }";
		for (const syntax of ["css", "scss", "vue"] as const) {
			const plain = sourceFor(syntax, { code });
			// The mark starts the file, before a `.vue` file's template too.
			const marked = { ...plain, code: `\uFEFF${plain.code}` };
			const fixOf = async (source: typeof plain) => {
				const { results } = await stylelint.lint({
					code: source.code,
					codeFilename: path.join(project(), source.file),
					config,
					computeEditInfo: true,
					...(source.customSyntax ? { customSyntax: source.customSyntax } : {}),
				});
				return results[0]?.warnings.map((warning) => warning.fix);
			};
			expect(await fixOf(marked)).toEqual([undefined]);
			expect((await lint(marked, project(), config, true)).code?.replace(/^\uFEFF/, "")).toBe(
				plain.wrap(wrapped),
			);
			// The control: with no mark, an editor gets the fix, except in a `.vue` file, and applying it wraps the hover.
			const [fix] = (await fixOf(plain)) ?? [];
			if (syntax === "vue") expect(fix).toBeUndefined();
			else expect(fix && code.slice(0, fix.range[0]) + fix.text + code.slice(fix.range[1])).toBe(wrapped);
		}
	});

	it("gives an editor one fix that holds every node the fix changes", async () => {
		const editorFix = async (rule: RuleDefinition, code: string) => {
			const source = sourceFor("css", { code });
			const config = configFor(rule);
			const { results } = await stylelint.lint({
				code: source.code,
				codeFilename: path.join(project(), source.file),
				config,
				computeEditInfo: true,
			});
			const fixes = (results[0]?.warnings ?? []).flatMap((warning) => (warning.fix ? [warning.fix] : []));
			const edited = fixes.reduceRight(
				(text, { range: [start, end], text: inserted }) => text.slice(0, start) + inserted + text.slice(end),
				source.code,
			);
			return { count: fixes.length, edited, fixed: (await lint(source, project(), config, true)).code };
		};

		// One finding renames two rules.
		const renamed = await editorFix(
			renameAll,
			'.card [data-part="icon"] { color: red; }\n.link [data-part="icon"] { color: blue; }',
		);
		expect(renamed.edited).toBe(
			'.card [data-part="glyph"] { color: red; }\n.link [data-part="glyph"] { color: blue; }',
		);
		expect(renamed).toMatchObject({ count: 1, fixed: renamed.edited });

		// A wrap changes the rule around the rules it moves; two findings carry it, and the first gets the fix.
		const wrapped = await editorFix(
			guard,
			".button {\n\t&:hover { color: blue; }\n\t&:active { color: red; }\n}",
		);
		expect(wrapped.edited).toBe(
			".button {\n\t&:where(:not(:disabled)) {\n\t\t&:hover { color: blue; }\n\t\t&:active { color: red; }\n\t}\n}",
		);
		expect(wrapped).toMatchObject({ count: 1, fixed: wrapped.edited });
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
			"statefulcss/test-names": { url: `${rulesUrl}/test-names/README.md`, fixable: false },
			"statefulcss/test-rename": {
				url: `${rulesUrl}/test-rename/README.md`,
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
	/** Reports every part whose name isn't in `ignoreParts`, with `label` before its name. */
	const picky: RuleDefinition<{ ignoreParts: readonly string[]; label: string }, "part"> = {
		name: "test-options",
		severity: "error",
		fixable: false,
		messages: { part: (label, name) => `${label} "${name}"` },
		options: {
			ignoreParts: { default: [], accepts: (value) => typeof value === "string" },
			label: { default: "Part", accepts: (value) => typeof value === "string" },
		},
		check(model, { options }) {
			return model.partReferences
				.filter((reference) => !options.ignoreParts.includes(reference.name ?? ""))
				.map((reference) => ({
					message: "part" as const,
					args: [options.label, reference.name ?? ""],
					at: reference.at,
				}));
		},
	};
	const source = sourceFor("css", {
		code: '.card [data-part="title"] { color: red; } .card [data-part="body"] { color: red; }',
	});
	const withOptions = (options: unknown, rule: RuleDefinition = picky): stylelint.Config => ({
		plugins: [toPlugin(rule, { failLoudly: true })],
		rules: { [`statefulcss/${rule.name}`]: options === undefined ? true : [true, options] },
	});
	const texts = async (options: unknown, rule: RuleDefinition = picky, from = source) => {
		const { warnings, invalid } = await lint(from, project(), withOptions(options, rule));
		return { warnings: warnings.map((warning) => warning.text), invalid };
	};

	it("uses the defaults when none is given", async () => {
		expect(await texts(undefined)).toEqual({
			warnings: ['Part "title" (statefulcss/test-options)', 'Part "body" (statefulcss/test-options)'],
			invalid: [],
		});
	});

	it("passes the rule's own options to its check, beside Stylelint's", async () => {
		expect(await texts({ ignoreParts: ["title"], label: "Piece", severity: "warning" })).toEqual({
			warnings: ['Piece "body" (statefulcss/test-options)'],
			invalid: [],
		});
	});

	it("takes one item where a list is expected, as a list of it", async () => {
		// Passed on as the string, `"title".includes("itle")` would exempt a part named "itle" too.
		const parts = sourceFor("css", {
			code: '.card [data-part="title"] { color: red; } .card [data-part="itle"] { color: red; }',
		});
		expect(await texts({ ignoreParts: "title" }, picky, parts)).toEqual({
			warnings: ['Part "itle" (statefulcss/test-options)'],
			invalid: [],
		});
	});

	it("refuses a value the option doesn't take, and an option the rule doesn't have", async () => {
		expect(await texts({ ignoreParts: [1] })).toEqual({
			warnings: [],
			invalid: ['Invalid value "1" for option "ignoreParts" of rule "statefulcss/test-options"'],
		});
		expect(await texts({ ignoreParts: [["title"]] })).toEqual({
			warnings: [],
			invalid: ['Invalid value "["title"]" for option "ignoreParts" of rule "statefulcss/test-options"'],
		});
		expect(await texts({ ignore: ["title"] })).toEqual({
			warnings: [],
			invalid: ['Invalid option name "ignore" for rule "statefulcss/test-options"'],
		});
	});

	it("refuses a list given to an option that takes one value", async () => {
		expect(await texts({ label: ["Piece"] })).toEqual({
			warnings: [],
			invalid: ['Invalid value "["Piece"]" for option "label" of rule "statefulcss/test-options"'],
		});
	});

	it("refuses secondary options that aren't an object, whether the rule has options or not", async () => {
		for (const rule of [picky, names]) {
			const ruleName = `statefulcss/${rule.name}`;
			expect(await texts(42, rule)).toEqual({
				warnings: [],
				invalid: [`Invalid option value "42" for rule "${ruleName}": should be an object`],
			});
			expect(await texts("ignored", rule)).toEqual({
				warnings: [],
				invalid: [`Invalid option value "ignored" for rule "${ruleName}": should be an object`],
			});
			expect(await texts(["title"], rule)).toEqual({
				warnings: [],
				invalid: [`Invalid option value "["title"]" for rule "${ruleName}": should be an object`],
			});
		}
	});

	it("refuses falsy secondary options, and with validation off reports with the rule's own messages", async () => {
		for (const rule of [picky, names]) {
			const ruleName = `statefulcss/${rule.name}`;
			for (const secondary of [null, false, 0, ""]) {
				// Stylelint keeps a falsy container as the rule's custom message, which used to abort the whole lint.
				expect(await texts(secondary, rule)).toEqual({
					warnings: [],
					invalid: [
						`Invalid option value ${JSON.stringify(String(secondary))} for rule "${ruleName}": should be an object`,
					],
				});
				const { results } = await stylelint.lint({
					code: source.code,
					codeFilename: path.join(project(), source.file),
					config: withOptions(secondary, rule),
					validate: false,
				});
				const [result] = results;
				expect(result?.invalidOptionWarnings).toEqual([]);
				expect(result?.warnings.map((warning) => warning.text)).toEqual(
					rule === picky
						? ['Part "title" (statefulcss/test-options)', 'Part "body" (statefulcss/test-options)']
						: ['Part "title" (statefulcss/test-names)', 'Part "body" (statefulcss/test-names)'],
				);
			}
		}
	});

	it("gives the check its declared types when validation is off", async () => {
		const { results } = await stylelint.lint({
			code: source.code,
			codeFilename: path.join(project(), source.file),
			config: withOptions({ ignoreParts: [1, "title"], label: ["Piece"] }),
			validate: false,
		});
		const [result] = results;
		expect(result?.invalidOptionWarnings).toEqual([]);
		expect(result?.warnings.map((warning) => warning.text)).toEqual([
			'Part "title" (statefulcss/test-options)',
			'Part "body" (statefulcss/test-options)',
		]);
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

describe("the same PostCSS root linted again", () => {
	const project = temporaryProject();
	const ruleName = "statefulcss/test-names";

	it("gets a new model each time, so a change shows", async () => {
		const processor = postcss([
			stylelint({ config: { plugins: [toPlugin(names)], rules: { [ruleName]: true } } }),
		]);
		const from = path.join(project(), "src/card.css");
		const root = postcss.parse('.card [data-part="title"] { color: red; }', { from });
		const texts = async (): Promise<unknown[]> =>
			(await processor.process(root, { from })).messages
				.filter((message) => message["rule"] === ruleName)
				.map((message) => message["text"]);
		expect(await texts()).toEqual(['Part "title" (statefulcss/test-names)']);
		root.walkRules((rule) => {
			rule.selector = '.card [data-part="body"]';
		});
		expect(await texts()).toEqual(['Part "body" (statefulcss/test-names)']);
		root.walkRules((rule) => {
			rule.selector = ".card p";
		});
		expect(await texts()).toEqual([]);
	});
});
