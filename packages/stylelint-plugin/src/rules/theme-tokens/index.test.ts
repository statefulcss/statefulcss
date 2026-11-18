import stylelint from "stylelint";
import { describe, expect, it } from "vitest";

import { dedent, type ExpectedWarning, testRule } from "../../testing/test-rule.js";
import { ruleNameOf, toPlugin } from "../../stylelint/plugin.js";
import themeTokens from "./index.js";

const patterns = '"**/styles/themes/**"';
const themeFile = (theme: string): string => `src/styles/themes/${theme}/index.css`;
const component = "src/styles/components/button.css";

/**
 * A warning on the first written `text` of the case's code (the `occurrence`-th, counted from 0), from its start to
 * its end. Lines are counted in the case's CSS.
 */
const scheme = '"[data-color-scheme="dark"]"';

function on(message: string, code: string, text: string, occurrence = 0): ExpectedWarning {
	const css = dedent(code);
	let index = -1;
	for (let count = 0; count <= occurrence; count++) index = css.indexOf(text, index + 1);
	if (index === -1) throw new Error(`"${text}" isn't in the case's code`);
	const before = css.slice(0, index);
	const line = before.split("\n").length;
	const column = index - before.lastIndexOf("\n");
	const lines = text.split("\n");
	const endLine = line + lines.length - 1;
	const endColumn = lines.length === 1 ? column + text.length : (lines.at(-1)?.length ?? 0) + 1;
	return { message, line, column, endLine, endColumn };
}

const tokenOutside = (name: string, place: string, private_: string): string =>
	`Unexpected token "${name}" declared on ${place}. Tokens are declared only in theme scopes: a value the element names for itself is a private, such as "${private_}".`;
const tokenOnPage = (name: string, place: string): string =>
	`Unexpected token "${name}" declared on ${place}, outside any theme scope: switching the theme attribute wouldn't change it. Declare it in a theme scope, such as "[data-theme]".`;
const tokenUnderTheme = (name: string, place: string, scope: string): string =>
	`Unexpected token "${name}" declared on ${place}, inside ${scope}: what a theme scope contains is a component, not the theme. Declare the token on ${scope}, and read it in the component.`;
const tokenOnColorScheme = (name: string, place: string): string =>
	`Unexpected token "${name}" declared on ${place}: a color scheme picks a value, it isn't a set of tokens. Give the token both values with "light-dark()" in the theme scope, and set only "color-scheme" here.`;
const colorSchemeOnly = (property: string, place: string): string =>
	`Unexpected "${property}" declared on ${place}. A "[data-color-scheme]" selector declares only "color-scheme".`;
const themeScopeOnly = (property: string, place: string): string =>
	`Unexpected "${property}" declared in theme scope ${place}. A theme scope declares only tokens and "color-scheme": move "${property}" to a base or component style.`;
const componentVariableInTheme = (name: string, place: string): string =>
	`Unexpected component variable "${name}" set in theme scope ${place}. A theme sets tokens: set a token the component's default reads, and set component variables where the component is used.`;
const themeScopeOutside = (place: string, files = patterns): string =>
	`Unexpected theme scope ${place} outside the theme files. Write it in a file matching ${files}, or change "themeFiles" in statefulcss.config.`;
const colorSchemeOutside = (place: string): string =>
	`Unexpected color scheme selector ${place} outside the theme files. Write it in a file matching ${patterns}, or change "themeFiles" in statefulcss.config.`;
const registrationOutside = (name: string): string =>
	`Unexpected registration of token "${name}" outside the theme files. Its initial value is the token's global default, part of the base theme: register it in a file matching ${patterns}.`;
const wrongFolder = (place: string, folder: string, owner: string, move: string): string =>
	`Unexpected ${place} in "${folder}", which holds ${owner}. Move it to "${move}".`;
const baseNamed = (place: string, folder: string): string =>
	`Unexpected ${place} in "${folder}", which holds the base theme. The base theme is the unnamed scope: write "[data-theme]".`;
const tokenOnColorSchemeOther = (name: string, place: string): string =>
	`Unexpected token "${name}" declared on ${place}: a color scheme picks colors, and "${name}" isn't one. Move it, unchanged, into the theme scope, and set only "color-scheme" here.`;
const wrongFolders = (places: string, folder: string, owner: string, moves: string): string =>
	`Unexpected ${places} in "${folder}", which holds ${owner}. Write each theme in its own folder: ${moves}.`;
const mixedThemes = (place: string, owner: string): string =>
	`Unexpected ${place} in a file of ${owner}. Write each theme in a file of its own.`;
const notThemeContent = (place: string): string =>
	`Unexpected ${place} in a theme file. A theme file holds only theme scopes, "[data-color-scheme]" selectors, token registrations and imports of other theme files.`;
const importOutside = (url: string): string =>
	`Unexpected import of "${url}" in a theme file. A theme file imports only other theme files, matching ${patterns}.`;

/** A case's code, kept so its warnings can be placed in it. */
const code = {
	tokenInComponent: `
		.button { --t-space-2: 0.5rem; }
	`,
	tokenOnRoot: `
		:root { --t-space-2: 0.5rem; }
	`,
	reachingIn: `
		[data-theme="default"] .button { --t-color-background-accent: blue; }
	`,
	styling: `
		[data-theme="default"] {
			--t-space-2: 0.5rem;
			padding: 0;
		}
	`,
	componentVariable: `
		[data-theme="default"] { --c-button-background-color: red; }
	`,
	outside: `
		[data-theme="espresso"] { --t-color-background-accent: #6f4e37; }
	`,
	wrongFolder: `
		[data-theme="summer"] { --t-color-background-accent: #f4a261; }
	`,
	registration: `
		@property --t-space-2 { syntax: "<length>"; inherits: true; initial-value: 0.5rem; }
	`,
	colorSchemeTokens: `
		[data-color-scheme="dark"] { --t-color-background-base: black; }
	`,
	pageElement: `
		[data-theme="default"] p { --t-space-2: 0.5rem; }
	`,
	nested: `
		.card {
			[data-theme="default"] & { --t-space-2: 0.5rem; }
		}
	`,
	list: `
		.card, .note { --t-space-2: 0.5rem; }
	`,
	pseudoElement: `
		[data-theme="default"]::before { --t-space-2: 0.5rem; }
	`,
	utility: `
		@layer utilities {
			.gap-2 { --t-space-2: 0.5rem; }
		}
	`,
	compositeTokens: `
		@property --t-color-ring { syntax: "<color> | none"; inherits: true; initial-value: none; }
		[data-color-scheme="dark"] {
			--t-shadow: rgb(0 0 0 / .2) 0 2px 4px;
			--t-border: var(--t-color-border) solid 1px;
			--t-color-transition-duration: .2s;
			--t-color-ring: none;
		}
	`,
	wholeColorTokens: `
		[data-color-scheme="dark"] {
			--t-color-shadow: rgb(0 0 0 / .2);
			--t-color-border: var(--brand-border);
			--t-ink: CanvasText;
		}
	`,
	pageForms: `
		html { --t-space-2: 0.5rem; }
		html.dark { --t-space-3: 1rem; }
	`,
	colorSchemeStyling: `
		[data-color-scheme="dark"] {
			color-scheme: dark;
			background: black;
		}
	`,
	themeAndScheme: `
		[data-theme="default"][data-color-scheme="dark"] { --t-color-background-base: black; }
	`,
	colorSchemeOutside: `
		[data-color-scheme="dark"] { color-scheme: dark; }
	`,
	privateInTheme: `
		[data-theme="default"] {
			--t-space-2: 0.5rem;
			--_gap: 1rem;
			--s-color: red;
			@media (min-width: 40rem) { margin: 0; }
		}
	`,
	listOutside: `
		[data-theme="espresso"],
		[data-theme="summer"] { --t-color-background-accent: #6f4e37; }
	`,
	nestedOutside: `
		[data-theme="espresso"] {
			--t-duration-fast: 0.2s;
			@media (prefers-reduced-motion: reduce) { --t-duration-fast: 0s; }
		}
	`,
	baseInNamed: `
		[data-theme] { --t-space-2: 0.5rem; }
	`,
	namedInBase: `
		[data-theme="espresso"] { --t-space-2: 0.5rem; }
	`,
	otherContent: `
		@import "./espresso/index.css";
		@import "../components/button.css";
		@keyframes fade { from { opacity: 0; } }
		@property --s-gap { syntax: "<length>"; inherits: true; initial-value: 0; }
		[data-theme] { --t-space-2: 0.5rem; }
		.button { color: red; &:hover { color: blue; } }
		[data-theme]::before { content: ""; }
	`,
} satisfies Record<string, string>;

testRule(themeTokens, {
	accept: [
		// The rules page's Fixed cases.
		{
			description: "a token in a component",
			code: `
				.button { --_gap: 0.5rem; }
			`,
		},
		{
			description: "a token on :root",
			code: `
				html[data-theme="default"] { --t-space-2: 0.5rem; }
			`,
			file: themeFile("default"),
		},
		{
			description: "a theme scope reaching into a component",
			code: `
				[data-theme="default"] { --t-color-background-accent: blue; }
			`,
			file: themeFile("default"),
		},
		{
			description: "a theme scope styling something",
			code: `
				[data-theme="default"] { --t-space-2: 0.5rem; }
			`,
			file: themeFile("default"),
		},
		{
			description: "a theme setting a component variable",
			code: `
				[data-theme="default"] { --t-color-background-accent: red; }
			`,
			file: themeFile("default"),
		},
		{
			description: "a theme scope written outside the theme files",
			code: code.outside,
			file: themeFile("espresso"),
		},
		{
			description: "a theme in the wrong folder",
			code: code.wrongFolder,
			file: themeFile("summer"),
		},
		{
			description: "a token registered outside the theme files",
			code: code.registration,
			file: "src/styles/themes/index.css",
		},
		{
			description: "a [data-color-scheme] selector declaring tokens",
			code: `
				[data-theme="default"] { --t-color-background-base: light-dark(white, black); }
				[data-color-scheme="dark"] { color-scheme: dark; }
			`,
			file: themeFile("default"),
		},
		// The rules page's Not reported cases.
		{
			description: "a theme scope with color-scheme and a light-dark() token",
			code: `
				[data-theme="default"] { color-scheme: light dark; --t-color-background-base: light-dark(white, black); }
			`,
			file: themeFile("default"),
		},
		{
			description: "a theme adjusting its own tokens to a preference",
			code: `
				[data-theme="default"] { @media (prefers-reduced-motion: reduce) { --t-duration-fast: 0s; } }
			`,
			file: themeFile("default"),
		},
		{
			description: ":root setting only color-scheme",
			code: `
				:root { color-scheme: light dark; }
			`,
		},
		{
			description: "a token's registration in a theme file",
			code: code.registration,
			file: themeFile("base"),
		},
		{
			description: "a theme named after a color scheme, left to no-color-scheme-themes",
			code: `
				[data-theme="dark"] { --t-color-background-base: black; }
			`,
			file: themeFile("dark"),
		},
		// Beyond the rules page.
		{
			description: "base styles on html and :root",
			code: `
				html { font-family: system-ui; }
				:root { --_gap: 1rem; }
			`,
		},
		{
			description: "the base theme in its folder and at the root of the themes folder",
			code: `
				[data-theme] { --t-space-2: 0.5rem; }
				html[data-theme] { --t-space-3: 1rem; }
			`,
			file: themeFile("base"),
		},
		{
			description: "the base theme in a file at the root of the themes folder",
			code: `
				[data-theme] { --t-space-2: 0.5rem; }
			`,
			file: "src/styles/themes/tokens.css",
		},
		{
			description: "a theme's file in a folder under its own",
			code: `
				[data-theme="espresso"] { --t-space-2: 0.5rem; }
			`,
			file: "src/styles/themes/espresso/parts/spacing.css",
		},
		{
			description: "a themes folder at the top of the project",
			code: `
				[data-theme="espresso"] { --t-space-2: 0.5rem; }
			`,
			file: "styles/themes/espresso/index.css",
		},
		{
			description: "what a theme file may hold besides theme scopes",
			code: `
				@charset "utf-8";
				@layer themes;
				@import "./base/index.css";
				@import "espresso/index.css";
				@import url("https://example.com/fonts.css");
				@property --t-space-2 { syntax: "<length>"; inherits: true; initial-value: 0.5rem; }
				@layer themes {
					[data-theme] { --t-space-2: 0.5rem; }
				}
				[data-color-scheme="dark"] { color-scheme: dark; }
				:root[data-color-scheme="light"] { color-scheme: light; }
			`,
			file: "src/styles/themes/index.css",
		},
		{
			description: "a theme scope with a theme and a color scheme, setting color-scheme",
			code: `
				[data-theme="espresso"][data-color-scheme="dark"] { color-scheme: dark; }
			`,
			file: themeFile("espresso"),
		},
		{
			description: "a token read in a component",
			code: `
				.button { gap: var(--t-space-2); }
			`,
		},
		{
			description: "what :global() selects",
			code: `
				:global(.button) { --t-space-2: 0.5rem; }
			`,
		},
	],
	reject: [
		// The rules page's Reported cases.
		{
			description: "a token in a component",
			code: code.tokenInComponent,
			warnings: [
				on(tokenOutside("--t-space-2", '".button"', "--_space-2"), code.tokenInComponent, "--t-space-2"),
			],
		},
		{
			description: "a token on :root",
			code: code.tokenOnRoot,
			warnings: [on(tokenOnPage("--t-space-2", '":root"'), code.tokenOnRoot, "--t-space-2")],
		},
		{
			description: "a theme scope reaching into a component",
			code: code.reachingIn,
			warnings: [
				on(
					tokenUnderTheme("--t-color-background-accent", '".button"', '"[data-theme="default"]"'),
					code.reachingIn,
					"--t-color-background-accent",
				),
			],
		},
		{
			description: "a theme scope styling something",
			code: code.styling,
			file: themeFile("default"),
			warnings: [on(themeScopeOnly("padding", '"[data-theme="default"]"'), code.styling, "padding")],
		},
		{
			description: "a theme setting a component variable",
			code: code.componentVariable,
			file: themeFile("default"),
			warnings: [
				on(
					componentVariableInTheme("--c-button-background-color", '"[data-theme="default"]"'),
					code.componentVariable,
					"--c-button-background-color",
				),
			],
		},
		{
			description: "a theme scope written outside the theme files",
			code: code.outside,
			file: component,
			warnings: [on(themeScopeOutside('"[data-theme="espresso"]"'), code.outside, '[data-theme="espresso"]')],
		},
		{
			description: "a theme in the wrong folder",
			code: code.wrongFolder,
			file: themeFile("espresso"),
			warnings: [
				on(
					wrongFolder(
						'"[data-theme="summer"]"',
						"src/styles/themes/espresso/",
						'theme "espresso"',
						"src/styles/themes/summer/",
					),
					code.wrongFolder,
					'[data-theme="summer"]',
				),
			],
		},
		{
			description: "a token registered outside the theme files",
			code: code.registration,
			file: component,
			warnings: [on(registrationOutside("--t-space-2"), code.registration, "--t-space-2")],
		},
		{
			description: "a [data-color-scheme] selector declaring tokens",
			code: code.colorSchemeTokens,
			file: themeFile("default"),
			warnings: [
				on(
					tokenOnColorScheme("--t-color-background-base", '"[data-color-scheme="dark"]"'),
					code.colorSchemeTokens,
					"--t-color-background-base",
				),
			],
		},
		// Beyond the rules page: tokens.
		{
			description: "a token on a page element inside a theme scope",
			code: code.pageElement,
			warnings: [
				on(
					tokenUnderTheme("--t-space-2", '"[data-theme="default"] p"', '"[data-theme="default"]"'),
					code.pageElement,
					"--t-space-2",
				),
			],
		},
		{
			description: "a token on a component nested in a theme scope's context",
			code: code.nested,
			warnings: [
				on(tokenUnderTheme("--t-space-2", '".card"', '"[data-theme="default"]"'), code.nested, "--t-space-2"),
			],
		},
		{
			description: "a selector list, once, naming each place",
			code: code.list,
			warnings: [
				on(tokenOutside("--t-space-2", '".card" and ".note"', "--_space-2"), code.list, "--t-space-2"),
			],
		},
		{
			description: "a token on a theme scope's pseudo-element",
			code: code.pseudoElement,
			file: themeFile("default"),
			warnings: [
				on(
					notThemeContent('"[data-theme="default"]::before"'),
					code.pseudoElement,
					'[data-theme="default"]::before',
				),
				on(
					tokenOutside("--t-space-2", '"[data-theme="default"]::before"', "--_space-2"),
					code.pseudoElement,
					"--t-space-2",
				),
			],
		},
		{
			description: "a token in a utility",
			code: code.utility,
			warnings: [on(tokenOutside("--t-space-2", '".gap-2"', "--_space-2"), code.utility, "--t-space-2")],
		},
		{
			description: "a token on html, and on html with a class",
			code: code.pageForms,
			warnings: [
				on(tokenOnPage("--t-space-2", '"html"'), code.pageForms, "--t-space-2"),
				on(tokenOnPage("--t-space-3", '"html"'), code.pageForms, "--t-space-3"),
			],
		},
		// Beyond the rules page: what theme scopes and color scheme selectors declare.
		{
			description: "a [data-color-scheme] selector styling something",
			code: code.colorSchemeStyling,
			file: themeFile("default"),
			warnings: [
				on(
					colorSchemeOnly("background", '"[data-color-scheme="dark"]"'),
					code.colorSchemeStyling,
					"background",
				),
			],
		},
		{
			description: "a theme scope with a color scheme, declaring a token",
			code: code.themeAndScheme,
			file: themeFile("default"),
			warnings: [
				on(
					tokenOnColorScheme(
						"--t-color-background-base",
						'"[data-theme="default"][data-color-scheme="dark"]"',
					),
					code.themeAndScheme,
					"--t-color-background-base",
				),
			],
		},
		// R07: `light-dark()` takes colors only. The case above, a color by its name, is the control.
		{
			description: "a [data-color-scheme] selector declaring a token that isn't a color",
			code: `
				[data-color-scheme="dark"] { --t-space-2: 0.75rem; --t-font-weight-body: 350; }
			`,
			file: themeFile("base"),
			warnings: [
				{
					message: tokenOnColorSchemeOther("--t-space-2", '"[data-color-scheme="dark"]"'),
					line: 1,
					column: 30,
					endLine: 1,
					endColumn: 41,
				},
				{
					message: tokenOnColorSchemeOther("--t-font-weight-body", '"[data-color-scheme="dark"]"'),
					line: 1,
					column: 52,
					endLine: 1,
					endColumn: 72,
				},
			],
		},
		// Only a whole value that is one color gets "light-dark()". A shadow, a border shorthand
		// and a duration move as they are, whatever their names hold.
		{
			description: "a [data-color-scheme] selector declaring a shadow, a border and a duration",
			code: code.compositeTokens,
			file: themeFile("base"),
			warnings: [
				on(tokenOnColorSchemeOther("--t-shadow", scheme), code.compositeTokens, "--t-shadow"),
				on(tokenOnColorSchemeOther("--t-border", scheme), code.compositeTokens, "--t-border"),
				on(
					tokenOnColorSchemeOther("--t-color-transition-duration", scheme),
					code.compositeTokens,
					"--t-color-transition-duration",
				),
				on(tokenOnColorSchemeOther("--t-color-ring", scheme), code.compositeTokens, "--t-color-ring", 1),
			],
		},
		{
			description: "a [data-color-scheme] selector declaring whole colors, one of them a lone var()",
			code: code.wholeColorTokens,
			file: themeFile("base"),
			warnings: [
				on(tokenOnColorScheme("--t-color-shadow", scheme), code.wholeColorTokens, "--t-color-shadow"),
				on(tokenOnColorScheme("--t-color-border", scheme), code.wholeColorTokens, "--t-color-border"),
				on(tokenOnColorScheme("--t-ink", scheme), code.wholeColorTokens, "--t-ink"),
			],
		},
		{
			description: "a [data-color-scheme] selector declaring colors told by their value or registration",
			code: `
				@property --t-surface { syntax: "<color>"; inherits: true; initial-value: white; }
				[data-color-scheme="dark"] {
					--t-ink: black;
					--t-line: #333;
					--t-shade: oklch(20% 0 0);
					--t-edge: var(--t-color-gray-9);
					--t-surface: var(--t-gray-9);
				}
			`,
			file: themeFile("base"),
			warnings: ["--t-ink", "--t-line", "--t-shade", "--t-edge", "--t-surface"].map((name, index) => ({
				message: tokenOnColorScheme(name, '"[data-color-scheme="dark"]"'),
				line: 3 + index,
				column: 2,
				endLine: 3 + index,
				endColumn: 2 + name.length,
			})),
		},
		// R06: a list of themes in another theme's folder.
		{
			description: "two themes in another theme's folder, each told its own folder",
			code: `
				[data-theme="a"], [data-theme="b"] { --t-space-2: 0.5rem; }
			`,
			file: themeFile("sea"),
			warnings: [
				{
					message: wrongFolders(
						'"[data-theme="a"]" and "[data-theme="b"]"',
						"src/styles/themes/sea/",
						'theme "sea"',
						'"[data-theme="a"]" in "src/styles/themes/a/" and "[data-theme="b"]" in "src/styles/themes/b/"',
					),
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 35,
				},
			],
		},
		{
			description: "a list of the folder's theme and another, told only of the other",
			code: `
				[data-theme="sea"], [data-theme="b"] { --t-space-2: 0.5rem; }
			`,
			file: themeFile("sea"),
			warnings: [
				{
					message: wrongFolder(
						'"[data-theme="b"]"',
						"src/styles/themes/sea/",
						'theme "sea"',
						"src/styles/themes/b/",
					),
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 37,
				},
			],
		},
		// R13: the base theme named, at the themes folder's root, drops its name, as in its own folder.
		{
			description: "the base theme named at the root of the themes folder",
			code: `
				[data-theme="base"] { --t-space-2: 0.5rem; }
			`,
			file: "src/styles/themes/index.css",
			warnings: [
				{
					message: baseNamed('"[data-theme="base"]"', "src/styles/themes/"),
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 20,
				},
			],
		},
		{
			description: "the base theme named in its own folder",
			code: `
				[data-theme="base"] { --t-space-2: 0.5rem; }
			`,
			file: themeFile("base"),
			warnings: [
				{
					message: baseNamed('"[data-theme="base"]"', "src/styles/themes/base/"),
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 20,
				},
			],
		},
		{
			description: "a theme scope setting a private, a state variable, and a property in a media query",
			code: code.privateInTheme,
			file: themeFile("default"),
			warnings: [
				on(themeScopeOnly("--_gap", '"[data-theme="default"]"'), code.privateInTheme, "--_gap"),
				on(themeScopeOnly("--s-color", '"[data-theme="default"]"'), code.privateInTheme, "--s-color"),
				on(themeScopeOnly("margin", '"[data-theme="default"]"'), code.privateInTheme, "margin"),
			],
		},
		// Beyond the rules page: where themes are written.
		{
			description: "a color scheme selector outside the theme files",
			code: code.colorSchemeOutside,
			file: component,
			warnings: [
				on(
					colorSchemeOutside('"[data-color-scheme="dark"]"'),
					code.colorSchemeOutside,
					'[data-color-scheme="dark"]',
				),
			],
		},
		{
			description: "two theme scopes in one selector list outside the theme files, once",
			code: code.listOutside,
			file: component,
			warnings: [
				on(
					themeScopeOutside('"[data-theme="espresso"]" and "[data-theme="summer"]"'),
					code.listOutside,
					'[data-theme="espresso"],\n[data-theme="summer"]',
				),
			],
		},
		{
			description: "a theme scope with a nested media query outside the theme files, once",
			code: code.nestedOutside,
			file: component,
			warnings: [
				on(themeScopeOutside('"[data-theme="espresso"]"'), code.nestedOutside, '[data-theme="espresso"]'),
			],
		},
		{
			description: "the base theme in a named theme's folder",
			code: code.baseInNamed,
			file: themeFile("espresso"),
			warnings: [
				on(
					wrongFolder(
						'"[data-theme]"',
						"src/styles/themes/espresso/",
						'theme "espresso"',
						"src/styles/themes/base/",
					),
					code.baseInNamed,
					"[data-theme]",
				),
			],
		},
		{
			description: "a named theme in the base theme's folder",
			code: code.namedInBase,
			file: themeFile("base"),
			warnings: [
				on(
					wrongFolder(
						'"[data-theme="espresso"]"',
						"src/styles/themes/base/",
						"the base theme",
						"src/styles/themes/espresso/",
					),
					code.namedInBase,
					'[data-theme="espresso"]',
				),
			],
		},
		{
			description: "a named theme at the root of the themes folder",
			code: code.namedInBase,
			file: "src/styles/themes/index.css",
			warnings: [
				on(
					wrongFolder(
						'"[data-theme="espresso"]"',
						"src/styles/themes/",
						"the base theme",
						"src/styles/themes/espresso/",
					),
					code.namedInBase,
					'[data-theme="espresso"]',
				),
			],
		},
		{
			description: "page styles in a theme file",
			code: `
				:root { color-scheme: light dark; }
			`,
			file: "src/styles/themes/index.css",
			warnings: [{ message: notThemeContent('":root"'), line: 1, column: 1, endLine: 1, endColumn: 6 }],
		},
		{
			description: "a theme file holding something else",
			code: code.otherContent,
			file: "src/styles/themes/index.css",
			warnings: [
				on(importOutside("../components/button.css"), code.otherContent, '"../components/button.css"'),
				on(notThemeContent('"@keyframes"'), code.otherContent, "@keyframes fade { from { opacity: 0; } }"),
				on(notThemeContent('"@property --s-gap"'), code.otherContent, "--s-gap"),
				on(notThemeContent('".button"'), code.otherContent, ".button"),
				on(notThemeContent('"[data-theme]::before"'), code.otherContent, "[data-theme]::before"),
			],
		},
	],
});

describe("settings", () => {
	testRule(themeTokens, {
		settings: { themeFiles: ["src/themes/*"], baseTheme: "default", themeAttribute: "data-brand" },
		accept: [
			{
				description: "one theme in a theme file whose folder the patterns don't say",
				code: `
					[data-brand="espresso"] { --t-space-2: 0.5rem; }
					[data-brand="espresso"] { @media (min-width: 40rem) { --t-space-2: 1rem; } }
				`,
				file: "src/themes/espresso.css",
			},
			{
				description: "the theme attribute the settings name",
				code: `
					[data-theme="espresso"] .button { --_gap: 0.5rem; }
				`,
			},
		],
		reject: [
			{
				description: "two themes in one theme file",
				code: `
					[data-brand="espresso"] { --t-space-2: 0.5rem; }
					[data-brand="summer"] { --t-space-2: 1rem; }
				`,
				file: "src/themes/espresso.css",
				warnings: [
					on(
						mixedThemes('"[data-brand="summer"]"', 'theme "espresso"'),
						`
							[data-brand="espresso"] { --t-space-2: 0.5rem; }
							[data-brand="summer"] { --t-space-2: 1rem; }
						`,
						'[data-brand="summer"]',
					),
				],
			},
			{
				description: "a theme scope outside the files the settings name",
				code: `
					[data-brand="espresso"] { --t-space-2: 0.5rem; }
				`,
				file: "src/styles/themes/espresso/index.css",
				warnings: [
					{
						message: themeScopeOutside('"[data-brand="espresso"]"', '"src/themes/*"'),
						line: 1,
						column: 1,
						endLine: 1,
						endColumn: 24,
					},
				],
			},
			{
				description: "a token under the theme attribute the settings name",
				code: `
					[data-brand="espresso"] .button { --t-space-2: 0.5rem; }
				`,
				warnings: [
					{
						message: tokenUnderTheme("--t-space-2", '".button"', '"[data-brand="espresso"]"'),
						line: 1,
						column: 35,
						endLine: 1,
						endColumn: 46,
					},
				],
			},
		],
	});

	// A local import is matched by its URL's path, without "?query" or "#fragment".
	testRule(themeTokens, {
		// One pattern for each syntax the case runs in, so the linted file is a theme file in each.
		settings: { themeFiles: ["styles/themes/**/*.css", "styles/themes/**/*.scss", "styles/themes/**/*.vue"] },
		accept: [
			{
				description: "imports of real theme files, with a query, a fragment, a space and url()",
				code: `
					@import "./tokens.css?v=2";
					@import './colors.css#dark';
					@import "./my theme.css" layer(themes);
					@import url("./sizes%20large.css?v=3");
					@import url(./spacing.css?v=4);
				`,
				file: "styles/themes/base/index.css",
			},
		],
		reject: [
			{
				description: "an import outside the theme files, with a query and a space",
				code: `
					@import "../../components/my button.css?v=2";
					@import url(../../components/card.scss#top);
				`,
				file: "styles/themes/base/index.css",
				warnings: [
					{
						message: `Unexpected import of "../../components/my button.css?v=2" in a theme file. A theme file imports only other theme files, matching "styles/themes/**/*.css", "styles/themes/**/*.scss" or "styles/themes/**/*.vue".`,
						line: 1,
						column: 9,
						endLine: 1,
						endColumn: 45,
					},
					{
						message: `Unexpected import of "../../components/card.scss#top" in a theme file. A theme file imports only other theme files, matching "styles/themes/**/*.css", "styles/themes/**/*.scss" or "styles/themes/**/*.vue".`,
						line: 2,
						column: 9,
						endLine: 2,
						endColumn: 44,
					},
				],
			},
		],
	});

	testRule(themeTokens, {
		settings: { baseTheme: "default" },
		accept: [
			{
				description: "the base theme in the folder the settings name",
				code: `
					[data-theme] { --t-space-2: 0.5rem; }
				`,
				file: themeFile("default"),
			},
		],
		reject: [
			{
				description: "the base theme named after its folder",
				code: `
					[data-theme="default"] { --t-space-2: 0.5rem; }
				`,
				file: themeFile("default"),
				warnings: [
					{
						message: baseNamed('"[data-theme="default"]"', "src/styles/themes/default/"),
						line: 1,
						column: 1,
						endLine: 1,
						endColumn: 23,
					},
				],
			},
			{
				description: "another theme in the base theme's folder",
				code: code.namedInBase,
				file: themeFile("default"),
				warnings: [
					on(
						wrongFolder(
							'"[data-theme="espresso"]"',
							"src/styles/themes/default/",
							"the base theme",
							"src/styles/themes/espresso/",
						),
						code.namedInBase,
						'[data-theme="espresso"]',
					),
				],
			},
		],
	});
});

describe("no theme files", () => {
	testRule(themeTokens, {
		settings: { themeFiles: [] },
		accept: [
			{
				description: "theme scopes and registrations anywhere",
				code: `
					@property --t-space-2 { syntax: "<length>"; inherits: true; initial-value: 0.5rem; }
					[data-theme="espresso"] { --t-space-2: 0.5rem; }
					[data-color-scheme="dark"] { color-scheme: dark; }
				`,
				file: component,
			},
		],
		reject: [
			{
				description: "what a theme scope declares, still",
				code: code.styling,
				file: component,
				warnings: [on(themeScopeOnly("padding", '"[data-theme="default"]"'), code.styling, "padding")],
			},
		],
	});
});

describe("options", () => {
	it("refuses themeFiles as an option, naming the setting", async () => {
		const { results } = await stylelint.lint({
			code: ".button { }",
			config: {
				plugins: [toPlugin(themeTokens, { failLoudly: true })],
				rules: { [ruleNameOf(themeTokens)]: [true, { themeFiles: ["src/themes/**"] }] },
			},
		});
		expect(results[0]?.invalidOptionWarnings.map((warning) => warning.text)).toEqual([
			'"themeFiles" is a project setting, not an option of "statefulcss/theme-tokens". Set it in statefulcss.config.json instead',
		]);
	});
});

describe("code with no file", () => {
	it("checks what's declared, but not where it's written", async () => {
		const { results } = await stylelint.lint({
			code: '[data-theme="espresso"] { --t-space-2: 0.5rem; padding: 0; }',
			config: {
				plugins: [toPlugin(themeTokens, { failLoudly: true })],
				rules: { [ruleNameOf(themeTokens)]: true },
			},
		});
		expect(results[0]?.warnings.map((warning) => warning.text)).toEqual([
			`${themeScopeOnly("padding", '"[data-theme="espresso"]"')} (statefulcss/theme-tokens)`,
		]);
	});
});
