import { describe, expect } from "vitest";

import { inEverySyntax } from "../testing/syntaxes.js";

describe("blocks", () => {
	inEverySyntax("one block per selector in a list, sharing the rule", (read) => {
		const model = read(".button { &:hover, &:focus-visible { color: red; } }");
		expect(model.blocks.map((block) => block.selector)).toEqual([".button:hover", ".button:focus-visible"]);
		expect(model.blocks[0]?.node).toBe(model.blocks[1]?.node);
	});

	inEverySyntax("only rules with declarations make blocks", (read) => {
		const model = read(".button { &:hover { & .button-icon { color: red; } } }");
		expect(model.blocks.map((block) => block.selector)).toEqual([".button:hover .button-icon"]);
	});

	inEverySyntax("declarations directly in a nested at-rule", (read) => {
		const model = read(
			".card { padding: 1rem; @container --card (inline-size < 20rem) { padding: 0.5rem; } }",
		);
		expect(model.blocks.map((block) => [block.selector, block.node.type, block.atRules.length])).toEqual([
			[".card", "rule", 0],
			[".card", "atrule", 1],
		]);
		expect(model.blocks[1]?.atRules[0]?.params).toBe("--card (inline-size < 20rem)");
	});

	inEverySyntax("at-rules around rules, outermost first", (read) => {
		const model = read("@supports (color: red) { @media (hover: hover) { .button:hover { color: red; } } }");
		expect(model.blocks[0]?.atRules.map((atRule) => atRule.name)).toEqual(["supports", "media"]);
	});

	inEverySyntax("the layer around a block, dotted when nested", (read) => {
		const model = read(`
			.loose { color: red; }
			@layer components { .button { color: red; } @layer forms { .field { color: red; } } }
		`);
		expect(model.blocks.map((block) => block.layer)).toEqual([undefined, "components", "components.forms"]);
	});

	inEverySyntax("each block names its own parent components", (read) => {
		const model = read(".button .icon { color: red; } .icon { color: blue; }");
		expect(model.blocks.map((block) => block.parents.map((parent) => parent.key))).toEqual([[".button"], []]);
	});

	inEverySyntax("blocks are numbered in document order", (read) => {
		const model = read(".a { color: red; &:hover { color: blue; } } .b { color: green; }");
		expect(model.blocks.map((block) => [block.index, block.selector])).toEqual([
			[0, ".a"],
			[1, ".a:hover"],
			[2, ".b"],
		]);
	});

	inEverySyntax("at-rules that don't style elements are recorded", (read) => {
		const model = read(`
			@layer base, themes, components, utilities;
			@property --t-space-4 { syntax: "<length>"; inherits: true; initial-value: 1rem; }
			@keyframes --spin { to { rotate: 1turn; } }
			@font-face { font-family: Inter; }
		`);
		expect(model.atRules.map((atRule) => atRule.name)).toEqual([
			"layer",
			"property",
			"keyframes",
			"font-face",
		]);
		expect(model.blocks).toEqual([]);
	});
});
