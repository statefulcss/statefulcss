import { testRule } from "../../testing/test-rule.js";
import noUndeclaredStateVariables from "./index.js";

const scss = { css: "SCSS syntax", vue: "SCSS syntax, in a plain <style> block" };

testRule(noUndeclaredStateVariables, {
	accept: [
		// The rules page's Fixed cases.
		{
			description: "a part reads its component's own state variable",
			code: `
				.button {
					--s-display: inline-flex;
					--p-spinner-display: none;
					display: var(--s-display);
					&[data-loading] { --p-spinner-display: block; }
				}
				@scope (.button) to ([data-component]) {
					[data-part="spinner"] { display: var(--p-spinner-display); }
				}
			`,
		},
		{
			description: "a part reads a part variable its component doesn't declare",
			code: `
				.note { --p-title-color: var(--t-color-text); &[data-tone="muted"] { --p-title-color: var(--t-color-text-muted); } }
				@scope (.note) to ([data-component]) {
					[data-part="title"] { color: var(--p-title-color); }
				}
			`,
		},
		{
			description: "a state changes a state variable nobody declared",
			code: `
				.button {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&:hover { --s-opacity: 0.9; }
				}
			`,
		},
		{
			description: "the component declares something it never changes",
			code: `
				@scope (.card) to ([data-component]) {
					[data-part="title"] { font-weight: 600; }
				}
			`,
		},
		{
			description: "a private declared only in a variant",
			code: `
				.card {
					--s-padding: 1rem;
					padding: var(--s-padding);
					&[data-size="large"] { --s-padding: 2rem; }
				}
			`,
		},
		{
			description: "a pseudo-element reads its component's state variable",
			code: `
				.link {
					--p-after-transform: scaleX(0);
					&::after { transform: var(--p-after-transform); }
					&[aria-current="page"] { --p-after-transform: scaleX(1); }
				}
			`,
		},
		// The rules page's Not reported cases.
		{
			description: "a part reading the part variables its component declares for it",
			code: `
				.button {
					--_icon-color: var(--t-color-neutral-600);
					--_icon-color-hover: var(--t-color-neutral-800);
					--p-icon-color: var(--_icon-color);
					&:hover { --p-icon-color: var(--_icon-color-hover); }
				}
				@scope (.button) to ([data-component]) { [data-part="icon"] { color: var(--p-icon-color); } }
			`,
		},
		{
			description:
				"a part with a state of its own, declaring its own state variable from what the component prepared",
			code: `
				.tabs { --p-tab-color: var(--t-color-text-muted); &[aria-disabled="true"] { --p-tab-color: var(--t-color-text-disabled); } }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--p-tab-color);
						color: var(--s-color);
						&[aria-selected="true"] { --s-color: var(--t-color-accent); }
					}
				}
			`,
		},
		{
			description: "a part feeding its own pseudo-element",
			code: `
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--p-after-block-size: 0;
						&[aria-selected="true"] { --p-after-block-size: 2px; }
						&::after { block-size: var(--p-after-block-size); }
					}
				}
			`,
		},
		{
			description: "a part taking a shared private with inherit",
			code: `
				.card { --_accent: var(--t-color-foreground-accent); }
				@scope (.card) to ([data-component]) { [data-part="badge"] { --_accent: inherit; color: var(--_accent); } }
			`,
		},
		// What the rule's text says without a case.
		{
			description: "each element has its own set, pseudo-elements included",
			code: `
				.tab {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&::after { --s-opacity: 0; opacity: var(--s-opacity); }
					&[aria-selected="true"]::after { --s-opacity: 1; }
				}
			`,
		},
		{
			description: "a private named for a part, read by that part, its pseudo-element and its content",
			code: `
				.card {
					--_body-color: var(--t-color-text);
					--p-body-color: var(--_body-color);
					&[data-tone="muted"] { --p-body-color: var(--t-color-text-muted); }
				}
				@scope (.card) to ([data-component]) {
					[data-part="body"] { color: var(--p-body-color); border-color: var(--_body-color); }
					[data-part="body"] p { color: var(--p-body-color); outline-color: var(--_body-color); }
					[data-part="body"]::after { color: var(--_body-color); }
				}
			`,
		},
		{
			description: "a part variable written in a query of the root",
			code: `
				.card { --p-title-color: black; @media (width > 40rem) { --p-title-color: gray; } }
				@scope (.card) to ([data-component]) { [data-part="title"] { color: var(--p-title-color); } }
			`,
		},
		{
			description: "tokens and component variables come from outside",
			code: `.card { color: var(--c-card-color, var(--t-color-text)); }`,
		},
		{
			description: "a utility reading a state variable it never declares, which belongs to no component",
			code: `@layer utilities { .stack { color: var(--s-color); } }`,
		},
		// Across files.
		{
			description: "parts styled from another file read part variables this file can't see",
			code: `
				@scope ([data-component="tabs"]) to ([data-component]) {
					[data-part="list"] { display: flex; gap: var(--p-list-gap); }
				}
			`,
		},
		{
			description: "a root block whose parts are styled in another file",
			code: `.tabs { --p-list-gap: var(--t-space-2); &[data-size="large"] { --p-list-gap: var(--t-space-4); } }`,
		},
		{
			description: "with the root block in another file, a private named for a part may come from it",
			code: `
				@scope ([data-component="card"]) to ([data-component]) {
					[data-part="icon"] { color: var(--_icon-color); }
					[data-part="icon"]::after { color: var(--_icon-after-color); background: var(--_icon-color); }
					[data-part="icon"] svg { fill: var(--_icon-fill); }
				}
			`,
		},
		// Core's four whole components, as the parts page and the methodology write them.
		{
			description: "the Card and Tabs of the parts page",
			code: `
				.card {
					--s-background-color: var(--t-color-surface);
					background-color: var(--s-background-color);
					--p-title-color: var(--t-color-text);
					& > [data-part="footer"] > [data-slot="action"] { justify-self: end; }
					&[data-tone="muted"] { --p-title-color: var(--t-color-text-muted); }
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
						&:hover { --s-background-color: var(--t-color-surface-raised); }
					}
				}
				@scope (.card) to ([data-component]) {
					[data-part="title"] { font-weight: 600; color: var(--p-title-color); }
					[data-part="footer"] { display: grid; }
					[data-part="body"] p { margin-block: var(--t-space-3); }
				}

				.tabs {
					--q-tabs-blocked: false;
					--p-tab-color: var(--c-tabs-tab-color, var(--t-color-text-muted));
					&[aria-disabled="true"] { --q-tabs-blocked: true; --p-tab-color: var(--t-color-text-disabled); }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--p-tab-color);
						--p-after-block-size: 0;
						color: var(--s-color);
						&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
							@container style(--q-tabs-blocked: false) { &:hover { --s-color: var(--t-color-text); } }
						}
						&[aria-selected="true"] { --s-color: var(--t-color-accent); --p-after-block-size: 2px; }
						&::after { content: ""; display: block; block-size: var(--p-after-block-size); }
					}
				}
			`,
		},
	],
	reject: [
		// The rules page's Reported cases.
		{
			description: "a part reads its component's own state variable",
			code: `
				.button {
					--s-display: inline-flex;
					display: var(--s-display);
				}
				@scope (.button) to ([data-component]) {
					[data-part="spinner"] { display: var(--s-display); }
				}
			`,
			warnings: [
				{
					message: `Unexpected "--s-display" read on part "spinner", where ".button" declares it. Read a part variable that ".button" declares for it, or declare its own.`,
					line: 6,
					column: 35,
					endLine: 6,
					endColumn: 51,
				},
			],
		},
		{
			description: "a part reads a part variable its component doesn't declare",
			code: `
				@scope (.note) to ([data-component]) {
					[data-part="title"] { color: var(--p-title-color); }
				}
			`,
			warnings: [
				{
					message: `Unexpected "--p-title-color" read on part "title" but never declared on ".note", so it would come from an outer component. Declare it on ".note" and write it in its variants or states.`,
					line: 2,
					column: 31,
				},
			],
		},
		{
			description: "a state changes a state variable nobody declared",
			code: `
				.button {
					&:hover { --s-opacity: 0.9; }
				}
			`,
			warnings: [
				{
					message: `Unexpected "--s-opacity" changed in ":hover" but never declared on ".button". Declare its default in the block of ".button".`,
					line: 2,
					column: 12,
					endLine: 2,
					endColumn: 23,
				},
			],
		},
		{
			description: "the component declares something it never changes",
			code: `
				.card { --p-title-font-weight: 600; }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { font-weight: var(--p-title-font-weight); }
				}
			`,
			warnings: [
				{
					message: `Unexpected "--p-title-font-weight" declared on ".card" but never changed by its variants, states or queries. Declare the value on part "title" instead.`,
					line: 1,
					column: 9,
					endLine: 1,
					endColumn: 30,
				},
			],
		},
		{
			description: "a private declared only in a variant",
			code: `
				.card {
					padding: var(--_padding, 1rem);
					&[data-size="large"] { --_padding: 2rem; }
				}
			`,
			warnings: [
				{
					message: `Unexpected "--_padding" changed in "[data-size="large"]" but never declared on ".card". Declare its default in the block of ".card".`,
					line: 3,
					column: 25,
				},
			],
		},
		{
			description: "a pseudo-element reads its component's state variable",
			code: `
				.link {
					--s-transform: scaleX(0);
					&::after { transform: var(--s-transform); }
				}
			`,
			warnings: [
				{
					message: `Unexpected "--s-transform" read on ".link::after", where ".link" declares it. Read a part variable that ".link" declares for it, or declare its own.`,
					line: 3,
					column: 24,
				},
			],
		},
		// What the rule's text says without a case.
		{
			description: "a part reads a shared private without taking it",
			code: `
				.card { --_accent: var(--t-color-foreground-accent); }
				@scope (.card) to ([data-component]) { [data-part="badge"] { color: var(--_accent); } }
			`,
			warnings: [
				{
					message: `Unexpected "--_accent" read on part "badge", where ".card" declares it. Take it on purpose with "--_accent: inherit" in the block of part "badge".`,
					line: 2,
					column: 69,
				},
			],
		},
		{
			description: "a state variable and a private nothing declares, in a component and outside one",
			code: `
				.card { display: var(--s-display); padding: var(--_padding); }
				a { color: var(--s-color); }
			`,
			warnings: [
				{
					message: `Unexpected "--s-display" read on ".card" but never declared there. Declare its default in the block of ".card".`,
					line: 1,
					column: 18,
				},
				{
					message: `Unexpected "--_padding" read on ".card" but never declared there. Declare its default in the block of ".card".`,
					line: 1,
					column: 45,
				},
				{
					message: `Unexpected "--s-color" read on "a" but never declared there. Declare its default in the block of "a".`,
					line: 2,
					column: 12,
				},
			],
		},
		{
			description: "a class reading a state variable it never declares, outside the utilities layer",
			code: `.stack { color: var(--s-color); }`,
			warnings: [
				{
					message: `Unexpected "--s-color" read on ".stack" but never declared there. Declare its default in the block of ".stack".`,
					line: 1,
					column: 17,
					endLine: 1,
					endColumn: 31,
				},
			],
		},
		{
			description: "a part's pseudo-element reads a part variable nobody declares for it",
			code: `
				.tabs { color: red; }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] { color: red; &::after { block-size: var(--p-after-block-size); } }
				}
			`,
			warnings: [
				{
					message: `Unexpected "--p-after-block-size" read on "::after" of part "tab" but never declared on part "tab", so it would come from an outer component. Declare it on part "tab" and write it in its variants or states.`,
					line: 3,
					column: 57,
				},
			],
		},
		{
			description: "only a private is taken with inherit",
			code: `
				.card { --s-c: red; --p-icon-c: red; --_accent: red; &:hover { --s-c: blue; --p-icon-c: blue; } }
				@scope (.card) to ([data-component]) {
					[data-part="icon"] {
						--s-c: inherit;
						--p-icon-c: inherit;
						--_accent: inherit;
						color: var(--s-c);
						background: var(--p-icon-c);
						border-color: var(--_accent);
					}
				}
			`,
			warnings: [
				{
					message: `Unexpected "--p-icon-c" on ".card" that no part reads. If a part was renamed, rename the variable to match.`,
					line: 1,
					column: 21,
					severity: "warning",
				},
				{
					message: `Unexpected "--s-c" taken with "inherit". Only a private is taken that way, so declare its default in the block of part "icon".`,
					line: 4,
					column: 10,
				},
				{
					message: `Unexpected "--p-icon-c" taken with "inherit". Only a private is taken that way, so remove it: part "icon" reads what its owner declares without declaring it.`,
					line: 5,
					column: 15,
				},
			],
		},
		// Renaming a part.
		{
			description: "a part variable, and a private named for a part, that no part reads",
			code: `
				.button {
					--_icon-color-hover: var(--t-color-neutral-800);
					--p-icon-color: var(--t-color-neutral-600);
					--p-glyph-inline-size: 16px;
					&:hover { --p-icon-color: var(--t-color-neutral-800); }
					&[data-size="small"] { --p-glyph-inline-size: 12px; }
				}
				@scope (.button) to ([data-component]) {
					[data-part="icon"] { inline-size: 1em; }
					[data-part="glyph"] { inline-size: var(--p-glyph-inline-size); }
				}
			`,
			warnings: [
				{
					message: `Unexpected "--_icon-color-hover" on ".button" that no part reads. If a part was renamed, rename the variable to match.`,
					line: 2,
					column: 2,
					endLine: 2,
					endColumn: 21,
					severity: "warning",
				},
				{
					message: `Unexpected "--p-icon-color" on ".button" that no part reads. If a part was renamed, rename the variable to match.`,
					line: 3,
					column: 2,
					severity: "warning",
				},
			],
		},
		{
			description:
				"a renamed part: its new name reads what nothing declares, and the old variable is read by nothing",
			code: `
				.button { --p-icon-color: var(--t-color-neutral-600); &:hover { --p-icon-color: var(--t-color-neutral-800); } }
				@scope (.button) to ([data-component]) { [data-part="glyph"] { color: var(--p-glyph-color); } }
			`,
			warnings: [
				{
					message: `Unexpected "--p-icon-color" on ".button" that no part reads. If a part was renamed, rename the variable to match.`,
					line: 1,
					column: 11,
					severity: "warning",
				},
				{
					message: `Unexpected "--p-glyph-color" read on part "glyph" but never declared on ".button", so it would come from an outer component. Declare it on ".button" and write it in its variants or states.`,
					line: 2,
					column: 71,
					severity: "error",
				},
			],
		},
		// Across files.
		{
			description: "with the root block in the file, an attribute scope is checked like any other",
			code: `
				[data-component="tabs"] { display: grid; }
				@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { gap: var(--p-list-gap); } }
			`,
			warnings: [
				{
					message: `Unexpected "--p-list-gap" read on part "list" but never declared on "[data-component="tabs"]", so it would come from an outer component. Declare it on "[data-component="tabs"]" and write it in its variants or states.`,
					line: 2,
					column: 84,
				},
			],
		},
		{
			description: "with the root block in another file, a private not named for the part, and a class scope",
			code: `
				@scope ([data-component="card"]) to ([data-component]) {
					[data-part="icon"] { color: var(--_unrelated); }
					[data-part="icon"] { color: var(--_icon-label-color); }
					[data-part="icon-label"] { margin: 0; }
				}
				@scope (.note) to ([data-component]) { [data-part="icon"] { color: var(--_icon-color); } }
			`,
			warnings: [
				{
					message: `Unexpected "--_unrelated" read on part "icon" but never declared there. Declare its default in the block of part "icon".`,
					line: 2,
					column: 30,
				},
				{
					message: `Unexpected "--_icon-label-color" read on part "icon" but never declared there. Declare its default in the block of part "icon".`,
					line: 3,
					column: 30,
				},
				{
					message: `Unexpected "--_icon-color" read on part "icon" but never declared there. Declare its default in the block of part "icon".`,
					line: 6,
					column: 68,
				},
			],
		},
		// From core's final audit (B18 to B23, R02).
		{
			description: "a part's own write never proves its owner's declaration",
			code: `
				.card { color: red; }
				@scope (.card) to ([data-component]) {
					[data-part="title"] {
						--p-title-color: red;
						color: var(--p-title-color);
						&:hover { --p-title-color: blue; }
					}
				}
			`,
			warnings: [
				{
					message: `Unexpected "--p-title-color" read on part "title" but never declared on ".card", so it would come from an outer component. Declare it on ".card" and write it in its variants or states.`,
					line: 5,
					column: 10,
				},
			],
		},
		{
			description: "a part variable whose value reads a changing private, with no change of its own",
			code: `
				.card { --_ink: red; --p-title-color: var(--_ink); &[data-tone="blue"] { --_ink: blue; } }
				@scope (.card) to ([data-component]) { [data-part="title"] { color: var(--p-title-color); } }
			`,
			warnings: [
				{
					message: `Unexpected "--p-title-color" declared on ".card" but never changed by its variants, states or queries. Declare the value on part "title" instead.`,
					line: 1,
					column: 22,
				},
			],
		},
		{
			description: "the root's own read doesn't count as a part reading its part variable",
			code: `
				.card { --p-title-color: black; color: var(--p-title-color); &:hover { --p-title-color: gray; } }
				@scope (.card) to ([data-component]) { [data-part="new"] { color: red; } }
			`,
			warnings: [
				{
					message: `Unexpected "--p-title-color" on ".card" that no part reads. If a part was renamed, rename the variable to match.`,
					line: 1,
					column: 9,
					severity: "warning",
				},
			],
		},
		{
			description: "a selector list reports a declaration once",
			code: `.card:hover, .card:focus { color: var(--s-missing); --s-x: 1; }`,
			warnings: [
				{
					message: `Unexpected "--s-missing" read on ".card" but never declared there. Declare its default in the block of ".card".`,
					line: 1,
					column: 35,
				},
				{
					message: `Unexpected "--s-x" changed in ":hover" but never declared on ".card". Declare its default in the block of ".card".`,
					line: 1,
					column: 53,
				},
			],
		},
	],
});

// Syntax core can't read, here an `@include`, which plain CSS reads as an unknown at-rule: an unknown excuses a missing declaration only on the element that would declare it.
testRule(noUndeclaredStateVariables, {
	accept: [
		{
			description: "a variable declared with a value core can't read still counts as declared",
			code: ".card { --s-color: #{$color}; color: var(--s-color); &:hover { --s-color: $hover; } }",
			skip: scss,
		},
		{
			description:
				"an @include on the root may declare the part variables and the privates it names for a part",
			code: `
				.card { @include theme; }
				@scope (.card) to ([data-component]) {
					[data-part="x"] { color: var(--p-x-color); background: var(--_x-background); }
				}
			`,
		},
		{
			description: "an @include on a part may declare its own state variable",
			code: `
				.card { --s-color: red; color: var(--s-color); }
				@scope (.card) to ([data-component]) {
					[data-part="x"] { @include theme; color: var(--s-color); }
				}
			`,
		},
		{
			description: "an @include in the own block may declare the default",
			code: ".card { @include theme; &:hover { --s-color: red; } }",
		},
	],
	reject: [
		{
			description: "an @include inside a part can't declare its owner's part variable",
			code: `
				.card { color: red; }
				@scope (.card) to ([data-component]) {
					[data-part="x"] { @include theme; color: var(--p-x-color); }
				}
			`,
			warnings: [
				{
					message: `Unexpected "--p-x-color" read on part "x" but never declared on ".card", so it would come from an outer component. Declare it on ".card" and write it in its variants or states.`,
					line: 3,
					column: 43,
				},
			],
		},
		{
			description:
				"an @include on the root can't declare a part's own state variable, or a private not named for it",
			code: `
				.card { @include theme; }
				@scope (.card) to ([data-component]) {
					[data-part="x"] { color: var(--s-missing); background: var(--_unrelated); }
				}
				.other { color: var(--s-c); }
			`,
			warnings: [
				{
					message: `Unexpected "--s-missing" read on part "x" but never declared there. Declare its default in the block of part "x".`,
					line: 3,
					column: 27,
				},
				{
					message: `Unexpected "--_unrelated" read on part "x" but never declared there. Declare its default in the block of part "x".`,
					line: 3,
					column: 57,
				},
				{
					message: `Unexpected "--s-c" read on ".other" but never declared there. Declare its default in the block of ".other".`,
					line: 5,
					column: 17,
				},
			],
		},
	],
});

// Vue's foreign selectors belong to another stylesheet.
testRule(noUndeclaredStateVariables, {
	accept: [
		{
			description: "what :global() selects is skipped, its writes and its reads",
			code: `:global(.w):hover { --s-color: red; color: var(--s-other); }`,
		},
	],
});

testRule(noUndeclaredStateVariables, {
	settings: { componentAttribute: "data-ui", partAttribute: "data-piece" },
	reject: [
		{
			description: "the owner named with the project's attribute names",
			code: `
				[data-ui="tabs"] { display: grid; }
				@scope ([data-ui="tabs"]) to ([data-ui]) { [data-piece="list"] { gap: var(--p-list-gap); } }
			`,
			warnings: [
				{
					message: `Unexpected "--p-list-gap" read on part "list" but never declared on "[data-ui="tabs"]", so it would come from an outer component. Declare it on "[data-ui="tabs"]" and write it in its variants or states.`,
					line: 2,
					column: 71,
				},
			],
		},
	],
});
