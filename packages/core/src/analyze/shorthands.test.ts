import { describe, expect, it } from "vitest";

import { longhandsOf, overlaps } from "./shorthands.js";

describe("the longhands a shorthand sets", () => {
	it("a box shorthand sets its four sides, and a flow-relative one its two", () => {
		expect(longhandsOf("padding")).toEqual([
			"padding-top",
			"padding-right",
			"padding-bottom",
			"padding-left",
		]);
		expect(longhandsOf("padding-inline")).toEqual(["padding-inline-start", "padding-inline-end"]);
		expect(longhandsOf("margin-block")).toEqual(["margin-block-start", "margin-block-end"]);
		expect(longhandsOf("inset")).toEqual(["top", "right", "bottom", "left"]);
		expect(longhandsOf("inset-inline")).toEqual(["inset-inline-start", "inset-inline-end"]);
	});

	it("a shorthand of shorthands sets every longhand under it", () => {
		const border = longhandsOf("border");
		expect(border).toHaveLength(17);
		expect(border).toEqual(
			expect.arrayContaining(["border-top-width", "border-left-color", "border-image-source"]),
		);
		expect(longhandsOf("border-width")).toEqual([
			"border-top-width",
			"border-right-width",
			"border-bottom-width",
			"border-left-width",
		]);
		expect(longhandsOf("border-block")).toEqual([
			"border-block-start-width",
			"border-block-start-style",
			"border-block-start-color",
			"border-block-end-width",
			"border-block-end-style",
			"border-block-end-color",
		]);
		expect(longhandsOf("background")).toEqual(
			expect.arrayContaining(["background-color", "background-position-x"]),
		);
	});

	it("the shorthands a state variable is read in a slot of", () => {
		expect(longhandsOf("outline")).toEqual(["outline-width", "outline-style", "outline-color"]);
		expect(longhandsOf("gap")).toEqual(["row-gap", "column-gap"]);
		expect(longhandsOf("flex")).toEqual(["flex-grow", "flex-shrink", "flex-basis"]);
		expect(longhandsOf("grid-area")).toEqual([
			"grid-row-start",
			"grid-column-start",
			"grid-row-end",
			"grid-column-end",
		]);
		expect(longhandsOf("text-decoration")).toContain("text-decoration-thickness");
		expect(longhandsOf("font")).toContain("line-height");
		expect(longhandsOf("transition")).toContain("transition-duration");
		expect(longhandsOf("container")).toEqual(["container-name", "container-type"]);
	});

	it("nothing, for a longhand, a custom property or a property it doesn't know", () => {
		for (const property of [
			"color",
			"padding-top",
			"inline-size",
			"--s-padding",
			"not-a-property",
			"",
			// Names an object has on its prototype are properties like any other.
			"constructor",
			"toString",
			"__proto__",
			"hasOwnProperty",
		])
			expect(longhandsOf(property)).toEqual([]);
	});

	it("for font, every font-variant longhand and the properties font only resets", () => {
		// Source: CSS Fonts 4, the font shorthand: it resets its reset-only sub-properties to their initial values.
		expect(longhandsOf("font-variant")).toEqual([
			"font-variant-ligatures",
			"font-variant-position",
			"font-variant-caps",
			"font-variant-numeric",
			"font-variant-alternates",
			"font-variant-east-asian",
			"font-variant-emoji",
		]);
		expect(longhandsOf("font")).toEqual(
			expect.arrayContaining([
				...longhandsOf("font-variant"),
				"font-feature-settings",
				"font-kerning",
				"font-language-override",
				"font-optical-sizing",
				"font-size-adjust",
				"font-variation-settings",
			]),
		);
		expect(longhandsOf("font")).not.toContain("font-variant");
		expect(longhandsOf("font")).not.toContain("font-palette");
	});

	it("whatever the case", () => {
		expect(longhandsOf("PADDING-Block")).toEqual(["padding-block-start", "padding-block-end"]);
	});
});

describe("whether two properties overlap", () => {
	const rows: [a: string, b: string, overlap: boolean][] = [
		// A shorthand and its longhand
		["padding", "padding-top", true],
		["padding-inline", "padding-inline-start", true],
		["border", "border-top-color", true],
		["border-width", "border-top-width", true],
		["border", "border-width", true],
		["background", "background-color", true],
		["font", "line-height", true],
		["font", "font-variant-caps", true],
		["font", "font-kerning", true],
		["font", "font-variant", true],
		["font-variant", "font-variant-numeric", true],
		["flex", "flex-basis", true],
		["gap", "row-gap", true],
		["inset", "top", true],
		["overflow", "overflow-x", true],
		// A logical and a physical property of the same kind: which side a logical one is depends on the writing mode
		["padding", "padding-inline-start", true],
		["padding-inline", "padding-left", true],
		["padding-block-start", "padding-top", true],
		["margin-inline", "margin", true],
		["inset-inline", "left", true],
		["border", "border-block-start-color", true],
		["border-inline-width", "border-left-width", true],
		["border-radius", "border-start-start-radius", true],
		["inline-size", "width", true],
		["inline-size", "height", true],
		["max-block-size", "max-height", true],
		["overflow", "overflow-inline", true],
		// The same property
		["color", "color", true],
		// Two properties that set different things
		["padding-block", "padding-inline", false],
		["padding-top", "padding-left", false],
		["margin", "padding", false],
		["border-color", "border-top-width", false],
		["border-inline-width", "border-left-color", false],
		["width", "height", false],
		["inline-size", "block-size", false],
		["inline-size", "max-width", false],
		["color", "background-color", false],
		["gap", "grid-area", false],
		["--s-padding", "padding", false],
		["--s-padding", "--S-padding", false],
		["not-a-property", "another-one", false],
		["font", "font-palette", false],
		["font-variant", "font-weight", false],
		["constructor", "color", false],
		["toString", "valueOf", false],
		["__proto__", "padding", false],
	];

	it("a shorthand with its longhand, and a logical property with a physical one", () => {
		expect(rows.map(([a, b]) => overlaps(a, b))).toEqual(rows.map(([, , overlap]) => overlap));
	});

	it("in either order, whatever the case", () => {
		const upper = (property: string) => (property.startsWith("--") ? property : property.toUpperCase());
		expect(rows.map(([a, b]) => overlaps(upper(b), a))).toEqual(rows.map(([, , overlap]) => overlap));
	});
});
