import { describe, expect } from "vitest";

import { inEverySyntax } from "../testing/syntaxes.js";
import { complexToString } from "./selectors.js";
import { walk, type Walked } from "./walk.js";

const selectors = (walked: Walked) => walked.blocks.map((block) => complexToString(block.selector));
const reasons = (walked: Walked) => walked.unknowns.map((unknown) => [unknown.reason, unknown.detail]);
/** A doc comment's first line of text, without the asterisks that frame it. */
const firstLine = (text: string) =>
	text
		.split("\n")
		.map((line) => line.replace(/^\s*\*+\s*/, "").trim())
		.find((line) => line !== "");

describe("blocks", () => {
	inEverySyntax("one block per selector in a list, sharing the rule", ({ parse }) => {
		const walked = walk(parse(".button { &:hover, &:focus-visible { color: red; } }"));
		expect(selectors(walked)).toEqual([".button:hover", ".button:focus-visible"]);
		expect(walked.blocks[0]?.node).toBe(walked.blocks[1]?.node);
	});

	inEverySyntax("only rules with declarations make blocks", ({ parse }) => {
		const walked = walk(parse('.button { &:hover { & [data-part="icon"] { color: red; } } }'));
		expect(selectors(walked)).toEqual(['.button:hover [data-part="icon"]']);
	});

	inEverySyntax("declarations directly in a nested at-rule", ({ parse }) => {
		const walked = walk(
			parse(".card { padding: 1rem; @container --card (inline-size < 20rem) { padding: 0.5rem; } }"),
		);
		expect(walked.blocks.map((block) => [block.node.type, block.atRules.length])).toEqual([
			["rule", 0],
			["atrule", 1],
		]);
		expect(selectors(walked)).toEqual([".card", ".card"]);
		expect(walked.blocks[1]?.atRules[0]?.params).toBe("--card (inline-size < 20rem)");
	});

	inEverySyntax("at-rules around rules, outermost first", ({ parse }) => {
		const walked = walk(
			parse("@supports (color: red) { @media (hover: hover) { .button:hover { color: red; } } }"),
		);
		expect(walked.blocks[0]?.atRules.map((atRule) => atRule.name)).toEqual(["supports", "media"]);
	});

	inEverySyntax("the layer around a block, dotted when nested", ({ parse }) => {
		const walked = walk(
			parse(`
				.loose { color: red; }
				@layer components { .button { color: red; } @layer forms { .field { color: red; } } }
			`),
		);
		expect(walked.blocks.map((block) => block.layer)).toEqual([undefined, "components", "components.forms"]);
	});

	inEverySyntax("blocks are in document order", ({ parse }) => {
		const walked = walk(parse(".a { color: red; &:hover { color: blue; } } .b { color: green; }"));
		expect(selectors(walked)).toEqual([".a", ".a:hover", ".b"]);
	});

	inEverySyntax("a block outside any scope has none", ({ parse }) => {
		const walked = walk(parse(".button { color: red; }"));
		expect(walked.blocks[0]).toMatchObject({ scope: undefined, scopeRoot: undefined, sheet: 0 });
	});
});

describe("nesting", () => {
	inEverySyntax("a guard around interaction states", ({ parse }) => {
		const walked = walk(
			parse(`
				.button {
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
						&:hover { color: red; }
					}
				}
			`),
		);
		expect(selectors(walked)).toEqual([
			'.button:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])):hover',
		]);
	});

	inEverySyntax("a nesting selector that puts context first", ({ parse }) => {
		const walked = walk(parse('.button { [dir="rtl"] & { padding-inline-start: 0; } }'));
		expect(selectors(walked)).toEqual(['[dir="rtl"] .button']);
	});

	inEverySyntax("a placement path through a part into a slot", ({ parse }) => {
		const walked = walk(
			parse('.card { & > [data-part="footer"] > [data-slot="action"] { justify-self: end; } }'),
		);
		expect(selectors(walked)).toEqual(['.card > [data-part="footer"] > [data-slot="action"]']);
	});

	inEverySyntax("a state of the host written around a pseudo-element", ({ parse }) => {
		const walked = walk(parse('.link { &[aria-current="page"] { &::after { opacity: 1; } } }'));
		expect(selectors(walked)).toEqual(['.link[aria-current="page"]::after']);
	});

	inEverySyntax(
		"SCSS's &-suffix names a class of its own",
		({ parse }) => {
			expect(selectors(walk(parse(".button { &-icon { color: red; } }")))).toEqual([".button-icon"]);
		},
		{ skip: { css: "CSS nesting has no &-suffix", vue: "a plain <style> block has no &-suffix" } },
	);
});

describe("scopes", () => {
	inEverySyntax("a flat scope: its root, its limit and the blocks inside it", ({ parse }) => {
		const walked = walk(
			parse(`
				.card { color: red; }
				@scope (.card) to ([data-component]) {
					[data-part="title"] { font-weight: 600; &:hover { color: blue; } }
					[data-part="body"] p { margin: 0; }
				}
			`),
		);
		expect(walked.scopes.map((scope) => [scope.rootText, scope.limit, scope.nested])).toEqual([
			[".card", "[data-component]", false],
		]);
		expect(walked.scopes[0]?.node.name).toBe("scope");
		expect(walked.blocks.map((block) => [complexToString(block.selector), block.scope])).toEqual([
			[".card", undefined],
			['.card [data-part="title"]', 0],
			['.card [data-part="title"]:hover', 0],
			['.card [data-part="body"] p', 0],
		]);
	});

	inEverySyntax("the limit is kept as written, whatever it is", ({ parse }) => {
		const walked = walk(
			parse(`
				@scope (.card) to ([class]) { [data-part="title"] { color: red; } }
				@scope (.note) { [data-part="title"] { color: red; } }
				@scope ([data-component="tabs"])   to   ([data-component]) { [data-part="list"] { display: flex; } }
			`),
		);
		expect(walked.scopes.map((scope) => [scope.rootText, scope.limit])).toEqual([
			[".card", "[class]"],
			[".note", undefined],
			['[data-component="tabs"]', "[data-component]"],
		]);
		expect(selectors(walked)).toEqual([
			'.card [data-part="title"]',
			'.note [data-part="title"]',
			'[data-component="tabs"] [data-part="list"]',
		]);
	});

	inEverySyntax("how a block writes its scope's root", ({ parse }) => {
		const walked = walk(
			parse(`
				@scope (.button) to ([data-component]) {
					:scope > [data-part="icon"] { inline-size: 1em; &:hover { color: red; } }
					& > [data-part="label"] { color: red; }
					[data-part="badge"] { color: red; &:hover { color: blue; } }
					:scope { padding: 0; }
					:scope[data-size="small"] [data-part="icon"] { inline-size: 12px; }
				}
			`),
		);
		expect(walked.blocks.map((block) => [complexToString(block.selector), block.scopeRoot])).toEqual([
			['.button > [data-part="icon"]', ":scope"],
			['.button > [data-part="icon"]:hover', ":scope"],
			['.button > [data-part="label"]', "&"],
			['.button [data-part="badge"]', undefined],
			['.button [data-part="badge"]:hover', undefined],
			[".button", ":scope"],
			['.button[data-size="small"] [data-part="icon"]', ":scope"],
		]);
	});

	inEverySyntax("a query around the rules of a scope", ({ parse }) => {
		const walked = walk(
			parse(`
				@scope (.card) to ([data-component]) {
					@media (width > 40rem) { :scope > [data-part="title"] { font-size: 2rem; } }
				}
			`),
		);
		expect(walked.blocks.map((block) => [complexToString(block.selector), block.scopeRoot])).toEqual([
			['.card > [data-part="title"]', ":scope"],
		]);
		expect(walked.blocks[0]?.atRules.map((atRule) => atRule.name)).toEqual(["media"]);
	});

	inEverySyntax("declarations directly in a scope style its root", ({ parse }) => {
		const walked = walk(parse("@scope (.card) to ([data-component]) { padding: 0; }"));
		expect(
			walked.blocks.map((block) => [complexToString(block.selector), block.node.type, block.scope]),
		).toEqual([[".card", "atrule", 0]]);
	});

	inEverySyntax("a scope nested in the root block is read, and marked", ({ parse }) => {
		const walked = walk(
			parse(`
				.button {
					color: red;
					@scope (&) to ([data-component]) { [data-part="icon"] { inline-size: 1em; } }
				}
			`),
		);
		expect(walked.scopes.map((scope) => [scope.rootText, scope.limit, scope.nested])).toEqual([
			["&", "[data-component]", true],
		]);
		expect(walked.blocks.map((block) => [complexToString(block.selector), block.scope])).toEqual([
			[".button", undefined],
			['.button [data-part="icon"]', 0],
		]);
		expect(walked.unknowns).toEqual([]);
	});

	inEverySyntax("a scope with no root is recorded, and what's inside it isn't read", ({ parse }) => {
		const walked = walk(
			parse(`
				.card { @scope to ([data-component]) { [data-part="title"] { color: red; } } }
				@scope { .title { color: red; } }
			`),
		);
		expect(walked.scopes.map((scope) => [scope.root, scope.rootText, scope.limit, scope.nested])).toEqual([
			[undefined, undefined, "[data-component]", true],
			[undefined, undefined, undefined, false],
		]);
		expect(reasons(walked)).toEqual([
			["scope-root", "@scope without a root"],
			["scope-root", "@scope without a root"],
		]);
		expect(walked.blocks).toEqual([]);
	});

	inEverySyntax("a scope whose root is a list or a path isn't read", ({ parse }) => {
		const walked = walk(
			parse(`
				@scope (.card, .note) { [data-part="title"] { color: red; } }
				@scope (.card > .body) { p { margin: 0; } }
				.card, .note { @scope (&) { [data-part="title"] { color: red; } } }
			`),
		);
		expect(walked.scopes.map((scope) => [scope.root, scope.rootText])).toEqual([
			[undefined, ".card, .note"],
			[undefined, ".card > .body"],
			[undefined, "&"],
		]);
		expect(reasons(walked)).toEqual([
			["scope-root", "@scope with a list of roots"],
			["scope-root", "@scope with a path as its root"],
			["scope-root", "@scope with a list of roots"],
		]);
		expect(walked.blocks).toEqual([]);
	});

	inEverySyntax("a nested scope's root is relative to the rule around it, even without &", ({ parse }) => {
		const walked = walk(
			parse(`
				.card { @scope (.title) to ([data-component]) { p { color: red; } } }
				@scope (.card) { @scope (.title) { p { color: red; } } }
			`),
		);
		expect(walked.scopes.map((scope) => [scope.root?.parts.length, scope.rootText, scope.nested])).toEqual([
			[undefined, ".title", true],
			[1, ".card", false],
			[undefined, ".title", false],
		]);
		expect(reasons(walked)).toEqual([
			["scope-root", "@scope with a path as its root"],
			["scope-root", "@scope with a path as its root"],
		]);
		expect(walked.blocks).toEqual([]);
	});

	inEverySyntax("a scope root's parts know their place in the at-rule's parameters", ({ parse }) => {
		const walked = walk(
			parse('@scope (  [data-component="tabs"]) to ([data-component]) { p { margin: 0; } }'),
		);
		const part = walked.scopes[0]?.root?.parts[0];
		expect([part?.source.type, part?.node.sourceIndex]).toEqual(["atrule", 3]);
	});

	inEverySyntax("a scope whose root is any one element", ({ parse }) => {
		const walked = walk(parse("@scope (main) { a { color: red; } }"));
		expect(walked.scopes.map((scope) => scope.rootText)).toEqual(["main"]);
		expect(selectors(walked)).toEqual(["main a"]);
	});
});

describe("doc comments", () => {
	inEverySyntax("a doc comment, and the node right after it", ({ parse }) => {
		const walked = walk(
			parse(`
				/* A plain comment. */
				/**
				 * Card
				 * @component card
				 */
				.card { color: red; }
				@layer components {
					/** Button */
					/* Between the two. */
					.button { color: red; }
				}
				/** Tabs */
				@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { display: flex; } }
				/** Nothing after it. */
			`),
		);
		expect(
			walked.docComments.map((comment) => [
				firstLine(comment.node.text),
				comment.next?.type === "rule" ? comment.next.selector : comment.next?.type,
			]),
		).toEqual([
			["Card", ".card"],
			["Button", ".button"],
			["Tabs", "atrule"],
			["Nothing after it.", undefined],
		]);
	});

	inEverySyntax("a doc comment inside a rule or a scope belongs to nothing", ({ parse }) => {
		const walked = walk(
			parse(`
				.card { /** Inside. */ &:hover { color: red; } }
				@scope (.card) to ([data-component]) { /** Inside. */ [data-part="title"] { color: red; } }
			`),
		);
		expect(walked.docComments).toEqual([]);
	});
});

describe("at-rules that don't style elements", () => {
	inEverySyntax("are recorded, with registrations apart", ({ parse }) => {
		const walked = walk(
			parse(`
				@layer base, themes, components, utilities;
				@property --t-space-4 { syntax: "<length>"; inherits: true; initial-value: 1rem; }
				@keyframes --spin { to { rotate: 1turn; } }
				@font-face { font-family: Inter; }
			`),
		);
		expect(walked.atRules.map((atRule) => atRule.name)).toEqual(["layer", "keyframes", "font-face"]);
		expect(walked.registrations.map((atRule) => atRule.params)).toEqual(["--t-space-4"]);
		expect(walked.blocks).toEqual([]);
	});
});
