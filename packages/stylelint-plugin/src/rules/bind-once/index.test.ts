import { testRule } from "../../testing/test-rule.js";
import bindOnce from "./index.js";

/** Cases that pass in both modes: the rules page's Fixed cases and its Not reported list. */
const passEverywhere = [
	{
		description: "the element's own block and a state both declare a property",
		code: `
			.link {
				--s-color: var(--t-color-foreground-accent);
				color: var(--s-color);
				&:hover { --s-color: var(--t-color-foreground-strong); }
			}
		`,
	},
	{
		description: "a variant and a state change the same property",
		code: `
			.button {
				--_background-color: var(--t-color-background-raised);
				--_background-color-hover: var(--t-color-background-raised-strong);
				--s-background-color: var(--_background-color);
				background-color: var(--s-background-color);
				&[data-emphasis="primary"] {
					--_background-color: var(--t-color-background-accent);
					--_background-color-hover: var(--t-color-background-accent-strong);
				}
				&:hover { --s-background-color: var(--_background-color-hover); }
			}
		`,
	},
	{
		description: "a container query changes a property the element already declares",
		code: `
			.card {
				--s-padding: var(--t-space-4);
				padding: var(--s-padding);
				@container --card (inline-size < 20rem) { --s-padding: var(--t-space-2); }
			}
		`,
	},
	{
		description: "a component's state changes its pseudo-element, which also declares the property",
		code: `
			.link {
				--p-after-opacity: 0;
				&::after { opacity: var(--p-after-opacity); }
				&[aria-current="page"] { --p-after-opacity: 1; }
			}
		`,
	},
	{
		description: "an element with state variables declares a property directly in a state",
		code: `
			.button {
				--s-opacity: 1;
				--s-color: var(--t-color-foreground-base);
				opacity: var(--s-opacity);
				color: var(--s-color);
				&:hover { --s-opacity: 0.9; --s-color: var(--t-color-foreground-strong); }
			}
		`,
	},
	{
		description: "an overlap involving a state variable",
		code: `
			.card {
				--s-padding-block: var(--t-space-4);
				--s-padding-inline-end: var(--t-space-4);
				padding-block: var(--s-padding-block);
				padding-inline: 0 var(--s-padding-inline-end);
			}
		`,
	},
	{
		description: "a repeated custom property used as a fallback",
		code: `
			.sheet {
				--s-block-size: 100vh;
				@supports (block-size: 100dvh) { --s-block-size: 100dvh; }
				block-size: var(--s-block-size);
			}
		`,
	},
	{
		description: "strict mode's hover, fixed",
		code: `
			.link {
				--s-text-decoration-thickness: auto;
				text-decoration-thickness: var(--s-text-decoration-thickness);
				&:hover { --s-text-decoration-thickness: 2px; }
			}
		`,
	},
	{
		description: "strict mode's @supports, fixed: it changes the state variable's default",
		code: `
			.badge {
				--s-color: var(--t-color-foreground-base);
				@supports (color: contrast-color(red)) {
					--s-color: contrast-color(var(--t-color-background-accent));
				}
				color: var(--s-color);
			}
		`,
	},
	// The rules page's Not reported list, beyond the strict-only cases.
	{
		description: "a plain overlap, with no state variable",
		code: `.card { padding: var(--t-space-4); padding-inline-start: 0; }`,
	},
	{
		description: "two elements: the root and a part in its scope",
		code: `
			.button { padding: var(--t-space-3); }
			@scope (.button) to ([data-component]) {
				[data-part="icon"] { padding: 0; }
			}
		`,
	},
	{
		description: "the pseudo-element is its own element",
		code: `.button { opacity: 1; &::after { opacity: 0.5; } }`,
	},
	{
		description: "the :visited exception",
		code: `.link { --s-color: blue; color: var(--s-color); &:visited { color: purple; } }`,
	},
	// Beyond the rules page.
	{
		description:
			"a longhand followed by its shorthand, left to declaration-block-no-shorthand-property-overrides",
		code: `.card { --s-padding: 1rem; padding-inline-start: 0; padding: var(--s-padding); }`,
	},
	{
		description: "a custom property set in the element's own block and again in a state",
		code: `.link { --s-color: blue; color: var(--s-color); &:hover { --s-color: red; } }`,
	},
	{
		description: "an extra class is a block of unknown kind, so the property isn't judged",
		code: `.card { color: red; &.is-active { color: blue; } }`,
	},
	{
		description: "a utility and what :deep() selects",
		code: `
			@layer utilities {
				.u-outline { outline: none; &:focus-visible { outline: 2px solid; } }
			}
			.card :deep(a) { color: red; &:hover { color: blue; } }
		`,
		skip: {
			css: ":deep() is Vue's",
			scss: ":deep() is Vue's",
		},
	},
	{
		description: "a theme scope holds tokens, not changes",
		code: `
			[data-theme="espresso"] {
				color-scheme: light;
				@media (prefers-color-scheme: dark) { color-scheme: dark; }
			}
		`,
	},
];

testRule(bindOnce, {
	accept: [
		...passEverywhere,
		{
			description: "a hover that is the property's only declaration",
			code: `.link { &:hover { text-decoration-thickness: 2px; } }`,
		},
		{
			description: "page CSS in a scope, declared once in a hover",
			code: `
				@scope (.prose) to ([data-component]) {
					a:hover { text-decoration-thickness: 2px; }
				}
			`,
		},
		{
			description: "@supports is a fallback, not a change",
			code: `
				.badge {
					color: var(--t-color-foreground-base);
					@supports (color: contrast-color(red)) {
						color: contrast-color(var(--t-color-background-accent));
					}
				}
			`,
		},
		{
			description: "@supports inside a state falls back from that state's value",
			code: `
				.link {
					&:hover {
						color: red;
						@supports (color: oklch(0 0 0)) { color: oklch(0.6 0.2 20); }
					}
				}
			`,
		},
		{
			description: "one written declaration in a selector list of two states is declared once",
			code: `.link:hover, .link:focus-visible { text-decoration-thickness: 2px; }`,
		},
		{
			description: "a variant that is the property's only declaration, with no state variables",
			code: `.button { &[data-size="large"] { gap: var(--t-space-2); } }`,
		},
	],
	reject: [
		{
			description: "the element's own block and a state both declare a property",
			code: `
				.link {
					color: var(--t-color-foreground-accent);
					&:hover { color: var(--t-color-foreground-strong); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" declared on ".link" and again in ":hover". Bind it once with "color: var(--s-color)" and set "--s-color" in ":hover".',
					line: 3,
					column: 12,
					endLine: 3,
					endColumn: 17,
				},
			],
		},
		{
			description: "a variant and a state change the same property",
			code: `
				.button {
					background-color: var(--t-color-background-raised);
					&[data-emphasis="primary"] { background-color: var(--t-color-background-accent); }
					&:hover { background-color: var(--t-color-background-raised-strong); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "background-color" declared on ".button" in "[data-emphasis="primary"]", and a state changes it too. Bind it once with "background-color: var(--s-background-color)", give "--s-background-color" the default "var(--_background-color)", and set "--_background-color" in "[data-emphasis="primary"]".',
					line: 3,
					column: 31,
					endLine: 3,
					endColumn: 47,
				},
				{
					message:
						'Unexpected "background-color" declared on ".button" and again in ":hover". Bind it once with "background-color: var(--s-background-color)" and set "--s-background-color" in ":hover".',
					line: 4,
					column: 12,
					endLine: 4,
					endColumn: 28,
				},
			],
		},
		{
			description: "a container query changes a property the element already declares",
			code: `
				.card {
					padding: var(--t-space-4);
					@container --card (inline-size < 20rem) { padding: var(--t-space-2); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "padding" declared on ".card" and again in "@container --card (inline-size < 20rem)". Bind it once with "padding: var(--s-padding)" and set "--s-padding" in "@container --card (inline-size < 20rem)".',
					line: 3,
					column: 44,
					endLine: 3,
					endColumn: 51,
				},
			],
		},
		{
			description: "a component's state changes its pseudo-element, which also declares the property",
			code: `
				.link {
					&::after { opacity: 0; }
					&[aria-current="page"]::after { opacity: 1; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "opacity" declared on ".link::after" and again in "[aria-current="page"]". Bind it once with "opacity: var(--p-after-opacity)", and let ".link" declare "--p-after-opacity" and set it in "[aria-current="page"]".',
					line: 3,
					column: 34,
					endLine: 3,
					endColumn: 41,
				},
			],
		},
		{
			description: "two states change a pseudo-element that declares the property nowhere else",
			code: `
				.link {
					&:hover::after { opacity: 0.5; }
					&:active::after { opacity: 1; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "opacity" declared on ".link::after" in ":hover" and again in ":active". Bind it once with "opacity: var(--p-after-opacity)", and let ".link" declare "--p-after-opacity" and set it in each.',
					line: 2,
					column: 19,
					endLine: 2,
					endColumn: 26,
				},
				{
					message:
						'Unexpected "opacity" declared on ".link::after" in ":active" and again in ":hover". Bind it once with "opacity: var(--p-after-opacity)", and let ".link" declare "--p-after-opacity" and set it in each.',
					line: 3,
					column: 20,
					endLine: 3,
					endColumn: 27,
				},
			],
		},
		{
			description: "an element with state variables declares a property directly in a state",
			code: `
				.button {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&:hover { --s-opacity: 0.9; color: var(--t-color-foreground-strong); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" declared on ".button" in ":hover", though ".button" changes through state variables. Bind it with "color: var(--s-color)" in the block of ".button", and set "--s-color" in ":hover".',
					line: 4,
					column: 30,
					endLine: 4,
					endColumn: 35,
				},
			],
		},
		{
			description: "an overlap involving a state variable",
			code: `
				.card {
					--s-padding: var(--t-space-4);
					padding: var(--s-padding);
					padding-inline-start: 0;
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "padding-inline-start" beside "padding" on ".card", which sets it too, while "--s-padding" changes one of them. Bind each longhand once, so the change has one path.',
					line: 4,
					column: 2,
					endLine: 4,
					endColumn: 22,
				},
			],
		},
		{
			description: "a repeated custom property used as a fallback",
			code: `
				.sheet {
					--s-block-size: 100vh;
					--s-block-size: 100dvh;
					block-size: var(--s-block-size);
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-block-size" declared twice in one block. The second always wins, so the first is never a fallback: write "@supports (block-size: 100dvh) { --s-block-size: 100dvh; }" instead.',
					line: 3,
					column: 2,
					endLine: 3,
					endColumn: 16,
				},
			],
		},
		// Beyond the rules page.
		{
			description: "two states declare a property the element's own block doesn't",
			code: `
				.link {
					&:hover { text-decoration-thickness: 2px; }
					&:focus-visible { text-decoration-thickness: 3px; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "text-decoration-thickness" declared on ".link" in ":hover" and again in ":focus-visible". Bind it once with "text-decoration-thickness: var(--s-text-decoration-thickness)" in the block of ".link", and set "--s-text-decoration-thickness" in each.',
					line: 2,
					column: 12,
					endLine: 2,
					endColumn: 37,
				},
				{
					message:
						'Unexpected "text-decoration-thickness" declared on ".link" in ":focus-visible" and again in ":hover". Bind it once with "text-decoration-thickness: var(--s-text-decoration-thickness)" in the block of ".link", and set "--s-text-decoration-thickness" in each.',
					line: 3,
					column: 20,
					endLine: 3,
					endColumn: 45,
				},
			],
		},
		{
			description: "a variant changes a property the element's own block declares, with no state",
			code: `
				.button {
					gap: var(--t-space-1);
					&[data-size="large"] { gap: var(--t-space-2); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "gap" declared on ".button" and again in "[data-size="large"]". Bind it once with "gap: var(--s-gap)" and set "--s-gap" in "[data-size="large"]".',
					line: 3,
					column: 25,
					endLine: 3,
					endColumn: 28,
				},
			],
		},
		{
			description: "a selector list of two states, reported once",
			code: `
				.link {
					color: red;
					&:hover, &:focus-visible { color: blue; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" declared on ".link" and again in ":hover" and ":focus-visible". Bind it once with "color: var(--s-color)" and set "--s-color" in ":hover" and ":focus-visible".',
					line: 3,
					column: 29,
					endLine: 3,
					endColumn: 34,
				},
			],
		},
		{
			description: "a selector list on two elements, reported once",
			code: `
				.a { color: blue; }
				.b { color: green; }
				.a:hover, .b:hover { color: red; }
			`,
			warnings: [
				{
					message:
						'Unexpected "color" declared on ".a" and ".b" and again in ":hover". Bind it once with "color: var(--s-color)" and set "--s-color" in ":hover".',
					line: 3,
					column: 22,
					endLine: 3,
					endColumn: 27,
				},
			],
		},
		{
			description: "@starting-style is a state",
			code: `
				.dialog {
					opacity: 1;
					@starting-style { opacity: 0; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "opacity" declared on ".dialog" and again in "@starting-style". Bind it once with "opacity: var(--s-opacity)" and set "--s-opacity" in "@starting-style".',
					line: 3,
					column: 20,
					endLine: 3,
					endColumn: 27,
				},
			],
		},
		{
			description: "a part's own state",
			code: `
				.tabs { color: red; }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] { color: red; &:hover { color: blue; } }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" declared on part "tab" and again in ":hover". Bind it once with "color: var(--s-color)" and set "--s-color" in ":hover".',
					line: 3,
					column: 44,
					endLine: 3,
					endColumn: 49,
				},
			],
		},
		{
			description: "a part's state changes the part's pseudo-element",
			code: `
				.tabs { color: red; }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						&::after { opacity: 0; }
						&:hover::after { opacity: 1; }
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "opacity" declared on "::after" of part "tab" and again in ":hover". Bind it once with "opacity: var(--p-after-opacity)", and let part "tab" declare "--p-after-opacity" and set it in ":hover".',
					line: 5,
					column: 20,
					endLine: 5,
					endColumn: 27,
				},
			],
		},
		{
			description: "the root's state changes a part's pseudo-element",
			code: `
				.tabs { color: red; }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"]::after { opacity: 0; }
					:scope:hover [data-part="tab"]::after { opacity: 1; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "opacity" declared on "::after" of part "tab" and again in ":hover". Bind it once with "opacity: var(--p-tab-after-opacity)", and let ".tabs" declare "--p-tab-after-opacity" and set it in ":hover".',
					line: 4,
					column: 42,
					endLine: 4,
					endColumn: 49,
				},
			],
		},
		{
			description: "the root's state changes a part",
			code: `
				.tabs { color: red; }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] { color: red; }
					:scope:hover [data-part="tab"] { color: blue; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" declared on part "tab" and again in ":hover". Bind it once with "color: var(--p-tab-color)", and let ".tabs" declare "--p-tab-color" and set it in ":hover".',
					line: 4,
					column: 35,
					endLine: 4,
					endColumn: 40,
				},
			],
		},
		{
			description: "content in a scope, declared on the element and in a hover",
			code: `
				@scope (.prose) to ([data-component]) {
					a { text-decoration-thickness: 1px; &:hover { text-decoration-thickness: 2px; } }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "text-decoration-thickness" declared on ".prose a" and again in ":hover". Bind it once with "text-decoration-thickness: var(--s-text-decoration-thickness)" and set "--s-text-decoration-thickness" in ":hover".',
					line: 2,
					column: 48,
					endLine: 2,
					endColumn: 73,
				},
			],
		},
		{
			description: "a repeated custom property no declaration binds",
			code: `.card { --_gap: 1rem; --_gap: 2rem; }`,
			warnings: [
				{
					message:
						'Unexpected "--_gap" declared twice in one block. The second always wins, so the first is never a fallback: write "@supports (…) { --_gap: 2rem; }" instead.',
					line: 1,
					column: 23,
					endLine: 1,
					endColumn: 29,
				},
			],
		},
		{
			description: "a repeated custom property in a utility and in a theme scope",
			code: `
				@layer utilities { .u-stack { --_gap: 1rem; --_gap: 2rem; } }
				[data-theme="espresso"] { --t-space-4: 1rem; --t-space-4: 1.1rem; }
			`,
			warnings: [
				{
					message:
						'Unexpected "--_gap" declared twice in one block. The second always wins, so the first is never a fallback: write "@supports (…) { --_gap: 2rem; }" instead.',
					line: 1,
					column: 45,
					endLine: 1,
					endColumn: 51,
				},
				{
					message:
						'Unexpected "--t-space-4" declared twice in one block. The second always wins, so the first is never a fallback: write "@supports (…) { --t-space-4: 1.1rem; }" instead.',
					line: 2,
					column: 46,
					endLine: 2,
					endColumn: 57,
				},
			],
		},
	],
});

testRule(bindOnce, {
	settings: { strict: true },
	accept: [
		...passEverywhere,
		{
			description: "strict mode: a property declared only in the element's own block",
			code: `.link { text-decoration-thickness: 1px; }`,
		},
	],
	reject: [
		{
			description: "strict mode: a hover that is the property's only declaration",
			code: `
				.link {
					&:hover { text-decoration-thickness: 2px; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "text-decoration-thickness" declared on ".link" in ":hover". In strict mode every change goes through a state variable: bind it with "text-decoration-thickness: var(--s-text-decoration-thickness)" in the block of ".link", and set "--s-text-decoration-thickness" in ":hover".',
					line: 2,
					column: 12,
					endLine: 2,
					endColumn: 37,
				},
			],
		},
		{
			description: "strict mode: @supports changes a value",
			code: `
				.badge {
					color: var(--t-color-foreground-base);
					@supports (color: contrast-color(red)) {
						color: contrast-color(var(--t-color-background-accent));
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" declared on ".badge" in "@supports (color: contrast-color(red))". In strict mode every change goes through a state variable: bind it with "color: var(--s-color)" in the block of ".badge", and set "--s-color" in "@supports (color: contrast-color(red))".',
					line: 4,
					column: 3,
					endLine: 4,
					endColumn: 8,
				},
			],
		},
		{
			description: "strict mode: page CSS in a scope, declared once in a hover",
			code: `
				@scope (.prose) to ([data-component]) {
					a:hover { text-decoration-thickness: 2px; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "text-decoration-thickness" declared on ".prose a" in ":hover". In strict mode every change goes through a state variable: bind it with "text-decoration-thickness: var(--s-text-decoration-thickness)" in the block of ".prose a", and set "--s-text-decoration-thickness" in ":hover".',
					line: 2,
					column: 12,
					endLine: 2,
					endColumn: 37,
				},
			],
		},
		{
			description: "strict mode: a component's state changes its pseudo-element",
			code: `
				.link {
					&[aria-current="page"]::after { opacity: 1; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "opacity" declared on ".link::after" in "[aria-current="page"]". In strict mode every change goes through a variable: bind it with "opacity: var(--p-after-opacity)", and let ".link" declare "--p-after-opacity" and set it in "[aria-current="page"]".',
					line: 2,
					column: 34,
					endLine: 2,
					endColumn: 41,
				},
			],
		},
		{
			description: "strict mode: a selector list of two states, reported once",
			code: `.link:hover, .link:focus-visible { text-decoration-thickness: 2px; }`,
			warnings: [
				{
					message:
						'Unexpected "text-decoration-thickness" declared on ".link" in ":hover" and ":focus-visible". In strict mode every change goes through a state variable: bind it with "text-decoration-thickness: var(--s-text-decoration-thickness)" in the block of ".link", and set "--s-text-decoration-thickness" in ":hover" and ":focus-visible".',
					line: 1,
					column: 36,
					endLine: 1,
					endColumn: 61,
				},
			],
		},
		{
			description: "strict mode: what the default mode reports keeps its message",
			code: `
				.link {
					color: var(--t-color-foreground-accent);
					&:hover { color: var(--t-color-foreground-strong); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" declared on ".link" and again in ":hover". Bind it once with "color: var(--s-color)" and set "--s-color" in ":hover".',
					line: 3,
					column: 12,
					endLine: 3,
					endColumn: 17,
				},
			],
		},
		{
			description: "strict mode: a layer not in ignoreLayers",
			code: `
				@layer components {
					.link { &:hover { text-decoration-thickness: 2px; } }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "text-decoration-thickness" declared on ".link" in ":hover". In strict mode every change goes through a state variable: bind it with "text-decoration-thickness: var(--s-text-decoration-thickness)" in the block of ".link", and set "--s-text-decoration-thickness" in ":hover".',
					line: 2,
					column: 20,
					endLine: 2,
					endColumn: 45,
				},
			],
		},
	],
});

testRule(bindOnce, {
	settings: { strict: true, ignoreLayers: ["base"] },
	accept: [
		{
			description: "strict mode leaves a layer in ignoreLayers alone, and the layers inside it",
			code: `
				@layer base {
					a:hover { text-decoration-thickness: 2px; }
					@layer reset { button:focus-visible { outline: 2px solid; } }
				}
			`,
		},
	],
	reject: [
		{
			description: "strict mode: ignoreLayers leaves the default mode's checks on",
			code: `
				@layer base {
					a { color: blue; &:hover { color: red; } }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" declared on "a" and again in ":hover". Bind it once with "color: var(--s-color)" and set "--s-color" in ":hover".',
					line: 2,
					column: 29,
					endLine: 2,
					endColumn: 34,
				},
			],
		},
		{
			description: "strict mode: a layer whose name only starts with an ignored one",
			code: `
				@layer baseline {
					a:hover { text-decoration-thickness: 2px; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "text-decoration-thickness" declared on "a" in ":hover". In strict mode every change goes through a state variable: bind it with "text-decoration-thickness: var(--s-text-decoration-thickness)" in the block of "a", and set "--s-text-decoration-thickness" in ":hover".',
					line: 2,
					column: 12,
					endLine: 2,
					endColumn: 37,
				},
			],
		},
	],
});
