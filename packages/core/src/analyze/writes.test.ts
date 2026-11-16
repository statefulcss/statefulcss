import { describe, expect } from "vitest";

import type { Model } from "../model.js";
import { inEverySyntax } from "../testing/syntaxes.js";

const keyOf = (model: Model, id: number | undefined) =>
	id === undefined ? undefined : model.elements[id]?.key;
const valueOf = (model: Model, id: number | undefined) =>
	id === undefined ? undefined : model.declarations[id]?.value;
const variables = (model: Model) =>
	model.variables.map((one) => [
		keyOf(model, one.element),
		one.name,
		one.writes.map((id) => valueOf(model, id)),
		valueOf(model, one.default),
	]);
const blocks = (model: Model) =>
	model.blocks.map((block) => [
		block.selector,
		block.kind,
		block.declarations.map((id) => valueOf(model, id)),
	]);
/** The reads on a component's own elements that reach no variable: what rule 4 reports as undeclared. */
const unreached = (model: Model) =>
	model.reads
		.filter((read) => read.source === undefined && model.elements[read.element]?.kind !== "foreign")
		.map((read) => read.name);

describe("declarations around a nested rule", () => {
	inEverySyntax("are in the order they're written, and so are a variable's writes", ({ read }) => {
		const model = read(".card { & { --s-v: 1; } --s-v: 2; }");
		expect(blocks(model)).toEqual([
			[".card", "own", ["1"]],
			[".card", "own", ["2"]],
		]);
		expect(variables(model)).toEqual([[".card", "--s-v", ["1", "2"], "1"]]);
		expect(
			model.declarations.map((declaration) => [declaration.id, declaration.block, declaration.value]),
		).toEqual([
			[0, 0, "1"],
			[1, 1, "2"],
		]);
	});

	inEverySyntax("a rule written around a nested one makes a block for each run", ({ read }) => {
		const model = read(".card { --s-v: 1; & { --s-v: 2; } --s-v: 3; }");
		expect(blocks(model)).toEqual([
			[".card", "own", ["1"]],
			[".card", "own", ["2"]],
			[".card", "own", ["3"]],
		]);
		expect(variables(model)).toEqual([[".card", "--s-v", ["1", "2", "3"], "1"]]);
		expect(model.blocks[0]?.node).toBe(model.blocks[2]?.node);
		expect(model.blocks[0]?.node).not.toBe(model.blocks[1]?.node);
		expect(model.elements[0]?.blocks).toEqual([0, 1, 2]);
	});

	inEverySyntax("a state and a query between two runs keep their place", ({ read }) => {
		const model = read(`
			.card {
				--s-color: red;
				&:hover { --s-color: blue; }
				--s-gap: 0;
				@media (width > 40rem) { --s-gap: 1rem; }
				color: var(--s-color);
			}
		`);
		expect(blocks(model)).toEqual([
			[".card", "own", ["red"]],
			[".card:hover", "state", ["blue"]],
			[".card", "own", ["0"]],
			[".card", "state", ["1rem"]],
			[".card", "own", ["var(--s-color)"]],
		]);
		expect(variables(model)).toEqual([
			[".card", "--s-color", ["red", "blue"], "red"],
			[".card", "--s-gap", ["0", "1rem"], "0"],
		]);
	});

	inEverySyntax("with a selector list, each run makes a block for each selector", ({ read }) => {
		const model = read(".card, .note { --s-v: 1; &:hover { --s-v: 2; } --s-v: 3; }");
		expect(
			model.blocks.map((block) => [block.selector, block.declarations.map((id) => valueOf(model, id))]),
		).toEqual([
			[".card", ["1"]],
			[".note", ["1"]],
			[".card:hover", ["2"]],
			[".note:hover", ["2"]],
			[".card", ["3"]],
			[".note", ["3"]],
		]);
		expect(variables(model)).toEqual([
			[".card", "--s-v", ["1", "2", "3"], "1"],
			[".note", "--s-v", ["1", "2", "3"], "1"],
		]);
	});

	inEverySyntax("what declares nothing doesn't split a rule's declarations", ({ read }) => {
		const model = read(`
			.card {
				color: red;
				@include theme;
				& > [data-slot="action"] { }
				/* a comment */
				background: white;
			}
		`);
		// The empty slot rule is a block with no declarations, before the run it doesn't split.
		expect(blocks(model)).toEqual([
			['.card > [data-slot="action"]', "own", []],
			[".card", "own", ["red", "white"]],
		]);
	});
});

describe("a layer inside a rule", () => {
	inEverySyntax("holds that rule's declarations, in that layer", ({ read }) => {
		const model = read(".card { @layer overrides { --s-color: red; } color: var(--s-color); }");
		expect(model.unknowns).toEqual([]);
		expect(model.blocks.map((block) => [block.selector, block.layer, block.kind])).toEqual([
			[".card", "overrides", "own"],
			[".card", undefined, "own"],
		]);
		expect(variables(model)).toEqual([[".card", "--s-color", ["red"], "red"]]);
		expect(
			model.reads.map((one) => [one.name, keyOf(model, model.variables[one.source ?? -1]?.element)]),
		).toEqual([["--s-color", ".card"]]);
		expect(unreached(model)).toEqual([]);
	});

	inEverySyntax("is under the layers around the rule, and around what's nested in it", ({ read }) => {
		const model = read(`
			@layer components {
				.card { @layer overrides { color: red; &:hover { color: blue; } } }
			}
		`);
		expect(model.blocks.map((block) => [block.selector, block.layer])).toEqual([
			[".card", "components.overrides"],
			[".card:hover", "components.overrides"],
		]);
	});
});

describe("one written declaration under a selector list", () => {
	inEverySyntax("is a declaration for each block, all from the same written one", ({ read }) => {
		const model = read(`
			.card:hover, .card:focus { --s-color: red; }
			.card, .card { --s-gap: 0; }
			.card, .link { --s-opacity: 1; }
		`);
		expect(
			model.declarations.map((declaration) => [declaration.id, declaration.written, declaration.block]),
		).toEqual([
			[0, 0, 0],
			[1, 0, 1],
			[2, 2, 2],
			[3, 2, 3],
			[4, 4, 4],
			[5, 4, 5],
		]);
		// Counted for an element, a written declaration counts once however many of its states list it.
		const writtenOnce = model.variables.map((one) => [
			keyOf(model, one.element),
			one.name,
			one.writes.length,
			new Set(one.writes.map((id) => model.declarations[id]?.written)).size,
		]);
		expect(writtenOnce).toEqual([
			[".card", "--s-color", 2, 1],
			[".card", "--s-gap", 2, 1],
			[".card", "--s-opacity", 1, 1],
			[".link", "--s-opacity", 1, 1],
		]);
		expect(model.variables[0]?.changes).toHaveLength(2);
	});
});

describe("a private taken with inherit", () => {
	const badge =
		'@scope (.card) to ([data-component]) { [data-part="badge"] { --_accent: inherit; color: var(--_accent); } }';

	inEverySyntax("changes when its owner's variable of that name does", ({ read }) => {
		const model = read(`.card { --_accent: red; &:hover { --_accent: blue; } } ${badge}`);
		expect(model.variables.map((one) => [keyOf(model, one.element), one.changing])).toEqual([
			[".card", true],
			['.card [data-part="badge"]', true],
		]);
		// The read still reaches the badge's own variable.
		expect(model.reads.map((one) => keyOf(model, model.variables[one.source ?? -1]?.element))).toEqual([
			'.card [data-part="badge"]',
		]);
	});

	inEverySyntax("stays static when its owner's is, or when no owner declares one", ({ read }) => {
		const withOwner = read(`.card { --_accent: red; } ${badge}`);
		expect(withOwner.variables.map((one) => one.changing)).toEqual([false, false]);
		const alone = read(badge);
		expect(alone.variables.map((one) => one.changing)).toEqual([false]);
	});

	inEverySyntax("through a pseudo-element's host, up to the root", ({ read }) => {
		const model = read(`
			.card { --_accent: red; &[data-tone="muted"] { --_accent: gray; } }
			@scope (.card) to ([data-component]) {
				[data-part="badge"]::after { --_accent: inherit; --s-color: var(--_accent); color: var(--s-color); }
			}
		`);
		expect(model.variables.map((one) => [one.name, one.changing])).toEqual([
			["--_accent", true],
			["--_accent", true],
			["--s-color", true],
		]);
	});
});

describe("quoted text in a value", () => {
	inEverySyntax("is literal in plain CSS, so what the value reads is still read", ({ read }) => {
		const model = read('.card { content: "{{label}}" / var(--s-missing); quotes: "${a}" "<%= b %>"; }');
		expect(model.declarations.map((declaration) => [declaration.property, declaration.valueUnread])).toEqual([
			["content", false],
			["quotes", false],
		]);
		expect(model.reads.map((one) => one.name)).toEqual(["--s-missing"]);
		expect(unreached(model)).toEqual(["--s-missing"]);
	});

	inEverySyntax(
		"is interpolated by SCSS when it holds #{…}, and literal there otherwise",
		({ read }) => {
			const model = read(`
				.card {
					content: "#{$label}" / var(--s-a);
					quotes: "{{label}}" var(--s-b);
					grid-area: "@{name}" var(--s-c);
				}
			`);
			expect(
				model.declarations.map((declaration) => [declaration.property, declaration.valueUnread]),
			).toEqual([
				["content", true],
				["quotes", false],
				["grid-area", false],
			]);
			expect(model.reads.map((one) => one.name)).toEqual(["--s-b", "--s-c"]);
		},
		{ skip: { css: "SCSS syntax", vue: "SCSS syntax, in a plain <style> block" } },
	);

	inEverySyntax("outside quotes, the same text is still unread", ({ read }) => {
		const model = read(".card { width: v-bind(size); height: var(--s-height); }");
		expect(model.declarations.map((declaration) => declaration.valueUnread)).toEqual([true, false]);
	});
});
