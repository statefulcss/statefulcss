import { defaults } from "@statefulcss/config";
import { parse as parseCSS, rule } from "postcss";
import { describe, expect, it } from "vitest";

import { analyze } from "../index.js";
import { inEverySyntax, parseIn, syntaxes } from "../testing/syntaxes.js";
import { complexToString } from "./selectors.js";
import { walk, type Walked } from "./walk.js";

const selectors = (walked: Walked) => walked.blocks.map((block) => complexToString(block.selector));
const reasons = (walked: Walked) => walked.unknowns.map((unknown) => [unknown.reason, unknown.detail]);

const onlySCSS = { css: "SCSS syntax", vue: "SCSS syntax, in a plain <style> block" };

describe("unknown syntax", () => {
	inEverySyntax(
		"SCSS interpolation in a selector",
		({ parse }) => {
			const walked = walk(parse(".button { &-#{$size} { color: red; } } .card-#{$name} { color: blue; }"));
			expect(reasons(walked)).toEqual([
				["interpolation", "#{$size}"],
				["interpolation", "#{$name}"],
			]);
			expect(walked.blocks).toEqual([]);
		},
		{ skip: onlySCSS },
	);

	inEverySyntax(
		"SCSS at-rules, placeholders, nested properties and variables",
		({ parse }) => {
			const walked = walk(
				parse(`
					@use "sass:math";
					@mixin focus-ring { outline: 2px solid; }
					%control { color: red; }
					.button {
						@include focus-ring;
						@if $dense { padding: 0; }
						font: { family: inherit; }
						color: red;
					}
					.card { $gap: 1rem; }
				`),
			);
			expect(reasons(walked)).toEqual([
				["unknown-at-rule", "@use"],
				["unknown-at-rule", "@mixin"],
				["unparsable-selector", "SCSS placeholder %control"],
				["unknown-at-rule", "@include"],
				["unknown-at-rule", "@if"],
				["nested-property", "font:"],
			]);
			expect(selectors(walked)).toEqual([".button"]);
		},
		{ skip: onlySCSS },
	);

	inEverySyntax("an unknown at-rule's contents aren't read", ({ parse }) => {
		const walked = walk(parse("@include breakpoint(medium) { .button { color: red; } }"));
		expect(reasons(walked)).toEqual([["unknown-at-rule", "@include"]]);
		expect(walked.blocks).toEqual([]);
	});

	inEverySyntax("an unknown records the selectors of the rule it sits in", ({ parse }) => {
		const walked = walk(
			parse(`
				@include reset;
				.button { color: red; &:hover { @include focus-ring; } }
				@scope (.button) to ([data-component]) { [data-part="icon"] { @include icon; } }
			`),
		);
		expect(
			walked.unknowns.map((unknown) => [
				unknown.detail,
				unknown.selectors.map(complexToString),
				unknown.scope,
			]),
		).toEqual([
			["@include", [], undefined],
			["@include", [".button:hover"], undefined],
			["@include", ['.button [data-part="icon"]'], 0],
		]);
	});

	inEverySyntax("a selector the parser can't read", ({ parse }) => {
		const walked = walk(parse(".button ! .icon { color: red; } .card { color: blue; }"));
		expect(walked.unknowns.map((unknown) => unknown.reason)).toEqual(["unparsable-selector"]);
		expect(selectors(walked)).toEqual([".card"]);
	});

	inEverySyntax("& with no parent rule", ({ parse }) => {
		expect(reasons(walk(parse("&:hover { color: red; }")))).toEqual([
			["unparsable-selector", "& outside a rule"],
		]);
	});

	it("template placeholders, in a tree another syntax built", () => {
		const root = parseCSS("");
		root.append(rule({ selector: ".button-${size}" }).append({ prop: "color", value: "red" }));
		root.append(rule({ selector: ".card-{{ name }}" }).append({ prop: "color", value: "red" }));
		expect(reasons(walk(root))).toEqual([
			["template-placeholder", "${size}"],
			["template-placeholder", "{{ name }}"],
		]);
	});

	inEverySyntax("the model lists what wasn't read", ({ read }) => {
		const model = read("@include reset; .card { color: red; }");
		expect(model.unknowns.map((unknown) => [unknown.reason, unknown.detail, unknown.node.type])).toEqual([
			["unknown-at-rule", "@include", "atrule"],
		]);
	});

	describe("never throws", () => {
		const samples = [
			"",
			"/* only a comment */",
			"/** only a doc comment */",
			"@media screen;",
			".a { & { & { color: red; } } }",
			".a { > .b { color: red; } + .c { color: red; } }",
			".a, { color: red; }",
			":is(.a, .b) .c { color: red; }",
			":where(.a) { color: red; }",
			".a::after::before { color: red; }",
			".a { &::after { &:hover { color: red; } } }",
			"@scope (.a) { & .b { color: red; } :scope + :scope { color: red; } }",
			"@scope (.a) to { .b { color: red; } }",
			"@scope (.a { .b { color: red; } }",
			"@scope to (.b) { .c { color: red; } }",
			"@scope (&) { .b { color: red; } }",
			"@scope (.a) { @scope (.b) { .c { color: red; } } }",
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
