import html from "postcss-html";
import { defaults } from "@statefulcss/config";
import { describe, expect, it } from "vitest";

import { analyze } from "../index.js";
import type { Element, Model } from "../model.js";
import { inEverySyntax } from "../testing/syntaxes.js";

const elements = (model: Model) => model.elements.map((element) => [element.kind, element.key]);
const keyOf = (model: Model, id: number | undefined) =>
	id === undefined ? undefined : model.elements[id]?.key;
const blocks = (model: Model) =>
	model.blocks.map((block) => [block.selector, keyOf(model, block.element), block.reach]);
const find = (model: Model, key: string): Element | undefined =>
	model.elements.find((element) => element.key === key);
const components = (model: Model) =>
	model.components.map((component) => [
		component.identity.kind,
		component.name,
		component.nameFrom,
		component.hasRootBlock,
	]);
const references = (model: Model) =>
	model.partReferences.map((reference) => [
		reference.name,
		reference.place,
		model.blocks[reference.block]?.selector,
	]);

// The parts page, "One example".
const card = `
	/**
	 * Card
	 * @component card
	 */
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
		[data-part="title"] {
			font-weight: 600;
			color: var(--p-title-color);
		}
		[data-part="footer"] { display: grid; }

		[data-part="body"] p { margin-block: var(--t-space-3); }
		[data-part="body"] a { color: var(--t-color-link); }
	}
`;

// The parts page, "A part with states of its own".
const tabs = `
	/**
	 * Tabs
	 * @component tabs
	 */
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
				@container style(--q-tabs-blocked: false) {
					&:hover { --s-color: var(--t-color-text); }
				}
			}
			&[aria-selected="true"] { --s-color: var(--t-color-accent); --p-after-block-size: 2px; }

			&::after { content: ""; display: block; block-size: var(--p-after-block-size); }
		}
	}
`;

describe("a whole component", () => {
	inEverySyntax("the Card: its root, a slot, parts and content", ({ read }) => {
		const model = read(card);
		expect(model.unknowns).toEqual([]);
		expect(components(model)).toEqual([["class", "card", "tag", true]]);
		expect(elements(model)).toEqual([
			["root", ".card"],
			["part", '.card [data-part="footer"]'],
			["slot", '.card [data-slot="action"]'],
			["part", '.card [data-part="title"]'],
			["part", '.card [data-part="body"]'],
			["content", '.card [data-part="body"] p'],
			["content", '.card [data-part="body"] a'],
		]);
		expect(blocks(model)).toEqual([
			[".card", ".card", "direct"],
			['.card > [data-part="footer"] > [data-slot="action"]', '.card [data-slot="action"]', "descendant"],
			['.card[data-tone="muted"]', ".card", "direct"],
			[
				'.card:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])):hover',
				".card",
				"direct",
			],
			['.card [data-part="title"]', '.card [data-part="title"]', "scope"],
			['.card [data-part="footer"]', '.card [data-part="footer"]', "scope"],
			['.card [data-part="body"] p', '.card [data-part="body"] p', "scope"],
			['.card [data-part="body"] a', '.card [data-part="body"] a', "scope"],
		]);
		expect(model.blocks.map((block) => block.kind)).toEqual([
			"own",
			"own",
			"variant",
			"state",
			"own",
			"own",
			"own",
			"own",
		]);
		expect(model.blocks.map((block) => block.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(model.components[0]?.elements).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(find(model, ".card")?.blocks).toEqual([0, 2, 3]);
		expect(find(model, '.card [data-part="body"]')?.blocks).toEqual([]);
	});

	inEverySyntax("the Card: its scope, its guard, its doc comment and its part references", ({ read }) => {
		const model = read(card);
		expect(model.scopes.map(({ node, ...scope }) => [node.name, scope])).toEqual([
			[
				"scope",
				{
					id: 0,
					component: 0,
					root: ".card",
					limit: "[data-component]",
					limitIsComponents: true,
					nested: false,
					afterRootBlock: true,
				},
			],
		]);
		expect(model.components[0]).toMatchObject({ id: 0, sheet: 0, root: 0, scopes: [0], docComment: 0 });
		expect(model.docComments.map(({ node, ...comment }) => [node.type, comment])).toEqual([
			[
				"comment",
				{
					id: 0,
					component: 0,
					title: "Card",
					tags: [{ name: "component", value: "card" }],
					componentName: "card",
					sets: [],
					reads: [],
					queries: [],
				},
			],
		]);
		expect(model.guards.map((guard) => [guard.id, guard.element, guard.blocking, guard.blocks])).toEqual([
			[0, 0, [":disabled", '[aria-disabled="true"]', "[data-loading]", "[inert]"], [3]],
		]);
		expect(model.blocks[3]?.guard).toBe(0);
		expect(model.blocks[3]?.conditions.map((condition) => [condition.kind, condition.guard])).toEqual([
			["guard", 0],
			["state", undefined],
		]);
		expect(model.guards[0]?.condition.guard).toBe(0);
		expect(references(model)).toEqual([
			["footer", "placement-path", '.card > [data-part="footer"] > [data-slot="action"]'],
			["title", "scope", '.card [data-part="title"]'],
			["footer", "scope", '.card [data-part="footer"]'],
			["body", "scope", '.card [data-part="body"] p'],
			["body", "scope", '.card [data-part="body"] a'],
		]);
		const paragraph = find(model, '.card [data-part="body"] p');
		expect(paragraph).toMatchObject({ kind: "content", selector: '[data-part="body"] p', component: 0 });
		expect(keyOf(model, paragraph?.kind === "content" ? paragraph.under : undefined)).toBe(
			'.card [data-part="body"]',
		);
	});

	inEverySyntax("Tabs: a part with states, a guard and a pseudo-element of its own", ({ read }) => {
		const model = read(tabs);
		expect(model.unknowns).toEqual([]);
		expect(elements(model)).toEqual([
			["root", ".tabs"],
			["part", '.tabs [data-part="tab"]'],
			["pseudo-element", '.tabs [data-part="tab"]::after'],
		]);
		expect(model.blocks.map((block) => [keyOf(model, block.element), block.kind, block.reach])).toEqual([
			[".tabs", "own", "direct"],
			[".tabs", "state", "direct"],
			['.tabs [data-part="tab"]', "own", "scope"],
			['.tabs [data-part="tab"]', "state", "scope"],
			['.tabs [data-part="tab"]', "state", "scope"],
			['.tabs [data-part="tab"]::after', "own", "scope"],
		]);
		const hover = model.blocks[3];
		expect(hover).toMatchObject({ kind: "state", groups: ["context", "interaction"], guard: 0 });
		expect(hover?.queries[0]?.styleQueries).toEqual([
			{ name: "--q-tabs-blocked", value: "false", negated: false },
		]);
		expect(keyOf(model, model.guards[0]?.element)).toBe('.tabs [data-part="tab"]');
		const after = find(model, '.tabs [data-part="tab"]::after');
		expect(after).toMatchObject({ kind: "pseudo-element", name: "after", component: 0 });
		expect(keyOf(model, after?.kind === "pseudo-element" ? after.host : undefined)).toBe(
			'.tabs [data-part="tab"]',
		);
	});

	inEverySyntax("is JSON once the PostCSS nodes are dropped", ({ read }) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the tree is the one field that isn't data
		const { root, ...data } = read(card);
		const json = JSON.stringify(data, (key, value: unknown) => (key === "node" ? undefined : value));
		const copy = JSON.parse(json) as Model;
		expect(copy.elements.map((element) => element.key)).toEqual(data.elements.map((element) => element.key));
		expect(copy.blocks[1]?.path.map((step) => [step.names, step.name, step.at.index])).toEqual([
			["root", undefined, 0],
			["part", "footer", 4],
			["slot", "action", 27],
		]);
	});
});

describe("components", () => {
	// Sources: the flat-components and ownership decisions.
	inEverySyntax("every top-level rule that starts from the same class is one component", ({ read }) => {
		const model = read(`
			.button { color: red; }
			.button[data-size="small"] { gap: 0; }
			@media (width > 40rem) { .button { gap: 1rem; } }
			.button:hover { color: blue; }
			.card { color: red; }
		`);
		expect(components(model)).toEqual([
			["class", "button", "class", true],
			["class", "card", "class", true],
		]);
		expect(elements(model)).toEqual([
			["root", ".button"],
			["root", ".card"],
		]);
		expect(find(model, ".button")?.blocks).toEqual([0, 1, 2, 3]);
	});

	// Sources: the parts-model details bench, case 4; the rules page, `component-variable-names`.
	inEverySyntax("a component named by its attribute", ({ read }) => {
		const model = read(`
			[data-component="button"] {
				border-radius: var(--c-button-border-radius, var(--t-radius-medium));
				&[data-size="small"] { gap: 0; }
			}
			@scope ([data-component="button"]) to ([data-component]) {
				[data-part="icon"] { inline-size: 1em; }
			}
		`);
		expect(components(model)).toEqual([["attribute", "button", "attribute", true]]);
		expect(model.components[0]?.identity).toMatchObject({ kind: "attribute", value: "button" });
		expect(elements(model)).toEqual([
			["root", '[data-component="button"]'],
			["part", '[data-component="button"] [data-part="icon"]'],
		]);
		expect(model.scopes[0]).toMatchObject({ component: 0, afterRootBlock: true, limitIsComponents: true });
	});

	inEverySyntax("its name: the tag, else the attribute's value, else the class in kebab-case", ({ read }) => {
		const model = read(`
			/**
			 * Button
			 * @component button
			 */
			.btn { color: red; }
			.ButtonGroup { display: flex; }
			/**
			 * Chip
			 * @component chip
			 */
			[data-component="tag"] { color: red; }
			[data-component="badge"] { color: red; }
		`);
		expect(model.components.map((component) => [component.name, component.nameFrom])).toEqual([
			["button", "tag"],
			["button-group", "class"],
			["chip", "tag"],
			["badge", "attribute"],
		]);
		expect(model.components[0]?.identity).toMatchObject({ kind: "class", className: "btn" });
	});

	// Source: the parts page, "One CSS file per component".
	inEverySyntax("parts styled from another file: a scope with no root block", ({ read }) => {
		const model = read(`
			@scope ([data-component="tabs"]) to ([data-component]) {
				[data-part="list"] { display: flex; gap: var(--p-list-gap); }
			}
		`);
		expect(components(model)).toEqual([["attribute", "tabs", "attribute", false]]);
		expect(elements(model)).toEqual([
			["root", '[data-component="tabs"]'],
			["part", '[data-component="tabs"] [data-part="list"]'],
		]);
		expect(find(model, '[data-component="tabs"]')?.blocks).toEqual([]);
		expect(model.scopes[0]).toMatchObject({ component: 0, afterRootBlock: undefined });
	});

	inEverySyntax("a class scope with no root block is still a component", ({ read }) => {
		const model = read('@scope (.note) to ([data-component]) { [data-part="title"] { color: red; } }');
		expect(components(model)).toEqual([["class", "note", "class", false]]);
	});

	// Source: core's design, question 2.
	inEverySyntax("a class root and an attribute scope with the same name are one component", ({ read }) => {
		const model = read(`
			/**
			 * Tabs
			 * @component tabs
			 */
			.Tabs { display: grid; }
			@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { display: flex; } }
			.menu { display: grid; }
			@scope ([data-component="menu"]) to ([data-component]) { [data-part="item"] { display: flex; } }
		`);
		expect(components(model)).toEqual([
			["class", "tabs", "tag", true],
			["class", "menu", "class", true],
		]);
		expect(model.scopes.map((scope) => [scope.component, scope.root])).toEqual([
			[0, '[data-component="tabs"]'],
			[1, '[data-component="menu"]'],
		]);
		expect(elements(model)).toEqual([
			["root", ".Tabs"],
			["part", '.Tabs [data-part="list"]'],
			["root", ".menu"],
			["part", '.menu [data-part="item"]'],
		]);
	});

	inEverySyntax("and with different names they are two", ({ read }) => {
		const model = read(`
			/**
			 * Tab set
			 * @component tab-set
			 */
			.tabs { display: grid; }
			@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { display: flex; } }
		`);
		expect(components(model)).toEqual([
			["class", "tab-set", "tag", true],
			["attribute", "tabs", "attribute", false],
		]);
	});

	inEverySyntax("an empty root block is still the root block, and a scope may come before it", ({ read }) => {
		const model = read(`
			@scope (.card) to ([data-component]) { [data-part="title"] { color: red; } }
			.button { }
			@scope (.button) to ([data-component]) { [data-part="icon"] { inline-size: 1em; } }
			.card { &[data-tone="muted"] { color: gray; } }
		`);
		expect(components(model)).toEqual([
			["class", "card", "class", true],
			["class", "button", "class", true],
		]);
		expect(model.scopes.map((scope) => scope.afterRootBlock)).toEqual([false, true]);
	});

	inEverySyntax("several components in one CSS Module", ({ read }) => {
		const model = read(".root { color: red; } .header { color: blue; }", { module: true });
		expect(model.file.cssModule).toBe(true);
		expect(model.components.map((component) => component.name)).toEqual(["root", "header"]);
	});

	inEverySyntax("what comes before the root doesn't make a component", ({ read }) => {
		const model = read(`
			[data-theme="espresso"] .button { color: brown; }
			.button { [dir="rtl"] & { padding-inline-start: 0; } }
			#checkout .button { color: red; }
		`);
		expect(elements(model)).toEqual([["root", ".button"]]);
		expect(model.blocks.map((block) => block.kind)).toEqual(["variant", "variant", "own"]);
		expect(model.blocks[0]?.conditions[0]).toMatchObject({
			on: "context",
			attribute: { name: "data-theme" },
		});
	});
});

describe("parts, slots and content", () => {
	// Sources: the methodology's "Composition and placement"; the slotted-placement-per-state decision.
	inEverySyntax("slots, reached from the root block", ({ read }) => {
		const model = read(`
			.checkout {
				& > [data-part="footer"] > [data-slot="submit"] { justify-self: end; }
			}
			.toolbar {
				--p-item-align-self: auto;
				& > [data-slot="item"] { align-self: var(--p-item-align-self); }
				&[data-orientation="vertical"] { --p-item-align-self: stretch; }
			}
		`);
		expect(elements(model)).toEqual([
			["root", ".checkout"],
			["part", '.checkout [data-part="footer"]'],
			["slot", '.checkout [data-slot="submit"]'],
			["root", ".toolbar"],
			["slot", '.toolbar [data-slot="item"]'],
		]);
		expect(find(model, '.toolbar [data-slot="item"]')).toMatchObject({
			kind: "slot",
			name: "item",
			component: 1,
		});
	});

	inEverySyntax("placement that names no child is content of the component", ({ read }) => {
		const model = read(".stack { & > * { margin: 0; } & > * + * { margin-block-start: 1rem; } }");
		expect(elements(model)).toEqual([
			["root", ".stack"],
			["content", ".stack > *"],
		]);
		expect(find(model, ".stack > *")?.blocks).toEqual([0, 1]);
		expect(model.blocks.map((block) => [block.kind, block.reach])).toEqual([
			["own", "descendant"],
			["variant", "descendant"],
		]);
	});

	// Sources: the rules page, rule 3's cases; core's design, question 3.
	inEverySyntax("content reached from the root block, a class included", ({ read }) => {
		const model = read(`
			.prose { & a:hover { text-decoration-thickness: 2px; } }
			.dialog { & .button { --s-opacity: 0.8; } }
			.button { color: red; }
		`);
		expect(elements(model)).toEqual([
			["root", ".prose"],
			["content", ".prose a"],
			["root", ".dialog"],
			["content", ".dialog .button"],
			["root", ".button"],
		]);
		expect(blocks(model)).toEqual([
			[".prose a:hover", ".prose a", "descendant"],
			[".dialog .button", ".dialog .button", "descendant"],
			[".button", ".button", "direct"],
		]);
	});

	// Sources: the methodology's "Components and parts"; the answer on layers and utilities.
	inEverySyntax("a class inside a scope is content, never a component", ({ read }) => {
		const model = read(`
			.article { color: black; }
			@scope (.article) to ([data-component]) {
				.hljs-keyword { color: purple; }
				[data-part="body"] > * { margin: 0; }
				svg[data-part="icon"] { fill: currentColor; }
				:scope > [data-part="icon"] { inline-size: 1em; }
				:scope { padding: 0; }
			}
		`);
		expect(components(model)).toEqual([["class", "article", "class", true]]);
		expect(elements(model)).toEqual([
			["root", ".article"],
			["content", ".article .hljs-keyword"],
			["part", '.article [data-part="body"]'],
			["content", '.article [data-part="body"] > *'],
			["part", '.article [data-part="icon"]'],
		]);
		expect(find(model, '.article [data-part="icon"]')?.blocks).toEqual([3, 4]);
		expect(model.blocks[5]).toMatchObject({ element: 0, reach: "scope", scopeRoot: ":scope" });
	});

	// Sources: the rules page, rules 3 and 4; the parts page, the tab's `::after`.
	inEverySyntax("a pseudo-element is its own element, on its host", ({ read }) => {
		const model = read(`
			.link {
				--p-after-opacity: 0;
				&::after { opacity: var(--p-after-opacity); }
				&[aria-current="page"]::after { opacity: 1; }
				&:before { content: ""; }
			}
			::selection { color: red; }
		`);
		expect(elements(model)).toEqual([
			["root", ".link"],
			["pseudo-element", ".link::after"],
			["pseudo-element", ".link::before"],
			["global", "*"],
			["pseudo-element", "*::selection"],
		]);
		expect(find(model, ".link::after")?.blocks).toEqual([1, 2]);
		expect(model.blocks[2]).toMatchObject({ kind: "state", groups: ["semantic"], reach: "direct" });
		expect(find(model, "*::selection")).toMatchObject({ component: undefined, name: "selection" });
	});

	// Source: the methodology's "States that live on a part".
	inEverySyntax("a part named only inside :has() is still one of the component's parts", ({ read }) => {
		const model = read(`
			.field {
				--s-opacity: 1;
				&:where(:not(:disabled, [inert], :has(:where([data-part="input"]):disabled))) {
					&:hover { --p-label-color: black; }
				}
				&:has(:where([data-part="input"]):disabled) { --s-opacity: 0.6; }
			}
		`);
		expect(elements(model)).toEqual([
			["root", ".field"],
			["part", '.field [data-part="input"]'],
		]);
		expect(references(model)).toEqual([
			[
				"input",
				"has",
				'.field:where(:not(:disabled, [inert], :has(:where([data-part="input"]):disabled))):hover',
			],
			["input", "has", '.field:has(:where([data-part="input"]):disabled)'],
		]);
		expect(model.guards[0]?.blocking).toEqual([":disabled", "[inert]"]);
		expect(model.guards[0]?.condition.inner).toHaveLength(3);
	});
});

describe("part references outside a scope", () => {
	// Sources: the rules page, rule 9; the correction that a root is never also a part.
	inEverySyntax("each place a selector names a part says where it is", ({ read }) => {
		const model = read(`
			.button [data-part="icon"] { inline-size: 1em; }
			.button { & [data-part] { margin: 0; } }
			.tab[data-part="tab"] { color: red; }
			main [data-part="title"] { color: red; }
			[data-part="panel"] > .card { margin: 0; }
			.menu { & [data-part="list"] [data-slot="item"] { margin: 0; } }
			.menu:not([data-part="x"]) { color: red; }
			@scope (.menu) to ([data-component]) {
				[data-part="list"]:has([data-part="item"]:hover) { color: red; }
				:scope[data-part="menu"] { color: red; }
			}
		`);
		expect(references(model)).toEqual([
			["icon", "outside", '.button [data-part="icon"]'],
			[undefined, "outside", ".button [data-part]"],
			["tab", "outside", '.tab[data-part="tab"]'],
			["title", "outside", 'main [data-part="title"]'],
			["panel", "outside", '[data-part="panel"] > .card'],
			["list", "placement-path", '.menu [data-part="list"] [data-slot="item"]'],
			["x", "outside", '.menu:not([data-part="x"])'],
			["list", "scope", '.menu [data-part="list"]:has([data-part="item"]:hover)'],
			["item", "scope", '.menu [data-part="list"]:has([data-part="item"]:hover)'],
			["menu", "outside", '.menu[data-part="menu"]'],
		]);
		expect(model.partReferences.map((reference) => reference.component)).toEqual([
			0,
			0,
			1,
			undefined,
			2,
			3,
			3,
			3,
			3,
			3,
		]);
	});

	inEverySyntax("a part attribute on a root's own compound is no variant of it", ({ read }) => {
		const model = read('.tab[data-part="tab"] { color: red; } .tab[data-part="tab"]:hover { color: blue; }');
		expect(elements(model)).toEqual([["root", ".tab"]]);
		expect(
			model.blocks.map((block) => [block.kind, block.conditions.map((condition) => condition.text)]),
		).toEqual([
			["own", []],
			["state", [":hover"]],
		]);
	});

	inEverySyntax("a part written once and reached twice is referenced once per place", ({ read }) => {
		const model = read(`
			.card {
				& > [data-part="footer"] {
					display: grid;
					&:hover { color: red; }
					& > [data-slot="action"] { justify-self: end; }
				}
			}
		`);
		expect(references(model)).toEqual([
			["footer", "outside", '.card > [data-part="footer"]'],
			["footer", "placement-path", '.card > [data-part="footer"] > [data-slot="action"]'],
		]);
	});
});

describe("elements that belong to no component", () => {
	// Sources: the global-elements decision; the rules page, rule 2's cases.
	inEverySyntax("global elements, theme scopes and color-scheme selectors", ({ read }) => {
		const model = read(`
			a { color: red; }
			a:hover { color: blue; }
			[hidden] { display: none; }
			[data-theme] { --t-space-4: 1rem; }
			[data-theme="espresso"] { --t-space-4: 1.25rem; }
			[data-theme="espresso"] a { color: brown; }
			[data-color-scheme="dark"] { color-scheme: dark; }
			:root { color-scheme: light dark; }
		`);
		expect(model.components).toEqual([]);
		expect(
			model.elements.map((element) =>
				element.kind === "global" ? [element.key, element.themeScope, element.colorScheme] : element.kind,
			),
		).toEqual([
			["a", undefined, false],
			["*", undefined, false],
			["[data-theme]", { theme: undefined }, false],
			['[data-theme="espresso"]', { theme: "espresso" }, false],
			['[data-theme="espresso"] a', undefined, false],
			['[data-color-scheme="dark"]', undefined, true],
			[":root", undefined, false],
		]);
		expect(find(model, "a")?.blocks).toEqual([0, 1]);
		expect(model.blocks.every((block) => block.reach === "direct")).toBe(true);
	});

	// Source: the component-terms decision, clarified 2026-11-14.
	inEverySyntax("a class block in the utilities layer is a utility, layered or nested", ({ read }) => {
		const model = read(`
			@layer utilities {
				.visually-hidden { position: absolute; }
				.visually-hidden:focus { position: static; }
				.stack > * + * { margin-block-start: 1rem; }
				@layer spacing { .gap-2 { gap: 0.5rem; } }
				[hidden] { display: none; }
			}
			@layer components { .card { color: red; } }
			@layer components.utilities { .chip { color: red; } }
			.loose { color: red; }
		`);
		expect(elements(model)).toEqual([
			["utility", ".visually-hidden"],
			["utility", ".stack > *"],
			["utility", ".gap-2"],
			["global", "*"],
			["root", ".card"],
			["root", ".chip"],
			["root", ".loose"],
		]);
		expect(components(model).map(([, name]) => name)).toEqual(["card", "chip", "loose"]);
		expect(find(model, ".visually-hidden")?.blocks).toEqual([0, 1]);
	});

	// Source: the vue-styles decision.
	inEverySyntax("what :deep() and :global() select is foreign", ({ read }) => {
		const model = read(`
			.card { color: red; & :deep(.button) { color: blue; } }
			:global(.tooltip) { color: red; }
		`);
		expect(elements(model)).toEqual([
			["root", ".card"],
			["foreign", ".card :deep(.button)"],
			["foreign", ":global(.tooltip)"],
		]);
		expect(components(model).map(([, name]) => name)).toEqual(["card"]);
	});

	inEverySyntax("a scope whose root is no component holds global elements", ({ read }) => {
		const model = read("@scope (main) { a { color: red; } }");
		expect(model.components).toEqual([]);
		expect(elements(model)).toEqual([["global", "main a"]]);
		expect(model.scopes[0]).toMatchObject({ component: undefined, root: "main", limitIsComponents: false });
		expect(model.blocks[0]).toMatchObject({ reach: "scope", scope: 0 });
	});
});

describe("scopes", () => {
	// Source: the rules page, rule 9.
	inEverySyntax("the limit, and whether it is the component attribute", ({ read }) => {
		const model = read(`
			.card { color: red; }
			@scope (.card) to ([data-component]) { [data-part="a"] { color: red; } }
			@scope (.card) to ([class]) { [data-part="b"] { color: red; } }
			@scope (.card) to ([data-part]) { [data-part="c"] { color: red; } }
			@scope (.card) to ([data-component="x"]) { [data-part="d"] { color: red; } }
			@scope (.card) to ([data-component], .x) { [data-part="e"] { color: red; } }
			@scope (.card) { [data-part="f"] { color: red; } }
		`);
		expect(model.scopes.map((scope) => [scope.limit, scope.limitIsComponents])).toEqual([
			["[data-component]", true],
			["[class]", false],
			["[data-part]", false],
			['[data-component="x"]', false],
			["[data-component], .x", false],
			[undefined, false],
		]);
		expect(model.components[0]?.scopes).toEqual([0, 1, 2, 3, 4, 5]);
	});

	inEverySyntax("a scope nested in the root block, and one core doesn't read", ({ read }) => {
		const model = read(`
			.button {
				color: red;
				@scope (&) to ([data-component]) { [data-part="icon"] { inline-size: 1em; } }
			}
			.card { color: red; @scope (.title) to ([data-component]) { p { margin: 0; } } }
		`);
		expect(
			model.scopes.map((scope) => [scope.component, scope.root, scope.nested, scope.afterRootBlock]),
		).toEqual([
			[0, "&", true, true],
			[undefined, ".title", true, undefined],
		]);
		expect(elements(model)).toEqual([
			["root", ".button"],
			["part", '.button [data-part="icon"]'],
			["root", ".card"],
		]);
		expect(model.unknowns.map((unknown) => [unknown.reason, unknown.elements])).toEqual([
			["scope-root", [2]],
		]);
	});
});

describe("doc comments", () => {
	// Sources: the file-header decision; core's design, question 7.
	inEverySyntax("belong to the component of the block right after them", ({ read }) => {
		const model = read(`
			/**
			 * Gallery
			 * @component gallery
			 * @sets --swiper-theme-color
			 */
			.gallery { & > [data-slot="image"] { margin: 0; } }

			/** Card */
			.card { color: red; }

			/**
			 * Tabs
			 * @reads --available-width
			 */
			@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { display: flex; } }

			/** Nothing after it. */
		`);
		expect(
			model.docComments.map((comment) => [comment.title, comment.component, comment.sets, comment.reads]),
		).toEqual([
			["Gallery", 0, ["--swiper-theme-color"], []],
			["Card", 1, [], []],
			["Tabs", 2, [], ["--available-width"]],
			["Nothing after it.", undefined, [], []],
		]);
		expect(model.components.map((component) => [component.name, component.docComment])).toEqual([
			["gallery", 0],
			["card", 1],
			["tabs", 2],
		]);
	});

	inEverySyntax("above a global rule, a doc comment belongs to nothing", ({ read }) => {
		const model = read("/** Links */ a { color: red; }");
		expect(model.docComments.map((comment) => [comment.title, comment.component])).toEqual([
			["Links", undefined],
		]);
	});
});

describe("unknown syntax", () => {
	// Source: the unknown-syntax decision, clarified 2026-11-14.
	inEverySyntax("an unknown names the elements it sits in", ({ read }) => {
		const model = read(`
			@include reset;
			.button {
				color: red;
				@include focus-ring;
				&:hover { @include lift; }
			}
			@scope (.button) to ([data-component]) {
				[data-part="icon"] { inline-size: 1em; @include icon; }
				[data-part="label"] { @include label; }
			}
		`);
		expect(model.unknowns.map((unknown) => unknown.elements.map((id) => keyOf(model, id)))).toEqual([
			[],
			[".button"],
			[".button"],
			['.button [data-part="icon"]'],
			[],
		]);
	});

	inEverySyntax("never throws, whatever the selectors are", ({ read }) => {
		const samples = [
			".a::after::before { color: red; }",
			".a, { color: red; }",
			":is(.a, .b) .c { color: red; }",
			".a + .b ~ .c > .d + .e { color: red; }",
			"@scope (.a) { :scope + :scope { color: red; } & + & { color: red; } }",
			"@scope (.a) to () { .b { color: red; } }",
			"@scope (.a) to (!) { .b { color: red; } }",
			"[data-part] [data-slot] { color: red; }",
			'[data-part="x"] .a [data-part=""] [data-slot=""] { color: red; }',
			'[data-component=""] { color: red; }',
			".a { & :deep(.b)::after { color: red; } }",
			"/** @component */ .a { color: red; }",
			"/** */ @scope (.a) { .b { color: red; } }",
			"@layer utilities { .a::after { color: red; } @scope (.b) { .c { color: red; } } }",
		];
		for (const css of samples) expect(() => read(css)).not.toThrow();
		expect(read(samples[0] ?? "").unknowns.filter((unknown) => unknown.reason === "internal")).toEqual([]);
	});
});

describe("Vue files", () => {
	it("keeps the components of plain and scoped blocks apart", () => {
		const parseHTML = html.parse;
		if (!parseHTML) throw new Error("postcss-html has no parser");
		const root = parseHTML(
			`<template><div></div></template>
			<style>.button { color: red; }</style>
			<style scoped>.button:hover { color: blue; } @scope (.button) to ([data-component]) { [data-part="icon"] { margin: 0; } }</style>
			<style>.button[data-size="small"] { gap: 0; }</style>`,
			{ from: "/project/src/Button.vue" },
		);
		const model = analyze(root, defaults);
		expect(
			model.components.map((component) => [component.name, component.sheet, component.hasRootBlock]),
		).toEqual([
			["button", 0, true],
			["button", 1, true],
		]);
		expect(model.elements.map((element) => [element.key, element.sheet, element.blocks])).toEqual([
			[".button", 0, [0, 3]],
			[".button", 1, [1]],
			['.button [data-part="icon"]', 1, [2]],
		]);
	});
});
