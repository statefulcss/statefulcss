import { testRule } from "../../testing/test-rule.js";
import partsInScope from "./index.js";

const scope = (root: string): string => `@scope (${root}) to ([data-component])`;

testRule(partsInScope, {
	accept: [
		// The rules page's Fixed cases.
		{
			description: "the Button's icon inside its scope",
			code: `
				@scope (.button) to ([data-component]) {
					[data-part="icon"] { inline-size: 1em; }
				}
			`,
		},
		{
			description: "a scope limited by the component attribute",
			code: `
				@scope (.card) to ([data-component]) {
					[data-part="title"] { font-weight: 600; }
				}
			`,
		},
		{
			description: "the scope after the root block",
			code: `
				.button { }
				@scope (.button) to ([data-component]) { [data-part="icon"] { inline-size: 1em; } }
			`,
		},
		{
			description: "the root's states in the root block",
			code: `
				.button {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) { &:hover { --s-opacity: 0.9; } }
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		// The rules page's Not reported cases.
		{
			description: "placement from the root block through parts into a slot",
			code: `.card { & > [data-part="footer"] > [data-slot="action"] { justify-self: end; } }`,
		},
		{
			description: "a state on a part reached from the root block",
			code: `.field { &:has(:where([data-part="input"]):disabled) { --s-opacity: 0.6; } }`,
		},
		{
			description: "the same state inside the guard",
			code: `
				.field {
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert], :has(:where([data-part="input"]):disabled))) {
						&:hover { --p-label-color: black; }
					}
				}
			`,
		},
		{
			description: "a file that styles another file's component's parts",
			code: `@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { display: flex; } }`,
		},
		{
			description: "bare elements and other classes inside a scope",
			code: `
				.article { color: black; }
				@scope (.article) to ([data-component]) {
					[data-part="body"] p { margin: 0; }
					.hljs-keyword { color: purple; }
					:scope > [data-part="icon"] { inline-size: 1em; }
				}
			`,
		},
		// The fixed forms of the checks the rules page lists without a case.
		{
			description: ":scope > inside a scope",
			code: `@scope (.button) to ([data-component]) { :scope > [data-part="icon"] { inline-size: 1em; } }`,
		},
		{
			description: "a variant that writes a part variable on the root",
			code: `
				.button { --p-icon-inline-size: 16px; &[data-size="small"] { --p-icon-inline-size: 12px; } }
				@scope (.button) to ([data-component]) { [data-part="icon"] { inline-size: var(--p-icon-inline-size); } }
			`,
		},
		{
			description: "the part alone, or :scope > for a direct child",
			code: `
				@scope (.button) to ([data-component]) {
					[data-part="icon"] { inline-size: 1em; }
					:scope > [data-part="label"] { color: red; }
					:scope > [data-part="label"] span { color: blue; }
				}
			`,
		},
		{
			description: "a part with a state of its own, and a part's pseudo-element",
			code: `
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] { &[aria-selected="true"] { color: blue; } &::after:hover { opacity: 1; } }
					:scope > [data-part="tab"]:hover { color: red; }
				}
			`,
		},
		{
			description: "a scope that belongs to no component",
			code: `@scope (main) { a { color: red; } }`,
		},
		{
			description: "a part that only :deep() selects",
			code: `.card :deep([data-part="title"]) { color: red; }`,
		},
	],
	reject: [
		// The rules page's Reported cases.
		{
			description: "the Button's icon outside its scope",
			code: `.button [data-part="icon"] { inline-size: 1em; }`,
			warnings: [
				{
					message: `Unexpected "[data-part="icon"]" outside its component's scope. Move it into "${scope(".button")}".`,
					line: 1,
					column: 9,
					endLine: 1,
					endColumn: 27,
				},
			],
		},
		{
			description: "a scope limited by any class",
			code: `
				@scope (.card) to ([class]) {
					[data-part="title"] { font-weight: 600; }
				}
			`,
			warnings: [
				{
					message: `Unexpected limit "to ([class])" on the scope of ".card". Limit it with "to ([data-component])".`,
					line: 1,
					column: 16,
					endLine: 1,
					endColumn: 28,
				},
			],
		},
		{
			description: "a scope nested in the root block",
			code: `
				.button {
					@scope (&) to ([data-component]) { [data-part="icon"] { inline-size: 1em; } }
				}
			`,
			warnings: [
				{
					message: `Unexpected "@scope" inside a rule. Write "${scope(".button")}" after the root block.`,
					line: 2,
					column: 9,
					endLine: 2,
					endColumn: 34,
				},
			],
		},
		{
			description: "a root state written inside the scope",
			code: `
				.button { --s-opacity: 1; opacity: var(--s-opacity); &:disabled { --s-opacity: 0.5; } }
				@scope (.button) to ([data-component]) {
					:scope:hover { --s-opacity: 0.9; }
				}
			`,
			warnings: [
				{
					message: `Unexpected ":hover" on the scope's root. Write the root's variants and states in its root block.`,
					line: 3,
					column: 8,
					endLine: 3,
					endColumn: 14,
				},
			],
		},
		// The checks the rules page lists without a case.
		{
			description: "a scope with no limit, and one limited by parts",
			code: `
				.card { color: red; }
				@scope (.card) { [data-part="title"] { font-weight: 600; } }
				@scope (.card) to ([data-part]) { [data-part="body"] { margin: 0; } }
			`,
			warnings: [
				{
					message: `Expected a limit on the scope of ".card". Add "to ([data-component])" after its root.`,
					line: 2,
					column: 8,
					endLine: 2,
					endColumn: 15,
				},
				{
					message: `Unexpected limit "to ([data-part])" on the scope of ".card". Limit it with "to ([data-component])".`,
					line: 3,
					column: 16,
					endLine: 3,
					endColumn: 32,
				},
			],
		},
		{
			description: "a nested scope without a root, and one whose root isn't the rule's own element",
			code: `
				.button { color: red; @scope to ([data-component]) { [data-part="icon"] { inline-size: 1em; } } }
				.card { color: red; @scope (.title) to ([data-component]) { p { margin: 0; } } }
			`,
			warnings: [
				{
					message: `Unexpected "@scope" inside a rule. Write the component's scope after its root block.`,
					line: 1,
					column: 30,
				},
				{
					message: `Unexpected "@scope" inside a rule. Write the component's scope after its root block.`,
					line: 2,
					column: 28,
				},
			],
		},
		{
			description: "the scope written before the root block",
			code: `
				@scope (.card) to ([data-component]) { [data-part="title"] { font-weight: 600; } }
				.card { color: red; }
			`,
			warnings: [
				{
					message: `Unexpected scope of ".card" before its root block. Move it after the root block.`,
					line: 1,
					column: 8,
					endLine: 1,
					endColumn: 37,
				},
			],
		},
		{
			description: "& > inside a scope",
			code: `@scope (.button) to ([data-component]) { & > [data-part="icon"] { inline-size: 1em; } }`,
			warnings: [
				{
					message: `Expected ":scope >" instead of "& >" inside a scope.`,
					line: 1,
					column: 42,
					endLine: 1,
					endColumn: 43,
				},
			],
			fixed: `@scope (.button) to ([data-component]) { :scope > [data-part="icon"] { inline-size: 1em; } }`,
		},
		{
			description: "& before a part inside a scope",
			code: `
				@scope (.button) to ([data-component]) {
					& [data-part="icon"] { inline-size: 1em; }
					[data-part="badge"], &  /* note */  [data-part="label"] { color: red; }
				}
			`,
			warnings: [
				{
					message: `Unexpected "&" before a descendant inside a scope. Remove "& " and select the descendant on its own.`,
					line: 2,
					column: 2,
					endLine: 2,
					endColumn: 3,
				},
				{
					message: `Unexpected "&" before a descendant inside a scope. Remove "& " and select the descendant on its own.`,
					line: 3,
					column: 23,
					endLine: 3,
					endColumn: 24,
				},
			],
			fixed: `
				@scope (.button) to ([data-component]) {
					[data-part="icon"] { inline-size: 1em; }
					[data-part="badge"], [data-part="label"] { color: red; }
				}
			`,
		},
		{
			description: ":scope with a space before a part, and before content",
			code: `
				@scope (.button) to ([data-component]) {
					:scope [data-part="icon"] { inline-size: 1em; }
					:scope [data-part="label"]:hover { color: red; }
					:scope p { margin: 0; }
				}
			`,
			warnings: [
				{
					message: `Unexpected ":scope" before a descendant inside a scope. Remove ":scope " and select the descendant on its own.`,
					line: 2,
					column: 2,
					endLine: 2,
					endColumn: 8,
				},
				{
					message: `Unexpected ":scope" before a descendant inside a scope. Remove ":scope " and select the descendant on its own.`,
					line: 3,
					column: 2,
					endLine: 3,
					endColumn: 8,
				},
				{
					message: `Unexpected ":scope" before a descendant inside a scope. Remove ":scope " and select the descendant on its own.`,
					line: 4,
					column: 2,
					endLine: 4,
					endColumn: 8,
				},
			],
			fixed: `
				@scope (.button) to ([data-component]) {
					[data-part="icon"] { inline-size: 1em; }
					[data-part="label"]:hover { color: red; }
					p { margin: 0; }
				}
			`,
		},
		{
			description: ":scope before a part that :where() wraps, which is left for the author",
			code: `@scope (.button) to ([data-component]) { :scope :where([data-part="icon"]) { inline-size: 1em; } }`,
			warnings: [
				{
					message: `Unexpected ":scope" before a descendant inside a scope. Remove ":scope " and select the descendant on its own.`,
					line: 1,
					column: 42,
				},
			],
			fixed: `@scope (.button) to ([data-component]) { :scope :where([data-part="icon"]) { inline-size: 1em; } }`,
		},
		{
			description: ":scope with an attribute, a variant selecting a part",
			code: `
				@scope (.button) to ([data-component]) {
					:scope[data-size="small"] [data-part="icon"] { inline-size: 12px; }
				}
			`,
			warnings: [
				{
					message: `Unexpected "[data-size="small"]" on the scope's root, selecting inside it. Write "[data-size="small"]" in the root block, setting a part variable that the part reads.`,
					line: 2,
					column: 8,
					endLine: 2,
					endColumn: 27,
				},
			],
		},
		{
			description: "a root variant, and a state of the root's pseudo-element, written inside the scope",
			code: `
				@scope (.button) to ([data-component]) {
					:scope[data-size="small"] { gap: 0; }
					:scope:hover::after { opacity: 1; }
					:scope { @media (width > 40rem) { &:focus-visible { outline: 0; } } }
				}
			`,
			warnings: [
				{
					message: `Unexpected "[data-size="small"]" on the scope's root. Write the root's variants and states in its root block.`,
					line: 2,
					column: 8,
				},
				{
					message: `Unexpected ":hover" on the scope's root. Write the root's variants and states in its root block.`,
					line: 3,
					column: 8,
				},
				{
					message: `Unexpected ":focus-visible" on the scope's root. Write the root's variants and states in its root block.`,
					line: 4,
					column: 37,
				},
			],
		},
		{
			description: "the root written bare inside the scope, which beats a root block that comes later",
			code: `
				@scope (.card) to ([data-component]) {
					:scope { color: red; }
				}
				.card { color: blue; }
			`,
			warnings: [
				{
					message: `Unexpected scope of ".card" before its root block. Move it after the root block.`,
					line: 1,
					column: 8,
				},
				{
					message: `Unexpected ":scope" without ">" inside a scope. Move its declarations to the root block.`,
					line: 2,
					column: 2,
					endLine: 2,
					endColumn: 8,
				},
			],
		},
		{
			description: "the root's pseudo-element, and declarations written directly in the scope",
			code: `
				.card { color: blue; }
				@scope (.card) to ([data-component]) {
					:scope::after { content: ""; }
					padding: 0;
				}
			`,
			warnings: [
				{
					message: `Unexpected ":scope" without ">" inside a scope. Move its declarations to the root block.`,
					line: 3,
					column: 2,
				},
				{
					message: "Unexpected declarations directly inside a scope. Move them to the root block.",
					line: 4,
					column: 2,
				},
			],
		},
		{
			description: "a part attribute on a component root's own compound",
			code: `.tab[data-part="tab"] { color: red; }`,
			warnings: [
				{
					message: `Unexpected "[data-part="tab"]" on the component root ".tab". An element is a component or a part, so remove one of the two.`,
					line: 1,
					column: 5,
					endLine: 1,
					endColumn: 22,
				},
			],
		},
		{
			description: "a part selected from the root block, and by a variant of the root",
			code: `
				.button {
					& [data-part="icon"] { inline-size: 1em; }
					&[data-size="small"] { & [data-part="icon"] { inline-size: 12px; } }
				}
			`,
			warnings: [
				{
					message: `Unexpected "[data-part="icon"]" outside its component's scope. Move it into "${scope(".button")}".`,
					line: 2,
					column: 4,
				},
				{
					message: `Unexpected "[data-part="icon"]" outside its component's scope. Move it into "${scope(".button")}".`,
					line: 3,
					column: 27,
				},
			],
		},
		{
			description: "a part selected outside the scope of a component named by its attribute",
			code: `[data-component="tabs"] > [data-part="list"] { display: flex; }`,
			warnings: [
				{
					message: `Unexpected "[data-part="list"]" outside its component's scope. Move it into "${scope('[data-component="tabs"]')}".`,
					line: 1,
					column: 27,
				},
			],
		},
		{
			description: "a part in a rule that names no component",
			code: `main [data-part="title"] { color: red; }`,
			warnings: [
				{
					message: `Unexpected "[data-part="title"]" outside a component's scope. Move it into the scope of the component it belongs to.`,
					line: 1,
					column: 6,
				},
			],
		},
		{
			description: "a part under a selector list that names two components, reported once",
			code: `.card, .button { & [data-part="icon"] { inline-size: 1em; } }`,
			warnings: [
				{
					message: `Unexpected "[data-part="icon"]" outside its component's scope. Move it into "${scope(".card")}".`,
					line: 1,
					column: 20,
				},
			],
		},
		{
			description: "a placement path that doesn't step with >",
			code: `.card { & [data-part="footer"] [data-slot="action"] { justify-self: end; } }`,
			warnings: [
				{
					message: `Unexpected "[data-part="footer"]" on a placement path that doesn't step through parts with ">". Step from the root through parts, each with ">", into the slot.`,
					line: 1,
					column: 11,
					endLine: 1,
					endColumn: 31,
				},
			],
		},
		{
			description: "a placement path through a plain element, and one through a sibling",
			code: `
				.card {
					& > div > [data-part="footer"] > [data-slot="action"] { justify-self: end; }
					& > [data-part="header"] + [data-part="body"] > [data-slot="action"] { justify-self: start; }
				}
			`,
			warnings: [
				{
					message: `Unexpected "[data-part="footer"]" on a placement path that doesn't step through parts with ">". Step from the root through parts, each with ">", into the slot.`,
					line: 2,
					column: 12,
				},
				{
					message: `Unexpected "[data-part="header"]" outside its component's scope. Move it into "${scope(".card")}".`,
					line: 3,
					column: 6,
				},
				{
					message: `Unexpected "[data-part="body"]" on a placement path that doesn't step through parts with ">". Step from the root through parts, each with ">", into the slot.`,
					line: 3,
					column: 29,
				},
			],
		},
		{
			description: "each selector of a list in a scope, in either order",
			code: `
				.card { color: red; }
				@scope (.card) to ([data-component]) {
					[data-part="x"], :scope:hover { color: red; }
					:scope:focus, [data-part="y"] { color: red; }
				}
			`,
			warnings: [
				{
					message: `Unexpected ":hover" on the scope's root. Write the root's variants and states in its root block.`,
					line: 3,
					column: 25,
				},
				{
					message: `Unexpected ":focus" on the scope's root. Write the root's variants and states in its root block.`,
					line: 4,
					column: 8,
				},
			],
		},
	],
});

testRule(partsInScope, {
	settings: { componentAttribute: "data-ui", partAttribute: "data-piece" },
	accept: [
		{
			description: "the project's own attribute names",
			code: `@scope ([data-ui="tabs"]) to ([data-ui]) { [data-piece="list"] { display: flex; } }`,
		},
	],
	reject: [
		{
			description: "the scope to move into, written with the project's attribute names",
			code: `
				.tabs { color: red; }
				.tabs > [data-piece="list"] { display: flex; }
				@scope (.tabs) to ([data-component]) { [data-piece="tab"] { color: red; } }
			`,
			warnings: [
				{
					message: `Unexpected "[data-piece="list"]" outside its component's scope. Move it into "@scope (.tabs) to ([data-ui])".`,
					line: 2,
					column: 9,
				},
				{
					message: `Unexpected limit "to ([data-component])" on the scope of ".tabs". Limit it with "to ([data-ui])".`,
					line: 3,
					column: 16,
				},
			],
		},
	],
});
