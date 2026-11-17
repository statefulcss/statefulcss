import { describe, expect, it } from "vitest";

import { lint, sourceFor, temporaryProject, testRule } from "../../testing/test-rule.js";
import { toPlugin } from "../../stylelint/plugin.js";
import variableRolePrefix from "./index.js";

testRule(variableRolePrefix, {
	accept: [
		// The rules page's Fixed cases.
		{
			description: "a variable with no role: a state changes it, so it's a state variable",
			code: `
				.button {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&:hover { --s-opacity: 0.9; }
				}
			`,
		},
		{
			description: "a prefix with no name",
			code: `[data-theme="default"] { --t-space-4: 1rem; }`,
		},
		{
			description: "a registered property with no role",
			code: `@property --_tabs-indicator-scale { syntax: "<number>"; inherits: false; initial-value: 1; }`,
		},
		{
			description: "writing a library's variable without saying so",
			code: `
				/**
				 * Gallery
				 * @sets --swiper-theme-color
				 */
				.gallery {
					--swiper-theme-color: var(--t-color-foreground-accent);
				}
			`,
		},
		{
			description: "@sets covers only the component right after it",
			code: `
				/**
				 * Gallery
				 * @sets --swiper-theme-color
				 */
				.gallery { --swiper-theme-color: var(--t-color-foreground-accent); }

				/**
				 * Card
				 * @sets --swiper-theme-color
				 */
				.card { --swiper-theme-color: var(--t-color-foreground-accent); }
			`,
		},
		// The plugin's design: writing a name listed only in `@reads` is reported (in the rejects).
		{
			description: "writing a library's variable listed only in @reads",
			code: `
				/**
				 * Popup
				 * @sets --available-width
				 */
				.popup { --available-width: 20rem; }
			`,
		},
		// The rules page's Not reported cases.
		{
			description: "reading a library's variable",
			code: `.popup { max-inline-size: var(--available-width); }`,
		},
		{
			description: "a line with Stylelint's disable comment and a reason",
			code: `
				.gallery {
					/* stylelint-disable-next-line statefulcss/variable-role-prefix -- Swiper reads this */
					--swiper-theme-color: var(--t-color-foreground-accent);
				}
			`,
		},
		// What the rule's checks imply.
		{
			description: "every role prefix with a name, in any casing after it",
			code: `
				.card {
					--c-gap: 1px;
					--s-opacity: 1;
					--p-title-color: black;
					--_backgroundColor: white;
					--q-orientation: horizontal;
				}
				[data-theme="default"] { --t-space-4: 1rem; }
			`,
		},
		{
			description: "@sets covers the component's scope, its parts included",
			code: `
				/**
				 * Gallery
				 * @sets --swiper-theme-color
				 */
				.gallery { }
				@scope (.gallery) to ([data-component]) {
					[data-part="slide"] { --swiper-theme-color: var(--t-color-foreground-accent); }
				}
			`,
		},
		{
			description: "a library's variable listed in both @sets and @reads",
			code: `
				/**
				 * Popup
				 * @sets --available-width
				 * @reads --available-width
				 */
				.popup { --available-width: 20rem; max-inline-size: var(--available-width); }
			`,
		},
		{
			description: "a utility",
			code: `@layer utilities { .u-stack { --gap: 1rem; gap: var(--gap); } }`,
		},
		{
			description: "what :deep() or :global() selects",
			code: `
				.gallery :deep(.swiper) { --swiper-theme-color: red; }
				.gallery :global(.swiper) { --swiper-theme-color: red; }
			`,
		},
		{
			description: "an SCSS variable, and a custom property whose name is interpolated",
			code: `
				$gap: 1rem;
				.card { --#{$name}: 1; --s-#{$state}: 2; }
			`,
			skip: { css: "SCSS interpolation", vue: "SCSS interpolation" },
		},
	],
	reject: [
		// The rules page's Reported cases.
		{
			description: "a variable with no role: a state changes it, so it's a state variable",
			code: `
				.button {
					--opacity: 1;
					opacity: var(--opacity);
					&:hover { --opacity: 0.9; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--opacity" with no role prefix. A variant or state changes it, so it\'s a state variable: name it "--s-opacity".',
					line: 2,
					column: 2,
					endLine: 2,
					endColumn: 11,
				},
				{
					message:
						'Unexpected "--opacity" with no role prefix. A variant or state changes it, so it\'s a state variable: name it "--s-opacity".',
					line: 4,
					column: 12,
					endLine: 4,
					endColumn: 21,
				},
			],
		},
		{
			description: "a prefix with no name",
			code: `[data-theme="default"] { --t-: 1rem; }`,
			warnings: [
				{
					message: 'Unexpected "--t-" with no name after its prefix. Add a name that says what it holds.',
					line: 1,
					column: 26,
					endLine: 1,
					endColumn: 30,
				},
			],
		},
		{
			description: "a registered property with no role",
			code: `@property --scale { syntax: "<number>"; inherits: false; initial-value: 1; }`,
			warnings: [
				{
					message:
						'Unexpected "--scale" registered with no role prefix. Name it with the prefix of its role: "--t-", "--c-", "--s-", "--p-", "--_" or "--q-".',
					line: 1,
					column: 11,
					endLine: 1,
					endColumn: 18,
				},
			],
		},
		{
			description: "writing a library's variable without saying so",
			code: `
				.gallery {
					--swiper-theme-color: var(--t-color-foreground-accent);
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--swiper-theme-color" with no role prefix. Name it "--_swiper-theme-color", a private, or list it in the component\'s "@sets" if a library reads it.',
					line: 2,
					column: 2,
					endLine: 2,
					endColumn: 22,
				},
			],
		},
		{
			description: "@sets covers only the component right after it",
			code: `
				/**
				 * Gallery
				 * @sets --swiper-theme-color
				 */
				.gallery { --swiper-theme-color: var(--t-color-foreground-accent); }

				.card { --swiper-theme-color: var(--t-color-foreground-accent); }
			`,
			warnings: [
				{
					message:
						'Unexpected "--swiper-theme-color" with no role prefix. Name it "--_swiper-theme-color", a private, or list it in the component\'s "@sets" if a library reads it.',
					line: 7,
					column: 9,
					endLine: 7,
					endColumn: 29,
				},
			],
		},
		// Rule 1 reports writing an unprefixed variable that is named only in `@reads` (the plugin's design).
		{
			description: "writing a library's variable listed only in @reads",
			code: `
				/**
				 * Popup
				 * @reads --available-width
				 */
				.popup { --available-width: 20rem; }
			`,
			warnings: [
				{
					message:
						'Unexpected "--available-width" written, but the component\'s doc comment lists it only in "@reads". List it in "@sets" to write it.',
					line: 5,
					column: 10,
					endLine: 5,
					endColumn: 27,
				},
			],
		},
		// The role the message suggests, from how the variable is used.
		{
			description: "a variable a style query reads: a query variable",
			code: `
				.tabs { --orientation: horizontal; }
				@scope (.tabs) to ([data-component]) {
					[data-part="list"] { @container style(--orientation: vertical) { flex-direction: column; } }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--orientation" with no role prefix. A style query reads it, so it\'s a query variable: name it "--q-orientation".',
					line: 1,
					column: 9,
					endLine: 1,
					endColumn: 22,
				},
			],
		},
		{
			description: "a variable a theme declares: a token",
			code: `[data-theme="espresso"] { --space-4: 1rem; }`,
			warnings: [
				{
					message:
						'Unexpected "--space-4" with no role prefix. A theme declares it, so it\'s a token: name it "--t-space-4".',
					line: 1,
					column: 27,
					endLine: 1,
					endColumn: 36,
				},
			],
		},
		{
			description: "a variable a component reads and something outside it sets: a component variable",
			code: `
				main { --gap: 1rem; }
				.card { gap: var(--gap); }
			`,
			warnings: [
				{
					message:
						'Unexpected "--gap" with no role prefix. A component reads it and it\'s set from outside, so it\'s a component variable: name it "--c-gap".',
					line: 1,
					column: 8,
					endLine: 1,
					endColumn: 13,
				},
			],
		},
		{
			description: "any other variable: a private",
			code: `:root { --brand: blue; }`,
			warnings: [
				{
					message:
						'Unexpected "--brand" with no role prefix. Name it "--_brand", a private, if it\'s used only where it\'s declared.',
					line: 1,
					column: 9,
					endLine: 1,
					endColumn: 16,
				},
			],
		},
		{
			description: "a registered property the file changes in a state: the state variable's message",
			code: `
				@property --angle { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
				.spinner { --angle: 0deg; &:hover { --angle: 90deg; } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--angle" with no role prefix. A variant or state changes it, so it\'s a state variable: name it "--s-angle".',
					line: 1,
					column: 11,
					endLine: 1,
					endColumn: 18,
				},
				{
					message:
						'Unexpected "--angle" with no role prefix. A variant or state changes it, so it\'s a state variable: name it "--s-angle".',
					line: 2,
					column: 12,
					endLine: 2,
					endColumn: 19,
				},
				{
					message:
						'Unexpected "--angle" with no role prefix. A variant or state changes it, so it\'s a state variable: name it "--s-angle".',
					line: 2,
					column: 37,
					endLine: 2,
					endColumn: 44,
				},
			],
		},
		{
			description: "a registered prefix with no name",
			code: `@property --_ { syntax: "*"; inherits: false; }`,
			warnings: [
				{
					message: 'Unexpected "--_" with no name after its prefix. Add a name that says what it holds.',
					line: 1,
					column: 11,
					endLine: 1,
					endColumn: 14,
				},
			],
		},
		{
			description: "a name written on several lines of a selector list, reported once",
			code: `
				.card,
				.button {
					--opacity: 1;
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--opacity" with no role prefix. Name it "--_opacity", a private, or list it in the component\'s "@sets" if a library reads it.',
					line: 3,
					column: 2,
					endLine: 3,
					endColumn: 11,
				},
			],
		},
		{
			description: "a prefix in the wrong case",
			code: `.card { --S-opacity: 1; }`,
			warnings: [
				{
					message:
						'Unexpected "--S-opacity" with no role prefix. Name it "--_S-opacity", a private, or list it in the component\'s "@sets" if a library reads it.',
					line: 1,
					column: 9,
					endLine: 1,
					endColumn: 20,
				},
			],
		},
	],
});

// The rules page's Not reported case for `ignoreProperties`, and Stylelint's conventions for the option.
testRule(variableRolePrefix, {
	options: { ignoreProperties: ["/^--swiper-/", "--legacy-gap", "/^--vendor-/i", /^--ext-/] },
	accept: [
		{
			description: "writing a variable ignoreProperties matches, for a library used in many files",
			code: `.gallery { --swiper-theme-color: var(--t-color-foreground-accent); }`,
		},
		{
			description: "a name, a /regex/i string and a regular expression",
			code: `:root { --legacy-gap: 1px; --VENDOR-x: 1; --ext-y: 2; }`,
		},
		{
			description: "a registered property ignoreProperties matches",
			code: `@property --swiper-progress { syntax: "<number>"; inherits: true; initial-value: 0; }`,
		},
	],
	reject: [
		{
			description: "a name matches only itself, exactly",
			code: `:root { --legacy-gap-2: 1px; }`,
			warnings: [
				{
					message:
						'Unexpected "--legacy-gap-2" with no role prefix. Name it "--_legacy-gap-2", a private, if it\'s used only where it\'s declared.',
					line: 1,
					column: 9,
					endLine: 1,
					endColumn: 23,
				},
			],
		},
	],
});

// One pattern on its own, as Stylelint's own rules take it, is a list of one.
testRule(variableRolePrefix, {
	options: { ignoreProperties: "/^--swiper-/" },
	accept: [
		{
			description: "ignoreProperties given one pattern on its own",
			code: `.gallery { --swiper-theme-color: var(--t-color-foreground-accent); }`,
		},
	],
	reject: [
		{
			description: "a name the one pattern doesn't match",
			code: `.gallery { --theme-color: red; }`,
			warnings: [
				{
					message:
						'Unexpected "--theme-color" with no role prefix. Name it "--_theme-color", a private, or list it in the component\'s "@sets" if a library reads it.',
					line: 1,
					column: 12,
					endLine: 1,
					endColumn: 25,
				},
			],
		},
	],
});

describe("statefulcss/variable-role-prefix's options", () => {
	const project = temporaryProject();
	const invalidFor = async (ignoreProperties: unknown): Promise<string[]> => {
		const { invalid } = await lint(sourceFor("css", { code: ":root { --brand: blue; }" }), project(), {
			plugins: [toPlugin(variableRolePrefix, { failLoudly: true })],
			rules: { "statefulcss/variable-role-prefix": [true, { ignoreProperties }] },
		});
		return invalid;
	};

	it("refuses an item that's neither a name nor a pattern", async () => {
		expect(await invalidFor([1])).toEqual([
			'Invalid value "1" for option "ignoreProperties" of rule "statefulcss/variable-role-prefix"',
		]);
		expect(await invalidFor({ name: "--brand" })).toEqual([
			'Invalid value "{"name":"--brand"}" for option "ignoreProperties" of rule "statefulcss/variable-role-prefix"',
		]);
	});

	it("refuses a /regex/ string that doesn't compile", async () => {
		expect(await invalidFor(["/^--swiper-(/"])).toEqual([
			'Invalid value "/^--swiper-(/" for option "ignoreProperties" of rule "statefulcss/variable-role-prefix"',
		]);
	});
});
