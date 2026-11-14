import { describe, expect } from "vitest";

import type { Model } from "../model.js";
import { inEverySyntax } from "../testing/syntaxes.js";

const declared = (model: Model) =>
	model.declarations.map((declaration) => [declaration.property, declaration.role, declaration.value]);
const roles = (model: Model) =>
	model.declarations.map((declaration) => [declaration.property, declaration.role] as const);
const keyOf = (model: Model, id: number | undefined) =>
	id === undefined ? undefined : model.elements[id]?.key;
const reads = (model: Model) =>
	model.reads.map((read) => [read.name, read.role, read.via, keyOf(model, read.element), read.block]);

const onlySCSS = { css: "SCSS syntax", vue: "SCSS syntax, in a plain <style> block" };

describe("declarations", () => {
	// Source: the methodology's "The methodology in ten rules".
	inEverySyntax("each one, with its block, its property and its role", ({ read }) => {
		const model = read(`
			/**
			 * Button
			 * @component button
			 */
			.button {
				--_background-color: var(--t-color-neutral-100);
				--s-background-color: var(--_background-color);
				--p-icon-inline-size: 16px;
				--q-button-blocked: false;
				background-color: var(--s-background-color);
				border-radius: var(--c-button-border-radius, var(--t-radius-medium));

				&[data-size="small"] { --p-icon-inline-size: 12px; }
				&:disabled { --q-button-blocked: true; }
			}
			@scope (.button) to ([data-component]) {
				[data-part="icon"] { inline-size: var(--p-icon-inline-size); }
			}
		`);
		expect(model.unknowns).toEqual([]);
		expect(declared(model)).toEqual([
			["--_background-color", "private", "var(--t-color-neutral-100)"],
			["--s-background-color", "state", "var(--_background-color)"],
			["--p-icon-inline-size", "part", "16px"],
			["--q-button-blocked", "query", "false"],
			["background-color", undefined, "var(--s-background-color)"],
			["border-radius", undefined, "var(--c-button-border-radius, var(--t-radius-medium))"],
			["--p-icon-inline-size", "part", "12px"],
			["--q-button-blocked", "query", "true"],
			["inline-size", undefined, "var(--p-icon-inline-size)"],
		]);
		expect(model.declarations.map((declaration) => [declaration.id, declaration.block])).toEqual([
			[0, 0],
			[1, 0],
			[2, 0],
			[3, 0],
			[4, 0],
			[5, 0],
			[6, 1],
			[7, 2],
			[8, 3],
		]);
		expect(model.blocks.map((block) => block.declarations)).toEqual([[0, 1, 2, 3, 4, 5], [6], [7], [8]]);
		expect(model.declarations[4]?.node).toMatchObject({ type: "decl", prop: "background-color" });
	});

	inEverySyntax("a selector list makes one declaration per block, on the same node", ({ read }) => {
		const model = read(".button { &:hover, &:focus-visible { --s-opacity: 0.9; } }");
		expect(model.declarations.map((declaration) => declaration.block)).toEqual([0, 1]);
		expect(model.declarations[0]?.node).toBe(model.declarations[1]?.node);
	});

	inEverySyntax("declarations directly in a query belong to the query's block", ({ read }) => {
		const model = read(`
			.card {
				--s-padding: var(--t-space-4);
				padding: var(--s-padding);
				@container --card (inline-size < 20rem) { --s-padding: var(--t-space-2); }
			}
		`);
		expect(model.blocks.map((block) => [block.kind, block.declarations])).toEqual([
			["own", [0, 1]],
			["state", [2]],
		]);
	});

	inEverySyntax("a property is lower case, and a custom property keeps its case", ({ read }) => {
		const model = read(".card { COLOR: red; --S-Color: red; --s-Color: blue; }");
		expect(roles(model)).toEqual([
			["color", undefined],
			["--S-Color", "none"],
			["--s-Color", "state"],
		]);
	});

	// Source: the rules page, rule 3: a repeated custom property.
	inEverySyntax("a custom property repeated in one block is two declarations", ({ read }) => {
		const model = read(
			".sheet { --s-block-size: 100vh; --s-block-size: 100dvh; block-size: var(--s-block-size); }",
		);
		expect(declared(model).slice(0, 2)).toEqual([
			["--s-block-size", "state", "100vh"],
			["--s-block-size", "state", "100dvh"],
		]);
		expect(model.blocks[0]?.declarations).toEqual([0, 1, 2]);
	});

	// Sources: the element-privates decision; the rules page, rule 4, not reported.
	inEverySyntax("a private taken with inherit", ({ read }) => {
		const model = read(`
			@scope (.card) to ([data-component]) {
				[data-part="badge"] { --_accent: inherit; --_gap: Inherit; color: var(--_accent); all: inherit; }
			}
		`);
		expect(model.declarations.map((declaration) => [declaration.property, declaration.inherits])).toEqual([
			["--_accent", true],
			["--_gap", true],
			["color", false],
			["all", false],
		]);
	});

	// Source: the rules page, rule 2's cases.
	inEverySyntax("tokens on a theme scope, and what else a theme scope declares", ({ read }) => {
		const model = read(`
			[data-theme] {
				color-scheme: light dark;
				--t-color-background-base: light-dark(white, black);
				--c-button-background-color: red;
				padding: 0;
				@media (prefers-reduced-motion: reduce) { --t-duration-fast: 0s; }
			}
			:root { --t-space-2: 0.5rem; }
			.button { --t-space-2: 0.5rem; }
		`);
		expect(roles(model)).toEqual([
			["color-scheme", undefined],
			["--t-color-background-base", "token"],
			["--c-button-background-color", "component"],
			["padding", undefined],
			["--t-duration-fast", "token"],
			["--t-space-2", "token"],
			["--t-space-2", "token"],
		]);
		expect(
			model.declarations.map((declaration) => keyOf(model, model.blocks[declaration.block]?.element)),
		).toEqual([
			"[data-theme]",
			"[data-theme]",
			"[data-theme]",
			"[data-theme]",
			"[data-theme]",
			":root",
			".button",
		]);
	});
});

describe("roles", () => {
	// Source: the rules page, rule 1's cases.
	inEverySyntax("a variable with no role, and a prefix with no name", ({ read }) => {
		const model = read(`
			.button { --opacity: 1; opacity: var(--opacity); &:hover { --opacity: 0.9; } }
			[data-theme="default"] { --t-: 1rem; }
		`);
		expect(roles(model)).toEqual([
			["--opacity", "none"],
			["opacity", undefined],
			["--opacity", "none"],
			["--t-", "token"],
		]);
		expect(reads(model)).toEqual([["--opacity", "none", "var", ".button", 0]]);
	});

	// Sources: the rules page, rule 1; the library-variables decision.
	inEverySyntax(
		"a library variable is one the component's doc comment names, for that component only",
		({ read }) => {
			const model = read(`
			/**
			 * Gallery
			 * @sets --swiper-theme-color
			 * @reads --available-width
			 */
			.gallery {
				--swiper-theme-color: var(--t-color-foreground-accent);
				--swiper-navigation-size: 2rem;
				max-inline-size: var(--available-width);
				block-size: var(--available-height);
			}
			@scope (.gallery) to ([data-component]) {
				[data-part="slide"] { --swiper-theme-color: red; inline-size: var(--available-width); }
			}

			.card { --swiper-theme-color: var(--t-color-foreground-accent); max-inline-size: var(--available-width); }
		`);
			expect(roles(model).filter(([property]) => property.startsWith("--"))).toEqual([
				["--swiper-theme-color", "library"],
				["--swiper-navigation-size", "none"],
				["--swiper-theme-color", "library"],
				["--swiper-theme-color", "none"],
			]);
			expect(model.reads.map((one) => [one.name, one.role, keyOf(model, one.element)])).toEqual([
				["--t-color-foreground-accent", "token", ".gallery"],
				["--available-width", "library", ".gallery"],
				["--available-height", "none", ".gallery"],
				["--available-width", "library", '.gallery [data-part="slide"]'],
				["--t-color-foreground-accent", "token", ".card"],
				["--available-width", "none", ".card"],
			]);
		},
	);

	inEverySyntax("a doc comment above a scope names library variables for that component too", ({ read }) => {
		const model = read(`
			/**
			 * Tabs
			 * @sets --swiper-theme-color
			 */
			@scope ([data-component="tabs"]) to ([data-component]) {
				[data-part="list"] { --swiper-theme-color: red; }
			}
			a { --swiper-theme-color: red; }
		`);
		expect(roles(model)).toEqual([
			["--swiper-theme-color", "library"],
			["--swiper-theme-color", "none"],
		]);
	});
});

describe("reads", () => {
	// Sources: the rules page's "Shared pieces"; the methodology's ten rules.
	inEverySyntax("each var(), with its declaration, its block and its element", ({ read }) => {
		const model = read(`
			.button {
				--s-outline-width: 0;
				border-radius: var(--c-button-border-radius, var(--t-radius-medium));
				outline: var(--s-outline-width) solid var(--t-color-ring-base);
				margin-block: calc(var(--_gap) / 2);
				&::after { opacity: var(--p-after-opacity); }
			}
		`);
		expect(
			model.reads.map((one) => [
				one.id,
				one.name,
				one.role,
				one.declaration,
				one.position,
				one.hasFallback,
				one.inFallback,
			]),
		).toEqual([
			[0, "--c-button-border-radius", "component", 1, "whole", true, false],
			[1, "--t-radius-medium", "token", 1, "whole", false, true],
			[2, "--s-outline-width", "state", 2, "word", false, false],
			[3, "--t-color-ring-base", "token", 2, "word", false, false],
			[4, "--_gap", "private", 3, "function", false, false],
			[5, "--p-after-opacity", "part", 4, "whole", false, false],
		]);
		expect(model.declarations.map((declaration) => declaration.reads)).toEqual([
			[],
			[0, 1],
			[2, 3],
			[4],
			[5],
		]);
		expect(model.reads.map((one) => [keyOf(model, one.element), one.block, one.via, one.source])).toEqual([
			[".button", 0, "var", undefined],
			[".button", 0, "var", undefined],
			[".button", 0, "var", undefined],
			[".button", 0, "var", undefined],
			[".button", 0, "var", undefined],
			[".button::after", 1, "var", undefined],
		]);
	});

	// Source: the parts page, "A part with states of its own".
	inEverySyntax("a style query is a read too, once for each block it's around", ({ read }) => {
		const model = read(`
			.tabs { --q-tabs-blocked: false; &[aria-disabled="true"] { --q-tabs-blocked: true; } }
			@scope (.tabs) to ([data-component]) {
				[data-part="tab"] {
					--s-color: var(--p-tab-color);
					@container style(--q-tabs-blocked: false) {
						&:hover { --s-color: var(--t-color-text); }
						&:active { --s-color: var(--t-color-text-strong); }
					}
				}
			}
		`);
		expect(reads(model)).toEqual([
			["--p-tab-color", "part", "var", '.tabs [data-part="tab"]', 2],
			["--q-tabs-blocked", "query", "style-query", '.tabs [data-part="tab"]', 3],
			["--t-color-text", "token", "var", '.tabs [data-part="tab"]', 3],
			["--q-tabs-blocked", "query", "style-query", '.tabs [data-part="tab"]', 4],
			["--t-color-text-strong", "token", "var", '.tabs [data-part="tab"]', 4],
		]);
		expect(model.reads[1]).toMatchObject({
			declaration: undefined,
			hasFallback: false,
			inFallback: false,
			position: "whole",
		});
	});
});

describe("registrations", () => {
	// Sources: the rules page, rules 1 and 2, and `resolve-where-shown`.
	inEverySyntax("each @property, with its name, its role and what it registers", ({ read }) => {
		const model = read(`
			@property --scale { syntax: "<number>"; inherits: false; initial-value: 1; }
			@property --_tabs-indicator-scale { syntax: '<number>'; inherits: false; initial-value: 1; }
			@layer themes {
				@property --t-space-2 { syntax: "<length>"; inherits: true; initial-value: 0.5rem; }
			}
			@property --t-color-text { syntax: "*"; inherits: true; }
		`);
		expect(model.registrations.map(({ node, ...registration }) => [node.name, registration])).toEqual([
			[
				"property",
				{ name: "--scale", role: "none", syntax: "<number>", inherits: "false", initialValue: "1" },
			],
			[
				"property",
				{
					name: "--_tabs-indicator-scale",
					role: "private",
					syntax: "<number>",
					inherits: "false",
					initialValue: "1",
				},
			],
			[
				"property",
				{ name: "--t-space-2", role: "token", syntax: "<length>", inherits: "true", initialValue: "0.5rem" },
			],
			[
				"property",
				{ name: "--t-color-text", role: "token", syntax: "*", inherits: "true", initialValue: undefined },
			],
		]);
		expect(model.atRules).toEqual([]);
	});
});

describe("values core can't read", () => {
	// Source: the unknown-syntax decision, clarified 2026-11-14.
	inEverySyntax("v-bind() keeps the declaration and marks its value", ({ read }) => {
		const model = read(
			".card { --s-color: v-bind(theme.color); color: var(--s-color); padding: v-bind('gap'); }",
		);
		expect(
			model.declarations.map((declaration) => [
				declaration.property,
				declaration.valueUnread,
				declaration.reads,
			]),
		).toEqual([
			["--s-color", true, []],
			["color", false, [0]],
			["padding", true, []],
		]);
		expect(model.unknowns).toEqual([]);
	});

	inEverySyntax(
		"a SCSS value keeps the declaration, marks its value and reads nothing from it",
		({ read }) => {
			const model = read(`
				.card {
					$gap: 1rem;
					padding: $gap;
					--s-color: #{$color};
					margin: math.div($gap, 2) var(--_margin);
					color: var(--s-color);
				}
			`);
			expect(
				model.declarations.map((declaration) => [
					declaration.property,
					declaration.valueUnread,
					declaration.reads,
				]),
			).toEqual([
				["padding", true, []],
				["--s-color", true, []],
				["margin", true, []],
				["color", false, [0]],
			]);
			expect(model.unknowns).toEqual([]);
		},
		{ skip: onlySCSS },
	);

	inEverySyntax(
		"a property core can't read is unknown, and names its element",
		({ read }) => {
			const model = read(".card { #{$property}: red; color: blue; }");
			expect(roles(model)).toEqual([["color", undefined]]);
			expect(
				model.unknowns.map((unknown) => [
					unknown.reason,
					unknown.detail,
					unknown.node.type,
					unknown.elements,
				]),
			).toEqual([["interpolation", "#{$property}", "decl", [0]]]);
		},
		{ skip: onlySCSS },
	);

	inEverySyntax("never throws, whatever the values are", ({ read }) => {
		const samples = [
			".a { --x: { a: b }; }",
			".a { --x: ; --y:; }",
			".a { color: var(); margin: var(,); padding: var(--x,,); }",
			"@property { syntax: '*'; }",
			"@property --x;",
			"@property --x { }",
			"@container style(--x: ) { .a { color: red; } }",
		];
		for (const css of samples) expect(() => read(css)).not.toThrow();
		for (const css of samples)
			expect(read(css).unknowns.filter((unknown) => unknown.reason === "internal")).toEqual([]);
	});
});

describe("the model", () => {
	inEverySyntax("is still JSON once the PostCSS nodes are dropped", ({ read }) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the tree is the one field that isn't data
		const { root, ...data } = read(`
			@property --t-space-2 { syntax: "<length>"; inherits: true; initial-value: 0.5rem; }
			.button { --s-gap: var(--t-space-2); gap: var(--s-gap); }
		`);
		const copy = JSON.parse(
			JSON.stringify(data, (key, value: unknown) => (key === "node" ? undefined : value)),
		) as Model;
		expect(copy.declarations.map((declaration) => declaration.property)).toEqual(["--s-gap", "gap"]);
		expect(copy.reads.map((one) => one.name)).toEqual(["--t-space-2", "--s-gap"]);
		expect(copy.registrations.map((registration) => registration.name)).toEqual(["--t-space-2"]);
	});
});
