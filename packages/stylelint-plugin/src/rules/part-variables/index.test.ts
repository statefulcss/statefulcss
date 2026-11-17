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
			description: "a root writing a part variable named for nothing, left to the rename warning",
			code: `.card { --p-heading-color: red; }`,
		},
		{
			description: "a slot's placement through parts, each with >",
			code: `.card { --p-action-x: 1; &:hover { --p-action-x: 2; } & > [data-part="footer"] > [data-slot="action"] { gap: var(--p-action-x); } }`,
		},
		{
			description: "a slot's placement path through a part that goes wrong, left to parts-in-scope",
			code: `.card { --p-action-x: 1; &:hover { --p-action-x: 2; } & [data-part="footer"] > [data-slot="action"] { gap: var(--p-action-x); } }`,
		},
		{
			description: "a part variable with no property after the part's name",
			code: `
				.button { --p-icon: red; &:hover { --p-icon: blue; } }
				@scope (.button) to ([data-component]) { [data-part="icon"] { color: var(--p-icon); } }
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
						'Unexpected "--p-title-color" read on ".card > p", which is under no part. Only a part, its pseudo-elements, the content under a part and a slot at the end of the root block\'s placement path read part variables.',
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
		// A writer with no right to the variable, whether or not the file styles what it's named for.
		{
			description: "a part writes a part variable named for none of its pseudo-elements",
			code: `
				.card { color: red; }
				@scope (.card) to ([data-component]) { [data-part="title"] { --p-heading-color: red; } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-heading-color" written on part "title", which writes only the part variables for its own pseudo-elements, such as "--p-after-*". Give part "title" a plain value or its own state variable.',
					line: 2,
					column: 62,
					endLine: 2,
					endColumn: 79,
				},
			],
		},
		{
			description: "content under no part writes a part variable",
			code: `
				.card { color: red; }
				@scope (.card) to ([data-component]) { p { --p-heading-color: red; } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-heading-color" written on ".card p", which declares no part variables. Only a component\'s root, and a part for its own pseudo-elements, write them, so give ".card p" a plain value or its own state variable.',
					line: 2,
					column: 44,
					endLine: 2,
					endColumn: 61,
				},
			],
		},
		{
			description: "a part's pseudo-element writes a part variable named for nothing",
			code: `
				.card { color: red; }
				@scope (.card) to ([data-component]) { [data-part="tab"]::after { --p-mystery-color: red; } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-mystery-color" written on "::after" of part "tab", which declares no part variables. Only a component\'s root, and a part for its own pseudo-elements, write them, so give "::after" of part "tab" a plain value or its own state variable.',
					line: 2,
					column: 67,
					endLine: 2,
					endColumn: 84,
				},
			],
		},
		{
			description: "a slot in the root block writes a part variable named for nothing",
			code: `
				.card { color: red; & > [data-slot="action"] { --p-heading-color: red; } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-heading-color" written on slot "action", which declares no part variables. Only a component\'s root, and a part for its own pseudo-elements, write them, so give slot "action" a plain value or its own state variable.',
					line: 1,
					column: 48,
					endLine: 1,
					endColumn: 65,
				},
			],
		},
		{
			description: "a slot writes its own part variable",
			code: `
				.card { --p-action-gap: 1; &:hover { --p-action-gap: 2; } & > [data-slot="action"] { --p-action-gap: 3; gap: var(--p-action-gap); } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-action-gap" written on slot "action", its own part variable. Only ".card" writes it, so give slot "action" a plain value or its own state variable.',
					line: 1,
					column: 86,
					endLine: 1,
					endColumn: 100,
				},
			],
		},
		// A slot reads only at the end of the root block's placement path, and owns nothing.
		{
			description: "a slot reads its part variable in the scope, which its limit leaves out",
			code: `
				.card { --p-action-x: 1; &:hover { --p-action-x: 2; } }
				@scope (.card) to ([data-component]) { [data-slot="action"] { gap: var(--p-action-x); } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-action-x" read on slot "action" outside the root block\'s placement path. The scope\'s limit leaves the slotted component out, so read it in the root block, at "& > [data-slot="action"]" or through parts with ">".',
					line: 2,
					column: 68,
					endLine: 2,
					endColumn: 85,
				},
			],
		},
		{
			description: "a slot reads its part variable as a descendant of the root",
			code: `
				.card { --p-action-x: 1; &:hover { --p-action-x: 2; } & [data-slot="action"] { gap: var(--p-action-x); } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-action-x" read on slot "action" outside the root block\'s placement path. The scope\'s limit leaves the slotted component out, so read it in the root block, at "& > [data-slot="action"]" or through parts with ">".',
					line: 1,
					column: 85,
					endLine: 1,
					endColumn: 102,
				},
			],
		},
		{
			description: "a slot reads its part variable through a plain element",
			code: `
				.card { --p-action-x: 1; &:hover { --p-action-x: 2; } & > div > [data-slot="action"] { gap: var(--p-action-x); } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-action-x" read on slot "action" outside the root block\'s placement path. The scope\'s limit leaves the slotted component out, so read it in the root block, at "& > [data-slot="action"]" or through parts with ">".',
					line: 1,
					column: 93,
					endLine: 1,
					endColumn: 110,
				},
			],
		},
		{
			description: "a slot writes a part variable for its own pseudo-element",
			code: `
				.card { color: red; & > [data-slot="action"] { --p-after-x: 1; &::after { gap: var(--p-after-x); } } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-after-x" written on slot "action", which declares no part variables. Only a component\'s root, and a part for its own pseudo-elements, write them, so give slot "action" a plain value or its own state variable.',
					line: 1,
					column: 48,
					endLine: 1,
					endColumn: 59,
				},
				{
					message:
						'Unexpected "--p-after-x" read on "::after" of slot "action", which belongs to the slotted component. A slot reads its part variables only at the end of the root block\'s placement path, and the slotted component styles its own pseudo-elements.',
					line: 1,
					column: 80,
					endLine: 1,
					endColumn: 96,
				},
			],
		},
		{
			description: "a slot's pseudo-element reads what the root declares for it",
			code: `
				.card { --p-action-after-x: 1; &:hover { --p-action-after-x: 2; } & > [data-slot="action"]::after { gap: var(--p-action-after-x); } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-action-after-x" read on "::after" of slot "action", which belongs to the slotted component. A slot reads its part variables only at the end of the root block\'s placement path, and the slotted component styles its own pseudo-elements.',
					line: 1,
					column: 106,
					endLine: 1,
					endColumn: 129,
				},
			],
		},
		// One written declaration, one finding, each reader paired with its own owner.
		{
			description: "one write on two parts, one of them the part it's for",
			code: `
				.card { --p-icon-x: 0; &:hover { --p-icon-x: 2; } }
				@scope (.card) to ([data-component]) { [data-part="icon"] { color: var(--p-icon-x); } [data-part=icon], [data-part=label] { --p-icon-x: 1 } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-icon-x" written on part "icon" and part "label", but it\'s the part variable for part "icon". Only ".card" writes it, in its own block, variants, states and queries.',
					line: 2,
					column: 125,
					endLine: 2,
					endColumn: 135,
				},
			],
		},
		{
			description: "one write on two parts, the other way round",
			code: `
				.card { --p-icon-x: 0; &:hover { --p-icon-x: 2; } }
				@scope (.card) to ([data-component]) { [data-part="icon"] { color: var(--p-icon-x); } [data-part=label], [data-part=icon] { --p-icon-x: 1 } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-icon-x" written on part "label" and part "icon", but it\'s the part variable for part "icon". Only ".card" writes it, in its own block, variants, states and queries.',
					line: 2,
					column: 125,
					endLine: 2,
					endColumn: 135,
				},
			],
		},
		{
			description: "one read by the parts of two components, each prefix with its own root",
			code: `
				.card, .note { --p-title-color: red; &:hover { --p-title-color: blue; } }
				@scope (.card) to ([data-component]) { [data-part="title"] { color: var(--p-title-color); } }
				@scope (.note) to ([data-component]) { [data-part="title"] { color: var(--p-title-color); } }
				.card [data-part="badge"], .note [data-part="meta"] { color: var(--p-title-color); }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-title-color" read on part "badge" and part "meta", but it\'s the part variable for part "title". Read "--p-badge-*", declared on ".card", and "--p-meta-*", declared on ".note", instead.',
					line: 4,
					column: 62,
					endLine: 4,
					endColumn: 82,
				},
			],
		},
		// A named part reads only its own, even under another part.
		{
			description: "a part under another part reads that part's variable",
			code: `
				.card { --p-body-color: red; &:hover { --p-body-color: blue; } }
				@scope (.card) to ([data-component]) { [data-part="body"] { color: var(--p-body-color); } [data-part="body"] [data-part="link"] { color: var(--p-body-color); } }
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-body-color" read on part "link", but it\'s the part variable for part "body". Read "--p-link-*", declared on ".card", instead.',
					line: 2,
					column: 138,
					endLine: 2,
					endColumn: 157,
				},
			],
		},
	],
});
