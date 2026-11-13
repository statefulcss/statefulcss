import { defaults } from "@statefulcss/config";
import { describe, expect } from "vitest";

import type { Element, Model } from "../model.js";
import { inEverySyntax } from "../testing/syntaxes.js";

const keys = (model: Model) => model.elements.map((element) => element.key);
const find = (model: Model, key: string): Element | undefined =>
	model.elements.find((element) => element.key === key);
const keysOf = (elements: Element[] | undefined) => elements?.map((element) => element.key);

describe("components", () => {
	inEverySyntax("every class is a component, named after its class", (read) => {
		const model = read(".button { color: red; } .ButtonGroup { display: flex; }");
		expect(
			model.elements.map((element) => [element.key, element.kind, element.className, element.name]),
		).toEqual([
			[".button", "component", "button", "button"],
			[".ButtonGroup", "component", "ButtonGroup", "button-group"],
		]);
	});

	inEverySyntax("one element however its selectors reach it", (read) => {
		const model = read(`
			.button {
				& .icon { color: red; }
				& > .icon { color: blue; }
				&:hover .icon { color: green; }
			}
			.button[data-intent="danger"] .icon { color: white; }
			.icon { inline-size: 1rem; }
			@media (width > 40rem) { .button { color: green; } }
		`);
		expect(keys(model)).toEqual([".button", ".icon"]);
		expect(find(model, ".icon")?.blocks).toHaveLength(5);
		expect(find(model, ".button")?.blocks).toHaveLength(1);
	});

	inEverySyntax("the classes a selector names before its element are its parent components", (read) => {
		const model = read(".card { & .title .label { color: red; } } .label { color: blue; }");
		const label = find(model, ".label");
		expect(keysOf(label?.parents)).toEqual([".card", ".title"]);
		expect(keysOf(label?.blocks.map((block) => block.parents).flat())).toEqual([".card", ".title"]);
		expect(keysOf(find(model, ".card")?.children)).toEqual([".label"]);
		expect(find(model, ".title")?.blocks).toEqual([]);
	});

	inEverySyntax("a component placed in another is still known by its own class", (read) => {
		const model = read(".card { & .button { margin-block-start: 0; } } .button { color: red; }");
		expect(keys(model)).toEqual([".card", ".button"]);
		expect(keysOf(find(model, ".button")?.parents)).toEqual([".card"]);
	});

	inEverySyntax("what comes before the first class isn't a parent component", (read) => {
		const model = read(
			'[data-color-scheme="dark"] .button { color: white; } #checkout .button { color: red; }',
		);
		expect(keys(model)).toEqual([".button"]);
		expect(find(model, ".button")?.parents).toEqual([]);
		expect(find(model, ".button")?.blocks.map((block) => block.selector)).toEqual([
			'[data-color-scheme="dark"] .button',
			"#checkout .button",
		]);
	});

	inEverySyntax("an extra class on the same element doesn't make another element", (read) => {
		expect(keys(read(".button.is-active { color: red; }"))).toEqual([".button"]);
	});

	inEverySyntax("a guard around interaction states doesn't change the element", (read) => {
		const model = read(`
			.button {
				&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
					&:hover { color: red; }
				}
			}
		`);
		expect(keys(model)).toEqual([".button"]);
		expect(model.blocks.map((block) => block.selector)).toEqual([
			'.button:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])):hover',
		]);
	});

	inEverySyntax("siblings are the later element", (read) => {
		const model = read(".tab + .tab { margin-inline-start: 0; } .list .item ~ .item { border: 0; }");
		expect(keys(model)).toEqual([".tab", ".list", ".item"]);
		expect(find(model, ".tab")?.parents).toEqual([]);
		expect(keysOf(find(model, ".item")?.parents)).toEqual([".list"]);
	});

	inEverySyntax("a nesting selector that puts context first", (read) => {
		const model = read('.button { [dir="rtl"] & { padding-inline-start: 0; } }');
		expect(keys(model)).toEqual([".button"]);
		expect(model.blocks[0]?.selector).toBe('[dir="rtl"] .button');
	});

	inEverySyntax("@scope's root is the parent component of what's inside it", (read) => {
		const model = read("@scope (.card) to (.card-content) { :scope { padding: 0; } .title { color: red; } }");
		expect(keys(model)).toEqual([".card", ".title"]);
		expect(keysOf(find(model, ".title")?.parents)).toEqual([".card"]);
		expect(find(model, ".card")?.blocks.map((block) => block.selector)).toEqual([".card"]);
	});

	inEverySyntax("what :deep() and :global() wrap is known by its class", (read) => {
		const model = read(".card { & :deep(.button) { color: red; } & :global(.tooltip) { color: blue; } }");
		expect(keys(model)).toEqual([".card", ".button", ".tooltip"]);
		expect(keysOf(find(model, ".button")?.parents)).toEqual([".card"]);
	});

	inEverySyntax(
		"SCSS's &-suffix names a class of its own",
		(read) => {
			const model = read(".button { &-icon { color: red; } }");
			expect(keys(model)).toEqual([".button-icon"]);
			expect(model.blocks[0]?.selector).toBe(".button-icon");
			expect(find(model, ".button-icon")?.parents).toEqual([]);
		},
		{ skip: { css: "CSS nesting has no &-suffix", vue: "a plain <style> block has no &-suffix" } },
	);
});

describe("descendants", () => {
	inEverySyntax("a selector with no class of its own, under a component", (read) => {
		const model = read(
			".prose { & a { color: red; } & a:hover { color: blue; } & :where(ul, ol) { padding: 0; } }",
		);
		expect(model.elements.map((element) => [element.key, element.kind])).toEqual([
			[".prose", "component"],
			[".prose a", "descendant"],
			[".prose :where(ul, ol)", "descendant"],
		]);
		expect(find(model, ".prose a")?.blocks).toHaveLength(2);
		expect(keysOf(find(model, ".prose a")?.parents)).toEqual([".prose"]);
	});

	inEverySyntax("the path starts at the nearest component", (read) => {
		const model = read(".card .body ul li { margin: 0; }");
		expect(find(model, ".body ul li")).toMatchObject({ kind: "descendant" });
		expect(keysOf(find(model, ".body ul li")?.parents)).toEqual([".card", ".body"]);
	});
});

describe("pseudo-elements", () => {
	inEverySyntax("a pseudo-element is its own element, on its host", (read) => {
		const model = read('.tab { &::after { opacity: 0; } &[aria-selected="true"]::after { opacity: 1; } }');
		expect(keys(model)).toEqual([".tab", ".tab::after"]);
		const after = find(model, ".tab::after");
		expect(after).toMatchObject({ kind: "pseudo-element", pseudoElement: "::after" });
		expect(after?.host?.key).toBe(".tab");
		expect(after?.blocks).toHaveLength(2);
	});

	inEverySyntax("a state of the host written around the pseudo-element", (read) => {
		const model = read('.tab { &[aria-selected="true"] { &::after { opacity: 1; } } }');
		expect(model.blocks.map((block) => [block.selector, block.element.key])).toEqual([
			['.tab[aria-selected="true"]::after', ".tab::after"],
		]);
	});

	inEverySyntax("a child element's pseudo-element, and the legacy single colon", (read) => {
		const model = read(".button { & .icon::before { content: ''; } &:after { content: ''; } }");
		expect(keys(model)).toEqual([".button", ".icon", ".icon::before", ".button:after"]);
		expect(find(model, ".icon::before")?.host?.key).toBe(".icon");
		expect(keysOf(find(model, ".icon::before")?.parents)).toEqual([".button"]);
	});
});

describe("global elements", () => {
	inEverySyntax("states don't make a different element", (read) => {
		const model = read("a { color: red; } a:hover { color: blue; } [hidden] { display: none; }");
		expect(model.elements.map((element) => [element.key, element.kind])).toEqual([
			["a", "global"],
			["*", "global"],
		]);
		expect(find(model, "a")?.blocks).toHaveLength(2);
	});

	inEverySyntax("a rule with only attribute selectors is global", (read) => {
		expect(keys(read('[data-emphasis="primary"] { color: red; }'))).toEqual(["*"]);
	});

	inEverySyntax("theme scopes", (read) => {
		const model = read(`
			[data-theme] { --t-space-4: 1rem; }
			[data-theme="espresso"] { --t-space-4: 1.25rem; }
			html[data-theme='espresso'] { --t-space-4: 1.5rem; }
			[data-theme="espresso"] a { color: red; }
		`);
		expect(model.elements.map((element) => [element.key, element.themeScope?.theme ?? null])).toEqual([
			["[data-theme]", null],
			['[data-theme="espresso"]', "espresso"],
			['html[data-theme="espresso"]', "espresso"],
			['[data-theme="espresso"] a', null],
		]);
		expect(find(model, "[data-theme]")?.themeScope).toEqual({ theme: undefined });
		expect(find(model, '[data-theme="espresso"] a')?.themeScope).toBeUndefined();
	});

	inEverySyntax("the theme attribute comes from the settings", (read) => {
		const settings = { ...defaults, themeAttribute: "data-brand" };
		const model = read('[data-brand="espresso"] { --t-space-4: 1rem; }', { settings });
		expect(model.elements[0]?.themeScope).toEqual({ theme: "espresso" });
	});

	inEverySyntax("on a component, the theme attribute is a condition, not a theme scope", (read) => {
		const model = read('.card[data-theme="espresso"] { --t-space-4: 1rem; }');
		expect(keys(model)).toEqual([".card"]);
		expect(model.elements[0]?.themeScope).toBeUndefined();
	});

	inEverySyntax("color-scheme selectors", (read) => {
		const model = read('[data-color-scheme="dark"] { color-scheme: dark; }');
		expect(model.elements[0]).toMatchObject({ key: '[data-color-scheme="dark"]', colorScheme: true });
	});

	inEverySyntax("a global pseudo-element", (read) => {
		const model = read("::selection { color: red; }");
		expect(model.elements.map((element) => [element.key, element.kind])).toEqual([
			["*", "global"],
			["*::selection", "pseudo-element"],
		]);
	});
});

describe("CSS Modules", () => {
	inEverySyntax("a module reads like any stylesheet", (read) => {
		const model = read(".root { & .icon { color: red; } } .header { color: blue; }", { module: true });
		expect(model.file.cssModule).toBe(true);
		expect(model.elements.map((element) => [element.key, element.name])).toEqual([
			[".root", "root"],
			[".icon", "icon"],
			[".header", "header"],
		]);
		expect(keysOf(find(model, ".icon")?.parents)).toEqual([".root"]);
	});

	inEverySyntax("a plain file isn't a module", (read) => {
		expect(read(".root { color: red; }").file.cssModule).toBe(false);
	});
});
