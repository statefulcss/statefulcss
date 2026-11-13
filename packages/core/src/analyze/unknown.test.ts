import { defaults } from "@statefulcss/config";
import { parse, rule } from "postcss";
import { describe, expect, it } from "vitest";

import { analyze } from "../index.js";
import { inEverySyntax, parseIn, syntaxes } from "../testing/syntaxes.js";

const reasons = (model: { unknowns: { reason: string; detail: string | undefined }[] }) =>
	model.unknowns.map((unknown) => [unknown.reason, unknown.detail]);

const onlySCSS = { css: "SCSS syntax", vue: "SCSS syntax, in a plain <style> block" };

describe("unknown syntax", () => {
	inEverySyntax(
		"SCSS interpolation in a selector",
		(read) => {
			const model = read(".button { &-#{$size} { color: red; } } .card-#{$name} { color: blue; }");
			expect(reasons(model)).toEqual([
				["interpolation", "#{$size}"],
				["interpolation", "#{$name}"],
			]);
			expect(model.elements.map((element) => element.key)).toEqual([]);
			expect(model.blocks).toEqual([]);
		},
		{ skip: onlySCSS },
	);

	inEverySyntax(
		"SCSS at-rules, placeholders and nested properties",
		(read) => {
			const model = read(`
				@use "sass:math";
				@mixin focus-ring { outline: 2px solid; }
				%control { color: red; }
				.button {
					@include focus-ring;
					@if $dense { padding: 0; }
					font: { family: inherit; }
					color: red;
				}
			`);
			expect(reasons(model)).toEqual([
				["unknown-at-rule", "@use"],
				["unknown-at-rule", "@mixin"],
				["unparsable-selector", "SCSS placeholder %control"],
				["unknown-at-rule", "@include"],
				["unknown-at-rule", "@if"],
				["nested-property", "font:"],
			]);
			expect(model.blocks.map((block) => block.selector)).toEqual([".button"]);
		},
		{ skip: onlySCSS },
	);

	inEverySyntax("an unknown at-rule's contents aren't attributed to any element", (read) => {
		const model = read("@include breakpoint(medium) { .button { color: red; } }");
		expect(reasons(model)).toEqual([["unknown-at-rule", "@include"]]);
		expect(model.elements).toEqual([]);
	});

	inEverySyntax("a selector the parser can't read", (read) => {
		const model = read(".button ! .icon { color: red; } .card { color: blue; }");
		expect(model.unknowns.map((unknown) => unknown.reason)).toEqual(["unparsable-selector"]);
		expect(model.elements.map((element) => element.key)).toEqual([".card"]);
	});

	inEverySyntax("& with no parent rule", (read) => {
		expect(reasons(read("&:hover { color: red; }"))).toEqual([["unparsable-selector", "& outside a rule"]]);
	});

	inEverySyntax("@scope without a root selector, or inside a rule", (read) => {
		const model = read("@scope { .title { color: red; } } .card { @scope (.title) { color: red; } }");
		expect(reasons(model)).toEqual([
			["unparsable-selector", "@scope without a root selector"],
			["unknown-at-rule", "@scope inside a rule"],
		]);
	});

	it("template placeholders, in a tree another syntax built", () => {
		const root = parse("");
		root.append(rule({ selector: ".button-${size}" }).append({ prop: "color", value: "red" }));
		root.append(rule({ selector: ".card-{{ name }}" }).append({ prop: "color", value: "red" }));
		const model = analyze(root, defaults);
		expect(reasons(model)).toEqual([
			["template-placeholder", "${size}"],
			["template-placeholder", "{{ name }}"],
		]);
	});

	describe("never throws", () => {
		const samples = [
			"",
			"/* only a comment */",
			"@media screen;",
			".a { & { & { color: red; } } }",
			".a { > .b { color: red; } + .c { color: red; } }",
			".a, { color: red; }",
			":is(.a, .b) .c { color: red; }",
			":where(.a) { color: red; }",
			".a::after::before { color: red; }",
			".a { &::after { &:hover { color: red; } } }",
			"@scope (.a) { & .b { color: red; } :scope + :scope { color: red; } }",
			"@layer { .a { color: red; } }",
			"@starting-style { .a { opacity: 0; } }",
			".a { @starting-style { opacity: 0; } }",
			"* { margin: 0; }",
			"@media (hover: hover) { color: red; }",
		];
		for (const syntax of syntaxes) {
			it(syntax, () => {
				for (const css of samples) expect(() => analyze(parseIn(syntax, css), defaults)).not.toThrow();
			});
		}
	});
});
