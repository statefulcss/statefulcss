import { describe, expect, it } from "vitest";

import { toPlugin } from "../../stylelint/plugin.js";
import {
	type ExpectedWarning,
	lint,
	sourceFor,
	temporaryProject,
	testRule,
} from "../../testing/test-rule.js";
import noAbbreviations from "./index.js";
import { abbreviations, fullSize } from "./words.js";

/** A warning on one line, from `column` to `endColumn`. */
function on(message: string, line: number, column: number, endColumn: number): ExpectedWarning {
	return { message, line, column, endLine: line, endColumn };
}

testRule(noAbbreviations, {
	accept: [
		// The rules page's Fixed cases.
		{
			description: "an abbreviation in a token's name",
			code: `[data-theme="default"] { --t-color-background-accent: blue; }`,
		},
		{
			description: "an abbreviation in a component's class",
			code: `.button { display: flex; }`,
		},
		{
			description: "an abbreviation in a component variable's name",
			code: `.page { --c-card-padding: var(--t-space-1); }`,
		},
		{
			description: "an attribute name and an attribute value the CSS selects on",
			code: `
				.button {
					&[data-emphasis="primary"] { color: red; }
				}
			`,
		},
		// The rules page's Not reported cases.
		{
			description: "HTML element names",
			code: `.header { --c-nav-link-color: red; --c-header-img-size: 2rem; --c-header-svg-width: 1rem; }`,
		},
		{
			description: "coordinates and numbers",
			code: `
				.tooltip { --c-tooltip-offset-x: 0; --c-tooltip-offset-y: 0; }
				[data-theme="default"] { --t-space-2: 0.5rem; }
			`,
		},
		{
			description: "CSS's own words and units",
			code: `
				.card { --c-card-max-width: 10rem; --c-card-min-height: 2rem; }
				[data-theme="default"] { --t-space-px: 1px; --t-color-rgb-accent: 0 0 255; --t-size-calc-base: 1rem; }
			`,
		},
		{
			description: "T-shirt sizes, by default",
			code: `
				.button { &[data-size="sm"] { padding: 0; } }
				[data-theme="default"] { --t-space-md: 1rem; --t-radius-xl: 1rem; --t-font-size-2xl: 2rem; --t-space-xxs: 1px; }
			`,
		},
		{
			description: "private names, by default",
			code: `.card { --_pad: var(--t-space-1); padding: var(--_pad); }`,
		},
		// Beyond the rules page.
		{
			description: "a word on the list inside a longer word",
			code: `.page { --c-page-padding: 0; --c-page-header-width: 0; --c-page-description-color: red; }`,
		},
		{
			description: "utilities, where short names earn their place",
			code: `
				@layer utilities {
					.btn-sm { padding: 0; }
					.u-bg[data-sz="x"] { --c-bg: red; }
				}
			`,
		},
		{
			description: "the platform's attributes and their values",
			code: `
				.field {
					&[aria-label="Clear msg"] { color: red; }
					&[type="tel"] { color: blue; }
				}
			`,
		},
		{
			description: "a class that names no component",
			code: `.card .btn-icon { color: red; }`,
		},
		{
			description: "what :global() and :deep() select",
			code: `
				.card {
					:global(.btn) { color: red; }
					:deep([data-sz="sm"]) { color: blue; }
				}
			`,
		},
		{
			description:
				"an attribute a setting names, and an abbreviation inside a string that isn't an attribute's",
			code: `
				.card {
					&[data-component] { color: red; }
					&::after { content: "btn"; }
				}
			`,
		},
		{
			description: "pad as a noun, outside a custom property's name",
			code: `
				.signature-pad { display: block; }
				.number-pad { display: grid; }
				.drum { &[data-kind="pad"] { color: red; } }
			`,
		},
		{
			description: "a value matched in part, and language and locale codes",
			code: `
				.file {
					&[data-file$=".txt"] { color: red; }
					&[data-name^="btn"] { color: red; }
					&[data-path*="img/bg"] { color: red; }
					&[data-region|="sec"] { color: red; }
					&[data-lang="bg"] { color: red; }
					&[data-ui-locale="bg"] { color: red; }
					&[data-language="bg"] { color: red; }
				}
			`,
		},
		{
			description: "comments inside a selector and a scope's root",
			code: `
				.card { display: grid; }
				.card/* old [data-btn=prim] */:hover { color: red; }
				@scope (.card/* [data-btn=prim] */) to ([data-component]) {
					p { color: red; }
				}
			`,
		},
		{
			description: "a name SCSS builds",
			code: `
				$side: pad;
				.card { --c-card-#{$side}: 1rem; }
			`,
			skip: { css: "SCSS interpolation", vue: "SCSS interpolation" },
		},
	],
	reject: [
		// The rules page's Reported cases.
		{
			description: "an abbreviation in a token's name",
			code: `[data-theme="default"] { --t-bg-accent: blue; }`,
			warnings: [
				on(
					`Unexpected abbreviation "bg" in "--t-bg-accent". Write "--t-background-accent" instead.`,
					1,
					26,
					39,
				),
			],
		},
		{
			description: "an abbreviation in a component's class",
			code: `.btn { display: flex; }`,
			warnings: [on(`Unexpected abbreviation "btn" in ".btn". Write ".button" instead.`, 1, 1, 5)],
		},
		{
			description: "an abbreviation in a component variable's name",
			code: `.page { --c-card-pad: var(--t-space-1); }`,
			warnings: [
				on(`Unexpected abbreviation "pad" in "--c-card-pad". Write "--c-card-padding" instead.`, 1, 9, 21),
			],
		},
		{
			description: "an attribute name and an attribute value the CSS selects on",
			code: `
				.button {
					&[data-btn-emph="prim"] { color: red; }
				}
			`,
			warnings: [
				on(
					`Unexpected abbreviations "btn" and "emph" in "data-btn-emph". Write "data-button-emphasis" instead.`,
					2,
					4,
					17,
				),
				on(`Unexpected abbreviation "prim". Write "primary" instead.`, 2, 19, 23),
			],
		},
		// Beyond the rules page.
		{
			description: "a component's class, each place it's written",
			code: `
				.btn { color: red; }
				.btn:hover { color: blue; }
			`,
			warnings: [
				on(`Unexpected abbreviation "btn" in ".btn". Write ".button" instead.`, 1, 1, 5),
				on(`Unexpected abbreviation "btn" in ".btn". Write ".button" instead.`, 2, 1, 5),
			],
		},
		{
			description: "a CSS Module's class in camel case",
			code: `.NavItm { display: flex; }`,
			warnings: [on(`Unexpected abbreviation "Itm" in ".NavItm". Write ".NavItem" instead.`, 1, 1, 8)],
		},
		{
			description: "a component named by its attribute",
			code: `[data-component="btn"] { display: flex; }`,
			warnings: [on(`Unexpected abbreviation "btn". Write "button" instead.`, 1, 18, 21)],
		},
		{
			description: "a part's name",
			code: `
				.card { display: grid; }
				@scope (.card) to ([data-component]) {
					[data-part="hdr"] { font-weight: bold; }
				}
			`,
			warnings: [on(`Unexpected abbreviation "hdr". Write "header" instead.`, 3, 14, 17)],
		},
		{
			description: "a component's class in a scope's root",
			code: `
				@scope (.btn) to ([data-component]) {
					p { color: red; }
				}
			`,
			warnings: [on(`Unexpected abbreviation "btn" in ".btn". Write ".button" instead.`, 1, 9, 13)],
		},
		{
			description: "a registered token",
			code: `@property --t-bg-accent { syntax: "<color>"; inherits: true; initial-value: blue; }`,
			warnings: [
				on(
					`Unexpected abbreviation "bg" in "--t-bg-accent". Write "--t-background-accent" instead.`,
					1,
					11,
					24,
				),
			],
		},
		{
			description: "a selector list, once",
			code: `.card, .note { --c-card-pad: 1rem; }`,
			warnings: [
				on(`Unexpected abbreviation "pad" in "--c-card-pad". Write "--c-card-padding" instead.`, 1, 16, 28),
			],
		},
		{
			description: "a declaration in a nested at-rule",
			code: `.page { @media (width > 40rem) { --c-card-pad: 2rem; } }`,
			warnings: [
				on(`Unexpected abbreviation "pad" in "--c-card-pad". Write "--c-card-padding" instead.`, 1, 34, 46),
			],
		},
		{
			description: "single letters for width and height, and an abbreviation written twice",
			code: `.icon { --c-icon-w: 1rem; --c-icon-h-h: 1rem; }`,
			warnings: [
				on(`Unexpected abbreviation "w" in "--c-icon-w". Write "--c-icon-width" instead.`, 1, 9, 19),
				on(
					`Unexpected abbreviation "h" in "--c-icon-h-h". Write "--c-icon-height-height" instead.`,
					1,
					27,
					39,
				),
			],
		},
		{
			description: "an ambiguous abbreviation, as a whole value: its candidates",
			code: `.list { &[data-sort="desc"] { color: red; } }`,
			warnings: [
				on(
					`Unexpected abbreviation "desc". Write the full word, such as "description" or "descending".`,
					1,
					22,
					26,
				),
			],
		},
		{
			description: "an ambiguous abbreviation in a component's class",
			code: `.acc-panel { display: block; }`,
			warnings: [
				on(
					`Unexpected abbreviation "acc" in ".acc-panel". Write the full word, such as "accent", "accordion" or "account".`,
					1,
					1,
					11,
				),
			],
		},
		{
			description: "an ambiguous abbreviation beside another, and in its case",
			code: `
				.card { --c-card-sec-bg: red; }
				.tab { &[data-tab-sel="Dis"] { color: red; } }
			`,
			warnings: [
				on(
					`Unexpected abbreviations "sec" and "bg" in "--c-card-sec-bg". Write each word in full: "sec" as "secondary", "section" or "second"; "bg" as "background".`,
					1,
					9,
					24,
				),
				on(
					`Unexpected abbreviation "sel" in "data-tab-sel". Write the full word, such as "selected", "select" or "selection".`,
					2,
					10,
					22,
				),
				on(`Unexpected abbreviation "Dis". Write the full word, such as "Disabled" or "Display".`, 2, 24, 27),
			],
		},
		{
			description: "pad in a custom property's name, beside pad as a noun",
			code: `.signature-pad { --c-signature-pad-gap: 1rem; }`,
			warnings: [
				on(
					`Unexpected abbreviation "pad" in "--c-signature-pad-gap". Write "--c-signature-padding-gap" instead.`,
					1,
					18,
					39,
				),
			],
		},
		{
			description: "a value matched whole or as a word in a list, beside ones matched in part",
			code: `
				.file {
					&[data-file="txt"] { color: red; }
					&[data-tags~="btn"] { color: red; }
					&[data-file$=".txt"] { color: red; }
				}
			`,
			warnings: [
				on(`Unexpected abbreviation "txt". Write "text" instead.`, 2, 15, 18),
				on(`Unexpected abbreviation "btn". Write "button" instead.`, 3, 16, 19),
			],
		},
		{
			description: "an attribute after a comment in a selector, and one in a scope's root",
			code: `
				.card { display: grid; }
				.card/* old */[data-btn="primary"]:hover { color: red; }
				@scope (.card/* note */[data-sz="x"]) to ([data-component]) {
					p { color: red; }
				}
			`,
			warnings: [
				on(`Unexpected abbreviation "btn" in "data-btn". Write "data-button" instead.`, 2, 16, 24),
				on(`Unexpected abbreviation "sz" in "data-sz". Write "data-size" instead.`, 3, 25, 32),
			],
		},
		{
			description: "a capitalized abbreviation keeps its case",
			code: `[data-theme="default"] { --t-color-BG: white; --t-color-Fg: black; }`,
			warnings: [
				on(
					`Unexpected abbreviation "BG" in "--t-color-BG". Write "--t-color-BACKGROUND" instead.`,
					1,
					26,
					38,
				),
				on(
					`Unexpected abbreviation "Fg" in "--t-color-Fg". Write "--t-color-Foreground" instead.`,
					1,
					47,
					59,
				),
			],
		},
	],
});

testRule(noAbbreviations, {
	options: { privates: true },
	accept: [
		{
			description: "an abbreviation in a private's name, with privates: true",
			code: `.card { --_padding: var(--t-space-1); }`,
		},
	],
	reject: [
		{
			description: "an abbreviation in a private's name, with privates: true",
			code: `.card { --_pad: var(--t-space-1); }`,
			warnings: [on(`Unexpected abbreviation "pad" in "--_pad". Write "--_padding" instead.`, 1, 9, 15)],
		},
	],
});

testRule(noAbbreviations, {
	options: { sizes: "full" },
	accept: [
		{
			description: "a T-shirt size, with sizes: full",
			code: `.button { &[data-size="small"] { padding: 0; } }`,
		},
	],
	reject: [
		{
			description: "a T-shirt size, with sizes: full",
			code: `.button { &[data-size="sm"] { padding: 0; } }`,
			warnings: [on(`Unexpected abbreviation "sm". Write "small" instead.`, 1, 24, 26)],
		},
		{
			description: "sizes in CSS's own words for font sizes",
			code: `[data-theme="default"] { --t-space-xl: 2rem; --t-space-2xl: 3rem; }`,
			warnings: [
				on(`Unexpected abbreviation "xl" in "--t-space-xl". Write "--t-space-x-large" instead.`, 1, 26, 38),
				on(
					`Unexpected abbreviation "2xl" in "--t-space-2xl". Write "--t-space-xx-large" instead.`,
					1,
					46,
					59,
				),
			],
		},
	],
});

testRule(noAbbreviations, {
	options: { ignoreWords: ["btn", "/^pad$/i", /^Itm$/] },
	accept: [
		{
			description: "words ignoreWords allows: a word, a /regex/i string and a regular expression",
			code: `
				.btn { --c-btn-PAD: 1rem; }
				.NavItm { display: flex; }
			`,
		},
	],
	reject: [
		{
			description: "a word ignoreWords doesn't allow",
			code: `.card { --c-card-bg: red; }`,
			warnings: [
				on(`Unexpected abbreviation "bg" in "--c-card-bg". Write "--c-card-background" instead.`, 1, 9, 20),
			],
		},
	],
});

// An attribute `statefulcss.config` names is the project's choice: its name isn't checked, its values are.
testRule(noAbbreviations, {
	settings: { partAttribute: "data-elem" },
	accept: [
		{
			description: "a part attribute the settings name",
			code: `
				.card { display: grid; }
				@scope (.card) to ([data-component]) {
					[data-elem="title"] { font-weight: bold; }
				}
			`,
		},
	],
	reject: [
		{
			description: "a part's name, in the attribute the settings name",
			code: `
				.card { display: grid; }
				@scope (.card) to ([data-component]) {
					[data-elem="lbl"] { font-weight: bold; }
				}
			`,
			warnings: [on(`Unexpected abbreviation "lbl". Write "label" instead.`, 3, 14, 17)],
		},
	],
});

// One word on its own, as Stylelint's own rules take it, is a list of one.
testRule(noAbbreviations, {
	options: { ignoreWords: "btn" },
	accept: [{ description: "ignoreWords given one word on its own", code: `.btn { display: flex; }` }],
});

describe("statefulcss/no-abbreviations's options", () => {
	const project = temporaryProject();
	const invalidFor = async (options: Record<string, unknown>): Promise<string[]> => {
		const { invalid } = await lint(sourceFor("css", { code: ".page { --c-page-gap: 0; }" }), project(), {
			plugins: [toPlugin(noAbbreviations, { failLoudly: true })],
			rules: { "statefulcss/no-abbreviations": [true, options] },
		});
		return invalid;
	};

	it("refuses values the options don't take", async () => {
		expect(await invalidFor({ sizes: "medium" })).toEqual([
			'Invalid value "medium" for option "sizes" of rule "statefulcss/no-abbreviations"',
		]);
		expect(await invalidFor({ privates: "yes" })).toEqual([
			'Invalid value "yes" for option "privates" of rule "statefulcss/no-abbreviations"',
		]);
		expect(await invalidFor({ ignoreWords: [1] })).toEqual([
			'Invalid value "1" for option "ignoreWords" of rule "statefulcss/no-abbreviations"',
		]);
	});
});

describe("no-abbreviations' deny list", () => {
	it("has no HTML element name, CSS word or unit, or established term", () => {
		const never = [
			// HTML elements
			...[
				"a",
				"abbr",
				"b",
				"bdi",
				"bdo",
				"br",
				"col",
				"dd",
				"del",
				"dfn",
				"dl",
				"dt",
				"em",
				"hr",
				"i",
				"img",
			],
			...["ins", "kbd", "li", "nav", "ol", "p", "pre", "q", "rp", "rt", "s", "samp", "sub", "sup", "svg"],
			...["td", "th", "tr", "u", "ul", "var", "wbr", "h1", "h2", "h3", "h4", "h5", "h6", "main", "menu"],
			// CSS's own words and units
			...["min", "max", "calc", "rgb", "rgba", "hsl", "hwb", "lab", "lch", "oklch", "oklab", "px", "em"],
			...["rem", "ex", "ch", "lh", "rlh", "vw", "vh", "vi", "vb", "vmin", "vmax", "dvh", "svh", "lvh", "cqw"],
			...[
				"cqh",
				"cm",
				"mm",
				"pt",
				"pc",
				"deg",
				"rad",
				"grad",
				"turn",
				"ms",
				"hz",
				"khz",
				"dpi",
				"dppx",
				"fr",
			],
			...["auto", "inherit", "url", "attr", "env", "clamp", "abs", "sin", "cos", "mod", "rem", "round"],
			// Established terms and coordinates
			...["id", "aria", "ui", "ux", "api", "rtl", "ltr", "x", "y", "z"],
		];
		expect(never.filter((word) => abbreviations.has(word))).toEqual([]);
		// Sizes are their own option.
		expect(["xs", "sm", "md", "lg", "xl", "2xl", "xxl"].filter((word) => abbreviations.has(word))).toEqual(
			[],
		);
	});

	it("writes T-shirt sizes in CSS's own words", () => {
		expect(["xs", "sm", "md", "lg", "xl", "xxs", "2xs", "xxl", "2xl", "3xl", "xxxl"].map(fullSize)).toEqual([
			"x-small",
			"small",
			"medium",
			"large",
			"x-large",
			"xx-small",
			"xx-small",
			"xx-large",
			"xx-large",
			"xxx-large",
			"xxx-large",
		]);
		expect(["s", "m", "l", "x", "xxx", "0xl", "10xl", "small"].map(fullSize)).toEqual(
			Array.from({ length: 8 }, () => undefined),
		);
	});
});
