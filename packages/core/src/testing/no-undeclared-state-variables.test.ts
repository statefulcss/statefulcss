import { describe, expect } from "vitest";

import { noUndeclaredStateVariables } from "./no-undeclared-state-variables.js";
import { inEverySyntax } from "./syntaxes.js";

// Every case of `no-undeclared-state-variables` on the rules page (rule 4). Each reported case is followed by the
// same CSS fixed, which must report nothing. Where the page shows only part of a component, the case completes it.
const cases: { name: string; css: string; problems: [problem: string, name: string][] }[] = [
	{
		name: "reported: a part reads its component's own state variable",
		css: `
			.button { --s-display: inline-flex; display: var(--s-display); }
			@scope (.button) to ([data-component]) { [data-part="spinner"] { display: var(--s-display); } }
		`,
		problems: [["state-variable-of-another-element", "--s-display"]],
	},
	{
		name: "fixed: the Button prepares the spinner's part variable, and its state writes it",
		css: `
			.button {
				--s-display: inline-flex;
				--p-spinner-display: none;
				display: var(--s-display);
				&[data-loading] { --p-spinner-display: block; }
			}
			@scope (.button) to ([data-component]) { [data-part="spinner"] { display: var(--p-spinner-display); } }
		`,
		problems: [],
	},
	{
		name: "reported: a part reads a part variable its component doesn't declare",
		css: '@scope (.note) to ([data-component]) { [data-part="title"] { color: var(--p-title-color); } }',
		problems: [["not-declared-by-owner", "--p-title-color"]],
	},
	{
		name: "fixed: the Note declares it, and its variant writes it",
		css: `
			.note { --p-title-color: var(--t-color-text); &[data-tone="muted"] { --p-title-color: var(--t-color-text-muted); } }
			@scope (.note) to ([data-component]) { [data-part="title"] { color: var(--p-title-color); } }
		`,
		problems: [],
	},
	{
		name: "reported: a state changes a state variable nobody declared",
		css: ".button { &:hover { --s-opacity: 0.9; } }",
		problems: [["no-default", "--s-opacity"]],
	},
	{
		name: "fixed: declared in the element's own block",
		css: ".button { --s-opacity: 1; opacity: var(--s-opacity); &:hover { --s-opacity: 0.9; } }",
		problems: [],
	},
	{
		name: "reported: the component declares something it never changes",
		css: `
			.card { --p-title-font-weight: 600; }
			@scope (.card) to ([data-component]) { [data-part="title"] { font-weight: var(--p-title-font-weight); } }
		`,
		problems: [["unchanging-part-variable", "--p-title-font-weight"]],
	},
	{
		name: "fixed: the title declares it",
		css: '@scope (.card) to ([data-component]) { [data-part="title"] { font-weight: 600; } }',
		problems: [],
	},
	{
		name: "reported: a private declared only in a variant",
		css: '.card { padding: var(--_padding, 1rem); &[data-size="large"] { --_padding: 2rem; } }',
		problems: [["no-default", "--_padding"]],
	},
	{
		name: "fixed: no state changes it, so the variant writes the state variable",
		css: '.card { --s-padding: 1rem; padding: var(--s-padding); &[data-size="large"] { --s-padding: 2rem; } }',
		problems: [],
	},
	{
		name: "reported: a pseudo-element reads its component's state variable",
		css: ".link { --s-transform: scaleX(0); &::after { transform: var(--s-transform); } }",
		problems: [["state-variable-of-another-element", "--s-transform"]],
	},
	{
		name: "fixed: the link prepares a part variable for its pseudo-element",
		css: `
			.link {
				--p-after-transform: scaleX(0);
				&::after { transform: var(--p-after-transform); }
				&[aria-current="page"] { --p-after-transform: scaleX(1); }
			}
		`,
		problems: [],
	},
	{
		name: "not reported: a part reading the part variables its component declares for it",
		css: `
			.button {
				--_icon-color: var(--t-color-neutral-600);
				--_icon-color-hover: var(--t-color-neutral-800);
				--p-icon-color: var(--_icon-color);
				&:hover { --p-icon-color: var(--_icon-color-hover); }
			}
			@scope (.button) to ([data-component]) { [data-part="icon"] { color: var(--p-icon-color); } }
		`,
		problems: [],
	},
	{
		name: "not reported: a part with a state of its own, starting from what the component prepared",
		css: `
			.tabs { --p-tab-color: var(--t-color-text-muted); &[aria-disabled="true"] { --p-tab-color: var(--t-color-text-disabled); } }
			@scope (.tabs) to ([data-component]) {
				[data-part="tab"] {
					--s-color: var(--p-tab-color);
					color: var(--s-color);
					&[aria-selected="true"] { --s-color: var(--t-color-accent); }
				}
			}
		`,
		problems: [],
	},
	{
		name: "not reported: a part feeding its own pseudo-element",
		css: `
			@scope (.tabs) to ([data-component]) {
				[data-part="tab"] {
					--p-after-block-size: 0;
					&[aria-selected="true"] { --p-after-block-size: 2px; }
					&::after { block-size: var(--p-after-block-size); }
				}
			}
		`,
		problems: [],
	},
	{
		name: "not reported: a part taking a shared private with inherit",
		css: `
			.card { --_accent: var(--t-color-foreground-accent); }
			@scope (.card) to ([data-component]) { [data-part="badge"] { --_accent: inherit; color: var(--_accent); } }
		`,
		problems: [],
	},
	// What the rule's text says without a case
	{
		name: "reported: a part reads a shared private without taking it",
		css: `
			.card { --_accent: var(--t-color-foreground-accent); }
			@scope (.card) to ([data-component]) { [data-part="badge"] { color: var(--_accent); } }
		`,
		problems: [["private-of-another-element", "--_accent"]],
	},
	{
		name: "reported: a state variable and a private nothing declares, in a component and outside one",
		css: `
			.card { display: var(--s-display); padding: var(--_padding); }
			a { color: var(--s-color); }
		`,
		problems: [
			["undeclared", "--s-display"],
			["undeclared", "--_padding"],
			["undeclared", "--s-color"],
		],
	},
	{
		name: "not reported: each element has its own set, pseudo-elements included",
		css: `
			.tab {
				--s-opacity: 1;
				opacity: var(--s-opacity);
				&::after { --s-opacity: 0; opacity: var(--s-opacity); }
				&[aria-selected="true"]::after { --s-opacity: 1; }
			}
		`,
		problems: [],
	},
	{
		name: "not reported: a private named for a part, read by that part, its pseudo-element and its content",
		css: `
			.card {
				--_body-color: var(--t-color-text);
				--p-body-color: var(--_body-color);
				&[data-tone="muted"] { --_body-color: var(--t-color-text-muted); }
			}
			@scope (.card) to ([data-component]) {
				[data-part="body"] { color: var(--p-body-color); border-color: var(--_body-color); }
				[data-part="body"] p { color: var(--p-body-color); outline-color: var(--_body-color); }
				[data-part="body"]::after { color: var(--_body-color); }
			}
		`,
		problems: [],
	},
	// Across files
	{
		name: "not reported: parts styled from another file read part variables this file can't see",
		css: `
			@scope ([data-component="tabs"]) to ([data-component]) {
				[data-part="list"] { display: flex; gap: var(--p-list-gap); }
			}
		`,
		problems: [],
	},
	{
		name: "not reported: a root block whose parts are styled in another file",
		css: '.tabs { --p-list-gap: var(--t-space-2); &[data-size="large"] { --p-list-gap: var(--t-space-4); } }',
		problems: [],
	},
	{
		name: "reported: with the root block in the file, an attribute scope is checked like any other",
		css: `
			[data-component="tabs"] { display: grid; }
			@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { gap: var(--p-list-gap); } }
		`,
		problems: [["not-declared-by-owner", "--p-list-gap"]],
	},
	// Renaming a part
	{
		name: "warning: a part variable, and a private named for a part, that no part reads",
		css: `
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
		problems: [
			["unread", "--_icon-color-hover"],
			["unread", "--p-icon-color"],
		],
	},
	{
		name: "a part was renamed: its new name reads what nothing declares, and the old variable is read by nothing",
		css: `
			.button { --p-icon-color: var(--t-color-neutral-600); &:hover { --p-icon-color: var(--t-color-neutral-800); } }
			@scope (.button) to ([data-component]) { [data-part="glyph"] { color: var(--p-glyph-color); } }
		`,
		problems: [
			["not-declared-by-owner", "--p-glyph-color"],
			["unread", "--p-icon-color"],
		],
	},
];

describe("no-undeclared-state-variables, as a check over the model", () => {
	for (const { name, css, problems } of cases) {
		inEverySyntax(name, ({ read }) => {
			const model = read(css);
			expect(model.unknowns).toEqual([]);
			expect(noUndeclaredStateVariables(model).map((finding) => [finding.problem, finding.name])).toEqual(
				problems,
			);
		});
	}

	inEverySyntax("the rename check is a warning, and every other finding an error", ({ read }) => {
		const findings = noUndeclaredStateVariables(
			read(`
				.button { --p-icon-color: black; color: var(--s-color); &:hover { --p-icon-color: gray; } }
				@scope (.button) to ([data-component]) { [data-part="glyph"] { inline-size: 1em; } }
			`),
		);
		expect(findings.map((finding) => [finding.problem, finding.severity, finding.node.type])).toEqual([
			["undeclared", "error", "decl"],
			["unread", "warning", "decl"],
		]);
	});

	inEverySyntax(
		"a variable declared with a value core can't read still counts as declared",
		({ read }) => {
			const model = read(
				".card { --s-color: #{$color}; color: var(--s-color); &:hover { --s-color: $hover; } }",
			);
			expect(noUndeclaredStateVariables(model)).toEqual([]);
		},
		{ skip: { css: "SCSS syntax", vue: "SCSS syntax, in a plain <style> block" } },
	);

	// The whole components of the parts page and the methodology report nothing.
	inEverySyntax("the Card and Tabs of the parts page report nothing", ({ read }) => {
		const model = read(`
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
				[data-part="body"] a { color: var(--t-color-link); }
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
					&::after { content: ""; display: block; block-size: var(--p-after-block-size); background-color: currentColor; }
				}
			}
		`);
		expect(noUndeclaredStateVariables(model)).toEqual([]);
	});

	inEverySyntax("the Button and Field of the methodology report nothing", ({ read }) => {
		const model = read(`
			.button {
				--_background-color: var(--t-color-neutral-100);
				--_background-color-hover: var(--t-color-neutral-200);
				--s-background-color: var(--_background-color);
				--s-opacity: 1;
				--p-icon-inline-size: 16px;
				background-color: var(--s-background-color);
				opacity: var(--s-opacity);
				border-radius: var(--c-button-border-radius, var(--t-radius-medium));
				& > [data-slot="badge"] { margin-inline-start: auto; }
				&[data-intent="danger"] {
					--_background-color: var(--t-color-danger-100);
					--_background-color-hover: var(--t-color-danger-200);
				}
				&[data-size="small"] { --p-icon-inline-size: 12px; }
				&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
					&:hover { --s-background-color: var(--_background-color-hover); }
				}
				&:disabled, &[aria-disabled="true"], &[data-loading] { --s-opacity: 0.5; }
			}
			@scope (.button) to ([data-component]) {
				[data-part="icon"] { inline-size: var(--p-icon-inline-size); }
			}

			.field {
				--p-label-color: var(--t-color-foreground-base);
				--s-opacity: 1;
				--q-field-blocked: false;
				opacity: var(--s-opacity);
				&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert], :has(:where([data-part="input"]):disabled))) {
					&:hover { --p-label-color: var(--t-color-foreground-strong); }
				}
				&:has(:where([data-part="input"])[aria-invalid="true"]) { --p-label-color: var(--t-color-foreground-danger); }
				&:has(:where([data-part="input"]):disabled) { --s-opacity: 0.6; --q-field-blocked: true; }
			}
			@scope (.field) to ([data-component]) {
				[data-part="label"] { color: var(--p-label-color); }
			}
		`);
		expect(noUndeclaredStateVariables(model)).toEqual([]);
	});
});
