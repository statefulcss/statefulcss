import { describe, expect, it } from "vitest";

import type { Model, Variable } from "../model.js";
import { inEverySyntax } from "../testing/syntaxes.js";
import { namedFor } from "./variables.js";

const keyOf = (model: Model, id: number | undefined) =>
	id === undefined ? undefined : model.elements[id]?.key;
const variable = (model: Model, key: string, name: string): Variable | undefined =>
	model.variables.find((one) => one.name === name && keyOf(model, one.element) === key);
const variables = (model: Model) =>
	model.variables.map((one) => [keyOf(model, one.element), one.name, one.role]);
/** Each read, with the element whose variable it reaches. */
const sources = (model: Model) =>
	model.reads.map((read) => [
		keyOf(model, read.element),
		read.name,
		read.source === undefined ? undefined : keyOf(model, model.variables[read.source]?.element),
	]);
const namedElements = (model: Model, one: Variable | undefined) =>
	one?.namedFor.map((id) => keyOf(model, id));

// The parts page, "A part with states of its own", with what the details bench adds in cases 6 and 7.
const tabs = `
	.tabs {
		--q-tabs-blocked: false;
		--p-tab-color: var(--c-tabs-tab-color, var(--t-color-text-muted));
		--p-tab-after-opacity: 1;
		--p-tab-list-gap: var(--t-space-2);
		&[aria-disabled="true"] {
			--q-tabs-blocked: true;
			--p-tab-color: var(--t-color-text-disabled);
			--p-tab-after-opacity: 0.5;
		}
		&[data-size="large"] { --p-tab-list-gap: var(--t-space-4); }
	}

	@scope (.tabs) to ([data-component]) {
		[data-part="tab-list"] { display: flex; gap: var(--p-tab-list-gap); }
		[data-part="tab"] {
			--s-color: var(--p-tab-color);
			--p-after-block-size: 0;
			color: var(--s-color);

			&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
				@container style(--q-tabs-blocked: false) {
					&:hover { --s-color: var(--t-color-text); }
				}
			}
			&[aria-selected="true"] { --s-color: var(--t-color-accent); --p-after-block-size: 2px; }

			&::after {
				content: "";
				block-size: var(--p-after-block-size);
				opacity: var(--p-tab-after-opacity);
			}
		}
	}
`;

describe("variables", () => {
	inEverySyntax("one for each custom property on each element", ({ read }) => {
		const model = read(`
			.tabs { --s-color: black; color: var(--s-color); &:hover { --s-color: blue; } }
			@scope (.tabs) to ([data-component]) {
				[data-part="tab"] { --s-color: gray; color: var(--s-color); &::after { --s-color: red; } }
			}
			[data-theme] { --t-space-4: 1rem; }
		`);
		expect(variables(model)).toEqual([
			[".tabs", "--s-color", "state"],
			['.tabs [data-part="tab"]', "--s-color", "state"],
			['.tabs [data-part="tab"]::after', "--s-color", "state"],
			["[data-theme]", "--t-space-4", "token"],
		]);
		expect(model.variables.map((one) => [one.id, one.writes])).toEqual([
			[0, [0, 2]],
			[1, [3]],
			[2, [5]],
			[3, [6]],
		]);
		expect(model.elements.map((element) => [element.key, element.variables])).toEqual([
			[".tabs", [0]],
			['.tabs [data-part="tab"]', [1]],
			['.tabs [data-part="tab"]::after', [2]],
			["[data-theme]", [3]],
		]);
	});

	// Sources: the element-privates decision; the rules page, rule 4's cases.
	inEverySyntax("its default is its first write in a block with no variant or state", ({ read }) => {
		const model = read(`
			.button {
				--s-opacity: 1;
				--s-block-size: 100vh;
				@supports (block-size: 100dvh) { --s-block-size: 100dvh; }
				&:hover { --s-opacity: 0.9; --s-color: red; }
				&[data-size="large"] { --_padding: 2rem; }
				@media (width > 40rem) { --s-gap: 1rem; }
			}
			.badge { @supports (color: contrast-color(red)) { --s-color: contrast-color(red); } }
		`);
		expect(
			model.variables.map((one) => [
				one.name,
				one.default === undefined ? undefined : model.declarations[one.default]?.value,
				one.changes.map((id) => model.declarations[id]?.value),
			]),
		).toEqual([
			["--s-opacity", "1", ["0.9"]],
			["--s-block-size", "100vh", []],
			["--s-color", undefined, ["red"]],
			["--_padding", undefined, ["2rem"]],
			["--s-gap", undefined, ["1rem"]],
			["--s-color", "contrast-color(red)", []],
		]);
	});
});

describe("the elements a variable is named for", () => {
	// Sources: the parts page; the details bench, cases 6 and 7; the pseudo-element-state-variables decision.
	inEverySyntax("a root names its parts, and its parts' pseudo-elements as {part}-{pseudo}", ({ read }) => {
		const model = read(tabs);
		expect(model.unknowns).toEqual([]);
		const named = (key: string, name: string) => namedElements(model, variable(model, key, name));
		expect(named(".tabs", "--p-tab-color")).toEqual(['.tabs [data-part="tab"]']);
		expect(named(".tabs", "--p-tab-list-gap")).toEqual(['.tabs [data-part="tab-list"]']);
		expect(named(".tabs", "--p-tab-after-opacity")).toEqual(['.tabs [data-part="tab"]::after']);
		expect(named(".tabs", "--q-tabs-blocked")).toEqual([]);
		expect(named('.tabs [data-part="tab"]', "--p-after-block-size")).toEqual([
			'.tabs [data-part="tab"]::after',
		]);
		expect(named('.tabs [data-part="tab"]', "--s-color")).toEqual([]);
	});

	// Sources: the methodology's "How values reach parts"; the slotted-placement-per-state decision.
	inEverySyntax(
		"a root names its slots, its own pseudo-elements, and the parts its privates are for",
		({ read }) => {
			const model = read(`
			.toolbar {
				--_icon-color: var(--t-color-neutral-600);
				--_gutter: var(--t-space-2);
				--p-icon-color: var(--_icon-color);
				--p-item-align-self: auto;
				--p-after-opacity: 0;
				--p-title-color: black;
				--p-icon: 1;
				& > [data-slot="item"] { align-self: var(--p-item-align-self); }
				&::after { opacity: var(--p-after-opacity); }
				&[data-orientation="vertical"] { --p-item-align-self: stretch; }
			}
			@scope (.toolbar) to ([data-component]) {
				[data-part="icon"] { color: var(--p-icon-color); }
				[data-part="item"] { margin: 0; }
			}
		`);
			const named = (name: string) => namedElements(model, variable(model, ".toolbar", name));
			expect(named("--_icon-color")).toEqual(['.toolbar [data-part="icon"]']);
			expect(named("--_gutter")).toEqual([]);
			expect(named("--p-icon-color")).toEqual(['.toolbar [data-part="icon"]']);
			expect(named("--p-icon")).toEqual(['.toolbar [data-part="icon"]']);
			expect(named("--p-item-align-self")).toEqual([
				'.toolbar [data-slot="item"]',
				'.toolbar [data-part="item"]',
			]);
			expect(named("--p-after-opacity")).toEqual([".toolbar::after"]);
			expect(named("--p-title-color")).toEqual([]);
		},
	);

	inEverySyntax("only a root and a part name anything", ({ read }) => {
		const model = read(`
			.card { --p-title-color: black; & > [data-slot="action"] { --p-title-color: red; } }
			@scope (.card) to ([data-component]) {
				[data-part="title"] { --p-title-color: blue; --p-after-opacity: 0; }
				[data-part="title"]::after { --p-after-opacity: 1; }
			}
			a { --p-title-color: green; &::after { content: ""; } }
		`);
		expect(
			model.variables.map((one) => [keyOf(model, one.element), one.name, namedElements(model, one)]),
		).toEqual([
			[".card", "--p-title-color", ['.card [data-part="title"]']],
			['.card [data-slot="action"]', "--p-title-color", []],
			['.card [data-part="title"]', "--p-title-color", []],
			['.card [data-part="title"]', "--p-after-opacity", ['.card [data-part="title"]::after']],
			['.card [data-part="title"]::after', "--p-after-opacity", []],
			["a", "--p-title-color", []],
		]);
	});

	it("the helper: the longest name that starts the variable's name", () => {
		const names = ["tab", "tab-list", "tab-after", "after", "icon"];
		expect(namedFor("--p-tab-color", names)).toBe("tab");
		expect(namedFor("--p-tab-list-gap", names)).toBe("tab-list");
		expect(namedFor("--p-tab-after-opacity", names)).toBe("tab-after");
		expect(namedFor("--p-after-opacity", names)).toBe("after");
		expect(namedFor("--_icon-color-hover", names)).toBe("icon");
		expect(namedFor("--p-icon", names)).toBe("icon");
		expect(namedFor("--p-iconography-size", names)).toBeUndefined();
		expect(namedFor("--p-title-color", names)).toBeUndefined();
		expect(namedFor("--p-tab-color", [])).toBeUndefined();
	});
});

describe("the variable a read reaches", () => {
	inEverySyntax("the element's own, else its owner's, up to the component root", ({ read }) => {
		const model = read(tabs);
		expect(sources(model)).toEqual([
			[".tabs", "--c-tabs-tab-color", undefined],
			[".tabs", "--t-color-text-muted", undefined],
			[".tabs", "--t-space-2", undefined],
			[".tabs", "--t-color-text-disabled", undefined],
			[".tabs", "--t-space-4", undefined],
			['.tabs [data-part="tab-list"]', "--p-tab-list-gap", ".tabs"],
			['.tabs [data-part="tab"]', "--p-tab-color", ".tabs"],
			['.tabs [data-part="tab"]', "--s-color", '.tabs [data-part="tab"]'],
			['.tabs [data-part="tab"]', "--q-tabs-blocked", ".tabs"],
			['.tabs [data-part="tab"]', "--t-color-text", undefined],
			['.tabs [data-part="tab"]', "--t-color-accent", undefined],
			['.tabs [data-part="tab"]::after', "--p-after-block-size", '.tabs [data-part="tab"]'],
			['.tabs [data-part="tab"]::after', "--p-tab-after-opacity", ".tabs"],
		]);
		expect(
			variable(model, ".tabs", "--p-tab-color")?.reads.map((id) => keyOf(model, model.reads[id]?.element)),
		).toEqual(['.tabs [data-part="tab"]']);
		expect(variable(model, ".tabs", "--q-tabs-blocked")?.reads.map((id) => model.reads[id]?.via)).toEqual([
			"style-query",
		]);
	});

	// Source: the rules page, rule 4's cases: what the rule has to tell apart.
	inEverySyntax(
		"a part's read of its component's own state variable is linked, for a rule to judge",
		({ read }) => {
			const model = read(`
			.button { --s-display: inline-flex; --_accent: red; display: var(--s-display); }
			@scope (.button) to ([data-component]) {
				[data-part="spinner"] { display: var(--s-display); color: var(--_accent); }
				[data-part="badge"] { --_accent: inherit; color: var(--_accent); }
				[data-part="title"] { color: var(--p-title-color); margin: var(--_gap); }
			}
			a { color: var(--s-color); }
		`);
			expect(sources(model)).toEqual([
				[".button", "--s-display", ".button"],
				['.button [data-part="spinner"]', "--s-display", ".button"],
				['.button [data-part="spinner"]', "--_accent", ".button"],
				['.button [data-part="badge"]', "--_accent", '.button [data-part="badge"]'],
				['.button [data-part="title"]', "--p-title-color", undefined],
				['.button [data-part="title"]', "--_gap", undefined],
				["a", "--s-color", undefined],
			]);
			expect(model.declarations.find((declaration) => declaration.inherits)?.property).toBe("--_accent");
		},
	);

	inEverySyntax(
		"a pseudo-element reads through its host, content through the part it's under, a slot from the root",
		({ read }) => {
			const model = read(`
			.card {
				--s-transform: scaleX(0);
				--p-after-transform: scaleX(0);
				--p-body-color: black;
				--p-action-align-self: end;
				&::after { transform: var(--s-transform) var(--p-after-transform); }
				& > [data-slot="action"] { align-self: var(--p-action-align-self); }
			}
			@scope (.card) to ([data-component]) {
				[data-part="body"] { --_gap: 1rem; }
				[data-part="body"] p { color: var(--p-body-color); margin: var(--_gap); }
				[data-part="body"] p::first-line { color: var(--p-body-color); }
				.hljs-keyword { color: var(--p-body-color); }
			}
		`);
			expect(sources(model)).toEqual([
				[".card::after", "--s-transform", ".card"],
				[".card::after", "--p-after-transform", ".card"],
				['.card [data-slot="action"]', "--p-action-align-self", ".card"],
				['.card [data-part="body"] p', "--p-body-color", ".card"],
				['.card [data-part="body"] p', "--_gap", '.card [data-part="body"]'],
				['.card [data-part="body"] p::first-line', "--p-body-color", ".card"],
				[".card .hljs-keyword", "--p-body-color", ".card"],
			]);
		},
	);

	inEverySyntax("a read never reaches another component's variable", ({ read }) => {
		const model = read(`
			.card { --_card-accent: red; --s-color: black; }
			.badge { background-color: var(--_card-accent); color: var(--s-color); }
		`);
		expect(sources(model)).toEqual([
			[".badge", "--_card-accent", undefined],
			[".badge", "--s-color", undefined],
		]);
	});
});

describe("whether a variable is changing", () => {
	// Sources: the rules page, rules 4 and 6.
	inEverySyntax("a variant or a state writes it, or its value reads one that is", ({ read }) => {
		const model = read(`
			.card {
				--_gap: var(--t-space-4);
				--_half: calc(var(--_gap) / 2);
				--_quarter: calc(var(--_half) / 2);
				--_static: var(--t-space-1);
				--s-margin-block: var(--_quarter);
				--s-padding: var(--_static);
				--p-title-font-weight: 600;
				--p-icon-color: var(--_icon-color);
				--_icon-color: var(--t-color-neutral-600);
				--p-label-color: var(--c-card-label-color, var(--_gap));
				&[data-density="compact"] { --_gap: var(--t-space-2); }
				&[data-intent="danger"] { --_icon-color: var(--t-color-danger-600); }
			}
		`);
		expect(model.variables.map((one) => [one.name, one.changing])).toEqual([
			["--_gap", true],
			["--_half", true],
			["--_quarter", true],
			["--_static", false],
			["--s-margin-block", true],
			["--s-padding", false],
			["--p-title-font-weight", false],
			["--p-icon-color", true],
			["--_icon-color", true],
			["--p-label-color", true],
		]);
	});

	inEverySyntax("through what a part reads from its owner, and never in circles", ({ read }) => {
		const model = read(`
			.tabs {
				--p-tab-color: black;
				--_a: var(--_b);
				--_b: var(--_a);
				@container (inline-size > 30rem) { --p-tab-color: gray; }
			}
			@scope (.tabs) to ([data-component]) {
				[data-part="tab"] { --s-color: var(--p-tab-color); --s-gap: 0; color: var(--s-color); }
			}
		`);
		expect(model.variables.map((one) => [keyOf(model, one.element), one.name, one.changing])).toEqual([
			[".tabs", "--p-tab-color", true],
			[".tabs", "--_a", false],
			[".tabs", "--_b", false],
			['.tabs [data-part="tab"]', "--s-color", true],
			['.tabs [data-part="tab"]', "--s-gap", false],
		]);
	});
});
