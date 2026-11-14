import { describe, expect } from "vitest";

import { partsInScope } from "./parts-in-scope.js";
import { inEverySyntax } from "./syntaxes.js";

// Every case of `parts-in-scope` on the rules page (rule 9), and the checks its text lists without a case.
// Each case is a pair: the reported CSS, and the same CSS fixed, which must report nothing.
const cases: { name: string; css: string; problems: string[] }[] = [
	{
		name: "reported: a part outside the Button's scope",
		css: '.button [data-part="icon"] { inline-size: 1em; }',
		problems: ["part-outside-scope"],
	},
	{
		name: "fixed: the part inside the scope",
		css: '@scope (.button) to ([data-component]) { [data-part="icon"] { inline-size: 1em; } }',
		problems: [],
	},
	{
		name: "reported: a limit that stops at any class",
		css: '@scope (.card) to ([class]) { [data-part="title"] { font-weight: 600; } }',
		problems: ["scope-limit"],
	},
	{
		name: "fixed: the limit is the component attribute",
		css: '@scope (.card) to ([data-component]) { [data-part="title"] { font-weight: 600; } }',
		problems: [],
	},
	{
		name: "reported: the scope is nested in the root block",
		css: '.button { @scope (&) to ([data-component]) { [data-part="icon"] { inline-size: 1em; } } }',
		problems: ["scope-nested"],
	},
	{
		name: "fixed: the scope after the root block",
		css: '.button { } @scope (.button) to ([data-component]) { [data-part="icon"] { inline-size: 1em; } }',
		problems: [],
	},
	{
		name: "reported: a scope with no limit, and one limited by parts",
		css: `
			.card { color: red; }
			@scope (.card) { [data-part="title"] { font-weight: 600; } }
			@scope (.card) to ([data-part]) { [data-part="body"] { margin: 0; } }
		`,
		problems: ["scope-limit", "scope-limit"],
	},
	{
		name: "reported: a nested scope without a root, which applies nothing",
		css: '.button { color: red; @scope to ([data-component]) { [data-part="icon"] { inline-size: 1em; } } }',
		problems: ["scope-nested"],
	},
	{
		name: "reported: a nested scope whose root isn't the rule's own element",
		css: ".card { color: red; @scope (.title) to ([data-component]) { p { margin: 0; } } }",
		problems: ["scope-nested"],
	},
	{
		name: "reported: & > inside a scope",
		css: '@scope (.button) to ([data-component]) { & > [data-part="icon"] { inline-size: 1em; } }',
		problems: ["nesting-selector-in-scope"],
	},
	{
		name: "fixed: :scope > inside a scope",
		css: '@scope (.button) to ([data-component]) { :scope > [data-part="icon"] { inline-size: 1em; } }',
		problems: [],
	},
	{
		name: "reported: :scope with an attribute, a variant selecting a part",
		css: `
			@scope (.button) to ([data-component]) {
				:scope[data-size="small"] [data-part="icon"] { inline-size: 12px; }
			}
		`,
		problems: ["condition-on-scope-root"],
	},
	{
		name: "fixed: the variant writes a part variable on the root",
		css: `
			.button { --p-icon-inline-size: 16px; &[data-size="small"] { --p-icon-inline-size: 12px; } }
			@scope (.button) to ([data-component]) { [data-part="icon"] { inline-size: var(--p-icon-inline-size); } }
		`,
		problems: [],
	},
	{
		name: "reported: a root state written inside the scope",
		css: `
			.button { --s-opacity: 1; opacity: var(--s-opacity); &:disabled { --s-opacity: 0.5; } }
			@scope (.button) to ([data-component]) {
				:scope:hover { --s-opacity: 0.9; }
			}
		`,
		problems: ["condition-on-scope-root"],
	},
	{
		name: "fixed: the root's states stay in the root block",
		css: `
			.button {
				--s-opacity: 1;
				opacity: var(--s-opacity);
				&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) { &:hover { --s-opacity: 0.9; } }
				&:disabled { --s-opacity: 0.5; }
			}
		`,
		problems: [],
	},
	{
		name: "reported: a root variant, and a state of the root's pseudo-element, written inside the scope",
		css: `
			@scope (.button) to ([data-component]) {
				:scope[data-size="small"] { gap: 0; }
				:scope:hover::after { opacity: 1; }
				:scope { @media (width > 40rem) { &:focus-visible { outline: 0; } } }
			}
		`,
		problems: ["condition-on-scope-root", "condition-on-scope-root", "condition-on-scope-root"],
	},
	{
		name: "reported: the root written bare inside the scope, which beats a root block that comes later",
		css: `
			@scope (.card) to ([data-component]) {
				:scope { color: red; }
			}
			.card { color: blue; }
		`,
		problems: ["scope-before-root-block", "root-styled-in-scope"],
	},
	{
		name: "fixed: the root's declarations are in the root block",
		css: `
			.card { color: red; }
			@scope (.card) to ([data-component]) { [data-part="title"] { font-weight: 600; } }
		`,
		problems: [],
	},
	{
		name: "reported: the root's pseudo-element, and declarations written directly in the scope",
		css: `
			.card { color: blue; }
			@scope (.card) to ([data-component]) {
				:scope::after { content: ""; }
				padding: 0;
			}
		`,
		problems: ["root-styled-in-scope", "root-styled-in-scope"],
	},
	{
		name: "not reported: a part with a state of its own, and a part's pseudo-element",
		css: `
			@scope (.tabs) to ([data-component]) {
				[data-part="tab"] { &[aria-selected="true"] { color: blue; } &::after:hover { opacity: 1; } }
				:scope > [data-part="tab"]:hover { color: red; }
			}
		`,
		problems: [],
	},
	{
		name: "reported: the scope is written before the root block",
		css: '@scope (.card) to ([data-component]) { [data-part="title"] { font-weight: 600; } } .card { color: red; }',
		problems: ["scope-before-root-block"],
	},
	{
		name: "reported: a part attribute on a component root's own compound",
		css: '.tab[data-part="tab"] { color: red; }',
		problems: ["part-outside-scope"],
	},
	{
		name: "reported: a part selected from the root block, and by a variant of the root",
		css: `
			.button {
				& [data-part="icon"] { inline-size: 1em; }
				&[data-size="small"] { & [data-part="icon"] { inline-size: 12px; } }
			}
		`,
		problems: ["part-outside-scope", "part-outside-scope"],
	},
	{
		name: "reported: a placement path that doesn't step with >",
		css: '.card { & [data-part="footer"] [data-slot="action"] { justify-self: end; } }',
		problems: ["placement-path-not-direct"],
	},
	{
		name: "reported: a part in a rule that names no component",
		css: 'main [data-part="title"] { color: red; }',
		problems: ["part-outside-scope"],
	},
	{
		name: "not reported: placement from the root block through parts into a slot",
		css: '.card { & > [data-part="footer"] > [data-slot="action"] { justify-self: end; } }',
		problems: [],
	},
	{
		name: "not reported: a state on a part reached from the root block",
		css: '.field { &:has(:where([data-part="input"]):disabled) { --s-opacity: 0.6; } }',
		problems: [],
	},
	{
		name: "not reported: the same state inside the guard",
		css: `
			.field {
				&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert], :has(:where([data-part="input"]):disabled))) {
					&:hover { --p-label-color: black; }
				}
			}
		`,
		problems: [],
	},
	{
		name: "not reported: a file that styles another file's component's parts",
		css: '@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { display: flex; } }',
		problems: [],
	},
	{
		name: "not reported: bare elements and other classes inside a scope",
		css: `
			.article { color: black; }
			@scope (.article) to ([data-component]) {
				[data-part="body"] p { margin: 0; }
				.hljs-keyword { color: purple; }
				:scope > [data-part="icon"] { inline-size: 1em; }
			}
		`,
		problems: [],
	},
	{
		name: "not reported: a scope that belongs to no component",
		css: "@scope (main) { a { color: red; } }",
		problems: [],
	},
];

describe("parts-in-scope, as a check over the model", () => {
	for (const { name, css, problems } of cases) {
		inEverySyntax(name, ({ read }) => {
			expect(partsInScope(read(css)).map((finding) => finding.problem)).toEqual(problems);
		});
	}

	inEverySyntax("each finding points at where it was written", ({ read }) => {
		const model = read(`
			.card { color: red; & [data-part="title"] { color: blue; } }
			@scope (.card) to ([class]) { [data-part="body"] { margin: 0; } }
		`);
		expect(
			partsInScope(model).map((finding) => [
				finding.problem,
				finding.node.type === "rule" ? finding.node.selector : `@${finding.node.name} ${finding.node.params}`,
			]),
		).toEqual([
			["part-outside-scope", '& [data-part="title"]'],
			["scope-limit", "@scope (.card) to ([class])"],
		]);
	});
});
