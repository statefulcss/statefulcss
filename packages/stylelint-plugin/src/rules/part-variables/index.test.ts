import { testRule } from "../../testing/test-rule.js";
import partVariables from "./index.js";

testRule(partVariables, {
	accept: [
		// The rules page's Fixed cases.
		{
			description: "the icon writes its own part variable",
			code: `
				@scope (.button) to ([data-component]) {
					[data-part="icon"] { color: red; }
				}
			`,
		},
		{
			description: "the label reads the icon's part variable",
			code: `
				.button { --p-label-color: var(--t-color-text); &[data-loading] { --p-label-color: var(--t-color-text-muted); } }
				@scope (.button) to ([data-component]) {
					[data-part="label"] { color: var(--p-label-color); }
				}
			`,
		},
		{
			description: "the root binds a part variable on itself",
			code: `.button { --s-color: red; color: var(--s-color); }`,
		},
		// The rules page's Not reported cases.
		{
			description: "a part's pseudo-element reading what its part declares for it",
			code: `
				.tabs { color: red; }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] { --p-after-block-size: 0; &::after { block-size: var(--p-after-block-size); } }
				}
			`,
		},
		{
			description: "the root feeding a part's pseudo-element",
			code: `
				.tabs { --p-tab-after-opacity: 1; &[aria-disabled="true"] { --p-tab-after-opacity: 0.5; } }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"]::after { opacity: var(--p-tab-after-opacity); }
				}
			`,
		},
		{
			description: "a slot's placement",
			code: `.toolbar { --p-item-align-self: auto; & > [data-slot="item"] { align-self: var(--p-item-align-self); } }`,
		},
		// What the rule's checks imply.
		{
			description: "content under a part reads its part's variable",
			code: `
				.card { --p-body-color: black; &:hover { --p-body-color: blue; } }
				@scope (.card) to ([data-component]) {
					[data-part="body"] p { color: var(--p-body-color); }
				}
			`,
		},
		{
			description: "the root's own pseudo-element reads what the root declares for it",
			code: `.link { --p-after-opacity: 0; &:hover { --p-after-opacity: 1; } &::after { opacity: var(--p-after-opacity); } }`,
		},
		{
			description:
				"a part writing a part variable named for nothing the component has, such as its pseudo-element's styled elsewhere",
			code: `
				.card { color: red; }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { --p-before-content: "#"; }
				}
			`,
		},
		{
			description: "a part taking a part variable with inherit, left to no-undeclared-state-variables",
			code: `
				.card { --p-title-color: red; &:hover { --p-title-color: blue; } }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { --p-title-color: inherit; color: var(--p-title-color); }
				}
			`,
		},
		{
			description: "a style query on a part variable",
			code: `
				.card { --p-title-color: red; &:hover { --p-title-color: blue; } }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { @container style(--p-title-color: blue) { font-weight: 600; } }
				}
			`,
		},
		{
			description: "a global element, a utility and what :deep() selects",
			code: `
				main { --p-icon-color: red; color: var(--p-icon-color); }
				@layer utilities { .u-tint { --p-icon-color: red; color: var(--p-icon-color); } }
				.button :deep(.icon) { --p-icon-color: red; color: var(--p-icon-color); }
			`,
		},
	],
	reject: [
		// The rules page's Reported cases.
		{
			description: "the icon writes its own part variable",
			code: `
				@scope (.button) to ([data-component]) {
					[data-part="icon"] { --p-icon-color: red; color: var(--p-icon-color); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-icon-color" written on part "icon", its own part variable. Only ".button" writes it, so give part "icon" a plain value or its own state variable.',
					line: 2,
					column: 23,
					endLine: 2,
					endColumn: 37,
				},
			],
		},
		{
			description: "the label reads the icon's part variable",
			code: `
				.button { --p-icon-color: var(--t-color-text); &[data-loading] { --p-icon-color: var(--t-color-text-muted); } }
				@scope (.button) to ([data-component]) {
					[data-part="label"] { color: var(--p-icon-color); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-icon-color" read on part "label", which reads only the part variables named for it. Read "--p-label-*", declared on ".button", instead.',
					line: 3,
					column: 31,
					endLine: 3,
					endColumn: 50,
				},
			],
		},
		{
			description: "the root binds a part variable on itself",
			code: `.button { --p-icon-color: red; color: var(--p-icon-color); }`,
			warnings: [
				{
					message:
						'Unexpected "--p-icon-color" read on ".button", which declares part variables for its parts. Bind the root\'s own value with a state variable instead.',
					line: 1,
					column: 39,
					endLine: 1,
					endColumn: 58,
				},
			],
		},
		// What the rule's checks imply.
		{
			description: "a part writes another part's variable",
			code: `
				.card { color: red; }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { color: var(--p-title-color); }
					[data-part="badge"] { --p-title-color: red; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-title-color" written on part "badge", but it\'s the part variable for part "title". Only ".card" writes it, in its own block, variants, states and queries.',
					line: 4,
					column: 24,
					endLine: 4,
					endColumn: 39,
				},
			],
		},
		{
			description: "a part writes in its state the variable its component declares for it",
			code: `
				.card { --p-title-color: black; &:hover { --p-title-color: blue; } }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { color: var(--p-title-color); &:focus-visible { --p-title-color: red; } }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-title-color" written on part "title", its own part variable. Only ".card" writes it, so give part "title" a plain value or its own state variable.',
					line: 3,
					column: 71,
					endLine: 3,
					endColumn: 86,
				},
			],
		},
		{
			description: "content under a part writes its part's variable",
			code: `
				.card { --p-body-color: black; &:hover { --p-body-color: blue; } }
				@scope (.card) to ([data-component]) {
					[data-part="body"] p { --p-body-color: red; color: var(--p-body-color); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-body-color" written on ".card [data-part="body"] p", but it\'s the part variable for part "body". Only ".card" writes it, in its own block, variants, states and queries.',
					line: 3,
					column: 25,
					endLine: 3,
					endColumn: 39,
				},
			],
		},
		{
			description: "a part's pseudo-element writes what its part declares for it",
			code: `
				.tabs { color: red; }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] { &::after { --p-after-block-size: 0; block-size: var(--p-after-block-size); } }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-after-block-size" written on "::after" of part "tab", its own part variable. Only part "tab" writes it, so give "::after" of part "tab" a plain value or its own state variable.',
					line: 3,
					column: 33,
					endLine: 3,
					endColumn: 53,
				},
			],
		},
		{
			description: "a part writes the root's variable for the part's pseudo-element",
			code: `
				.tabs { color: red; }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] { --p-tab-after-opacity: 1; &::after { opacity: var(--p-tab-after-opacity); } }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-tab-after-opacity" written on part "tab", but it\'s the part variable for "::after" of part "tab". Only ".tabs" writes it, in its own block, variants, states and queries.',
					line: 3,
					column: 22,
					endLine: 3,
					endColumn: 43,
				},
			],
		},
		{
			description: "a part reads the variable the root declares for the part's pseudo-element",
			code: `
				.tabs { --p-tab-after-opacity: 1; &[aria-disabled="true"] { --p-tab-after-opacity: 0.5; } }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] { opacity: var(--p-tab-after-opacity); &::after { opacity: var(--p-tab-after-opacity); } }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-tab-after-opacity" read on part "tab", but it\'s the part variable for "::after" of part "tab". Read "--p-tab-*", declared on ".tabs", instead.',
					line: 3,
					column: 31,
					endLine: 3,
					endColumn: 57,
				},
			],
		},
		{
			description: "a slot reads a part's variable",
			code: `
				.toolbar { --p-icon-color: red; &:hover { --p-icon-color: blue; } & > [data-slot="item"] { color: var(--p-icon-color); } }
				@scope (.toolbar) to ([data-component]) {
					[data-part="icon"] { color: var(--p-icon-color); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-icon-color" read on slot "item", but it\'s the part variable for part "icon". Read "--p-item-*", declared on ".toolbar", instead.',
					line: 1,
					column: 99,
					endLine: 1,
					endColumn: 118,
				},
			],
		},
		{
			description: "the root's pseudo-element reads a part's variable",
			code: `
				.card { --p-title-color: red; &:hover { --p-title-color: blue; } &::after { color: var(--p-title-color); } }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { color: var(--p-title-color); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-title-color" read on ".card::after", but it\'s the part variable for part "title". Read "--p-after-*", declared on ".card", instead.',
					line: 1,
					column: 84,
					endLine: 1,
					endColumn: 104,
				},
			],
		},
		{
			description: "content in the scope, under no part, reads a part's variable",
			code: `
				.card { --p-title-color: red; &:hover { --p-title-color: blue; } }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { color: var(--p-title-color); }
					:scope > p { color: var(--p-title-color); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-title-color" read on ".card > p", which is under no part. Only a part, its pseudo-elements and the content under a part read part variables.',
					line: 4,
					column: 22,
					endLine: 4,
					endColumn: 42,
				},
			],
		},
		{
			description: "a part reads a part variable named for nothing the component has",
			code: `
				.card { --p-heading-color: red; &:hover { --p-heading-color: blue; } }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { color: var(--p-heading-color); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-heading-color" read on part "title", which reads only the part variables named for it. Read "--p-title-*", declared on ".card", instead.',
					line: 3,
					column: 31,
					endLine: 3,
					endColumn: 53,
				},
			],
		},
		{
			description: "one written read on the parts of two components, reported once",
			code: `
				.card, .note { --p-title-color: red; &:hover { --p-title-color: blue; } }
				@scope (.card) to ([data-component]) { [data-part="title"] { color: var(--p-title-color); } }
				@scope (.note) to ([data-component]) { [data-part="title"] { color: var(--p-title-color); } }
				.card [data-part="badge"], .note [data-part="badge"] { color: var(--p-title-color); }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-title-color" read on part "badge", but it\'s the part variable for part "title". Read "--p-badge-*", declared on ".card" and ".note", instead.',
					line: 4,
					column: 63,
					endLine: 4,
					endColumn: 83,
				},
			],
		},
		{
			description: "a selector list of two parts reads another part's variable once",
			code: `
				.card { --p-title-color: red; &:hover { --p-title-color: blue; } }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { color: var(--p-title-color); }
					[data-part="badge"], [data-part="meta"] { color: var(--p-title-color); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-title-color" read on part "badge" and part "meta", but it\'s the part variable for part "title". Read "--p-badge-*" and "--p-meta-*", declared on ".card", instead.',
					line: 4,
					column: 51,
					endLine: 4,
					endColumn: 71,
				},
			],
		},
	],
});
