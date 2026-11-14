import { describe, expect, it } from "vitest";

import { readDocComment } from "./doc-comment.js";

// PostCSS hands a comment over without its delimiters, so `/** Card */` arrives as `* Card`.
const text = (lines: string[]) => ["*", ...lines.map((line) => ` * ${line}`), " "].join("\n");

describe("a doc comment", () => {
	// Source: the methodology's "The doc comment".
	it("has the component's name on its first line, then its tags", () => {
		expect(
			readDocComment(
				text([
					"Gallery",
					"@component gallery",
					"@description A row of images that scrolls.",
					"@sets --swiper-theme-color",
				]),
			),
		).toEqual({
			title: "Gallery",
			tags: [
				{ name: "component", value: "gallery" },
				{ name: "description", value: "A row of images that scrolls." },
				{ name: "sets", value: "--swiper-theme-color" },
			],
			componentName: "gallery",
			sets: ["--swiper-theme-color"],
			reads: [],
			queries: [],
		});
	});

	it("reads lists that are separated by commas, wrap, or repeat", () => {
		const read = readDocComment(
			text([
				"Popup",
				"@sets --swiper-theme-color, --swiper-navigation-size,",
				"  --swiper-pagination-color",
				"@reads --available-width --available-height",
				"@sets --floating-offset",
				"@queries --q-tabs-blocked",
			]),
		);
		expect(read.sets).toEqual([
			"--swiper-theme-color",
			"--swiper-navigation-size",
			"--swiper-pagination-color",
			"--floating-offset",
		]);
		expect(read.reads).toEqual(["--available-width", "--available-height"]);
		expect(read.queries).toEqual(["--q-tabs-blocked"]);
		expect(read.tags[0]).toEqual({
			name: "sets",
			value: "--swiper-theme-color, --swiper-navigation-size, --swiper-pagination-color",
		});
	});

	it("keeps tags it doesn't know, and only names in the lists", () => {
		const read = readDocComment(text(["Card", "@since 0.2.0", "@status draft", "@reads the popup's width"]));
		expect(read.tags.map((tag) => tag.name)).toEqual(["since", "status", "reads"]);
		expect(read.reads).toEqual([]);
		expect(read.componentName).toBeUndefined();
	});

	it("has no title when it starts with a tag, or holds nothing", () => {
		expect(readDocComment(text(["@component card"]))).toMatchObject({
			title: undefined,
			componentName: "card",
		});
		expect(readDocComment("*")).toEqual({
			title: undefined,
			tags: [],
			componentName: undefined,
			sets: [],
			reads: [],
			queries: [],
		});
	});

	it("reads a comment written on one line", () => {
		expect(readDocComment("* Button")).toMatchObject({ title: "Button", tags: [] });
		expect(readDocComment("* @component button")).toMatchObject({
			title: undefined,
			componentName: "button",
		});
	});

	it("takes the first word of @component as the name", () => {
		expect(
			readDocComment(text(["Button group", "@component button-group (see the docs)"])).componentName,
		).toBe("button-group");
	});
});
