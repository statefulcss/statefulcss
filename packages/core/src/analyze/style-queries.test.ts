import { describe, expect, it } from "vitest";

import type { Model } from "../model.js";
import { inEverySyntax } from "../testing/syntaxes.js";
import { styleQueriesOf } from "./classify.js";

const keyOf = (model: Model, id: number | undefined) =>
	id === undefined ? undefined : model.elements[id]?.key;
const flags = (params: string) =>
	styleQueriesOf(params).map((query) => [query.name, query.value, query.negated, query.optional]);
/** Each read, with how it reads and the element whose variable it reaches. */
const sources = (model: Model) =>
	model.reads.map((read) => [
		keyOf(model, read.element),
		read.via,
		read.name,
		read.source === undefined ? undefined : keyOf(model, model.variables[read.source]?.element),
	]);

describe("what a not turns around", () => {
	it("a not before the style query, before a group around it, and twice", () => {
		expect(flags("not (style(--q-blocked: true))")).toEqual([["--q-blocked", "true", true, false]]);
		expect(flags("not style(--q-blocked: true)")).toEqual([["--q-blocked", "true", true, false]]);
		expect(flags("not (not style(--q-blocked: true))")).toEqual([["--q-blocked", "true", false, false]]);
		expect(flags("style(not (--q-blocked: true))")).toEqual([["--q-blocked", "true", true, false]]);
		expect(flags("--tabs not (style(not (--q-blocked: true)))")).toEqual([
			["--q-blocked", "true", false, false],
		]);
	});

	it("only the group right after it", () => {
		expect(flags("(not style(--q-a: 1)) and style(--q-b: 2)")).toEqual([
			["--q-a", "1", true, false],
			["--q-b", "2", false, false],
		]);
	});
});

describe("whether a style query has to hold", () => {
	it("joined with and, it does; joined with or, the block can apply without it", () => {
		expect(flags("(inline-size > 30rem) and style(--q-blocked: false)")).toEqual([
			["--q-blocked", "false", false, false],
		]);
		expect(flags("(inline-size > 30rem) or style(--q-blocked: false)")).toEqual([
			["--q-blocked", "false", false, true],
		]);
		expect(flags("style(--q-blocked: false) or (inline-size > 30rem)")).toEqual([
			["--q-blocked", "false", false, true],
		]);
		expect(flags("style((--q-a: 1) or (--q-b: 2))")).toEqual([
			["--q-a", "1", false, true],
			["--q-b", "2", false, true],
		]);
		expect(flags("style((--q-a: 1) and (--q-b: 2))")).toEqual([
			["--q-a", "1", false, false],
			["--q-b", "2", false, false],
		]);
	});

	it("under a not, and and or trade places", () => {
		expect(flags("not (style(--q-a: 1) or style(--q-b: 2))")).toEqual([
			["--q-a", "1", true, false],
			["--q-b", "2", true, false],
		]);
		expect(flags("not (style(--q-a: 1) and style(--q-b: 2))")).toEqual([
			["--q-a", "1", true, true],
			["--q-b", "2", true, true],
		]);
	});

	it("inside an alternative, everything is optional", () => {
		expect(flags("(style(--q-a: 1) and style(--q-b: 2)) or (inline-size > 30rem)")).toEqual([
			["--q-a", "1", false, true],
			["--q-b", "2", false, true],
		]);
	});

	it("reads names, values with parentheses and quotes, and nothing from what it can't read", () => {
		expect(flags("style(--q-size: calc(1px + (2 * 3px)))")).toEqual([
			["--q-size", "calc(1px + (2 * 3px))", false, false],
		]);
		expect(flags('style(--q-label: ")")')).toEqual([["--q-label", '")"', false, false]]);
		expect(flags("style(--q-dense)")).toEqual([["--q-dense", undefined, false, false]]);
		expect(flags("style(--q-count > 2)")).toEqual([["--q-count", undefined, false, false]]);
		for (const params of [
			"",
			"(inline-size > 30rem)",
			"style()",
			"style(not)",
			"style(",
			"not",
			"style(color: red)",
		])
			expect(flags(params)).toEqual([]);
	});
});

describe("which variable a style query reads", () => {
	inEverySyntax("a container around the element, never the element's own", ({ read }) => {
		const model = read(`
			.tabs { --q-blocked: false; }
			@scope (.tabs) to ([data-component]) {
				[data-part="tab"] {
					--q-blocked: true;
					@container style(--q-blocked: false) { &:hover { color: var(--q-blocked); } }
				}
			}
		`);
		expect(sources(model)).toEqual([
			['.tabs [data-part="tab"]', "style-query", "--q-blocked", ".tabs"],
			['.tabs [data-part="tab"]', "var", "--q-blocked", '.tabs [data-part="tab"]'],
		]);
	});

	inEverySyntax(
		"a root's own query asks outside the component; a pseudo-element's asks its host",
		({ read }) => {
			const model = read(`
			.card {
				--q-dense: true;
				@container style(--q-dense: true) { gap: 0; }
				&::after { @container style(--q-dense: true) { opacity: 1; } }
			}
			@scope (.card) to ([data-component]) {
				[data-part="body"] p { @container style(--q-dense: true) { margin: 0; } }
			}
		`);
			expect(sources(model)).toEqual([
				[".card", "style-query", "--q-dense", undefined],
				[".card::after", "style-query", "--q-dense", ".card"],
				['.card [data-part="body"] p', "style-query", "--q-dense", ".card"],
			]);
		},
	);

	inEverySyntax("the model keeps how each query stands", ({ read }) => {
		const model = read(`
			@scope (.tabs) to ([data-component]) {
				[data-part="tab"] {
					@container not (style(--q-blocked: true)) { &:hover { color: red; } }
					@container (inline-size > 30rem) or style(--q-blocked: false) { &:active { color: red; } }
				}
			}
		`);
		expect(model.blocks.map((block) => block.queries[0]?.styleQueries)).toEqual([
			[{ name: "--q-blocked", value: "true", negated: true, optional: false }],
			[{ name: "--q-blocked", value: "false", negated: false, optional: true }],
		]);
	});
});
