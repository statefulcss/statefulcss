import { describe, expect, it } from "vitest";

import { isUnreadValue, readsOf } from "./values.js";

const reads = (value: string) =>
	readsOf(value).map((read) => [read.name, read.position, read.hasFallback, read.inFallback]);

describe("the variables a value reads", () => {
	// Sources: the rules page's "Shared pieces" (reads); the methodology's ten rules; `state-variable-names`.
	it("a var() that is the whole value", () => {
		expect(reads("var(--s-color)")).toEqual([["--s-color", "whole", false, false]]);
		expect(reads("  VAR( --s-color )  ")).toEqual([["--s-color", "whole", false, false]]);
	});

	it("a fallback, and the variable the fallback reads", () => {
		expect(reads("var(--c-button-border-radius, var(--t-radius-medium))")).toEqual([
			["--c-button-border-radius", "whole", true, false],
			["--t-radius-medium", "whole", false, true],
		]);
		expect(reads("var(--_padding, 1rem)")).toEqual([["--_padding", "whole", true, false]]);
		expect(reads("var(--a,)")).toEqual([["--a", "whole", true, false]]);
		expect(reads("var(--a, var(--b, var(--c)))")).toEqual([
			["--a", "whole", true, false],
			["--b", "whole", true, true],
			["--c", "whole", false, true],
		]);
	});

	it("one word of the value: a shorthand's slot, or an item of a list", () => {
		expect(reads("var(--s-outline-width) solid var(--t-color-ring-base)")).toEqual([
			["--s-outline-width", "word", false, false],
			["--t-color-ring-base", "word", false, false],
		]);
		expect(reads("opacity var(--t-duration-fast), color var(--t-duration-fast)")).toEqual([
			["--t-duration-fast", "word", false, false],
			["--t-duration-fast", "word", false, false],
		]);
	});

	it("inside a function", () => {
		expect(reads("calc(var(--_gap) / 2)")).toEqual([["--_gap", "function", false, false]]);
		expect(reads("scaleX(var(--s-scale))")).toEqual([["--s-scale", "function", false, false]]);
		expect(reads("light-dark(var(--a), var(--b))")).toEqual([
			["--a", "function", false, false],
			["--b", "function", false, false],
		]);
		expect(reads("calc(var(--a, var(--b)) + 1px)")).toEqual([
			["--a", "function", true, false],
			["--b", "function", false, true],
		]);
	});

	it("a fallback's reads stand where their var() stands", () => {
		expect(reads("var(--a, calc(var(--b) * 2))")).toEqual([
			["--a", "whole", true, false],
			["--b", "whole", false, true],
		]);
	});

	it("nothing, when the value reads no variable", () => {
		for (const value of ["1rem", "", "var()", "var(1px)", "variable(--x)", "url(var(--x))", "'var(--x)'"])
			expect(reads(value)).toEqual([]);
	});

	it("never throws on a value of any shape", () => {
		for (const value of [
			"var(--x",
			"((",
			"var(--x))",
			")",
			"var(,--x)",
			"{ a: var(--b) }",
			"\\",
			"var(--x, ",
		])
			expect(() => readsOf(value)).not.toThrow();
		expect(reads("var(--x")).toEqual([["--x", "whole", false, false]]);
	});
});

describe("a value core can't read", () => {
	// Source: the unknown-syntax decision, clarified 2026-11-14.
	it("holds SCSS or Less interpolation, a SCSS variable, v-bind() or a template placeholder", () => {
		for (const value of [
			"$gap",
			"#{$color}",
			"math.div($a, 2)",
			"v-bind(color)",
			"V-BIND('x')",
			"${size}px",
			"{{ gap }}",
			"@{gap}",
			"1px + $x",
		])
			expect(isUnreadValue(value)).toBe(true);
	});

	it("is not a plain CSS value", () => {
		for (const value of [
			"1rem",
			"var(--s-color)",
			"calc(1px + 2px)",
			'url("a$b.png")',
			"'$'",
			"light-dark(white, black)",
		])
			expect(isUnreadValue(value)).toBe(false);
	});
});
