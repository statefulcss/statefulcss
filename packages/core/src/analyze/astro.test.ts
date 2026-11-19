import { defaults } from "@statefulcss/config";
import html from "postcss-html";
import { describe, expect, it } from "vitest";

import { analyze } from "../index.js";
import { walk } from "./walk.js";

// Astro scopes a component's `<style>` to the elements written in its file, unless it's `is:global` or `is:inline`.
function parseAstro(styles: string) {
	const parseHTML = html.parse;
	if (!parseHTML) throw new Error("postcss-html has no parser");
	return parseHTML(`---\nconst title = "Card";\n---\n<div class="card" data-component></div>\n${styles}`, {
		from: "/project/src/components/Card.astro",
	});
}

describe("Astro files", () => {
	it("reads plain <style> blocks as one scoped sheet, and is:global and is:inline blocks as one plain sheet", () => {
		const walked = walk(
			parseAstro(`
				<style>.card { color: red; }</style>
				<style is:global>.page { color: red; }</style>
				<style>.card:hover { color: blue; }</style>
				<style is:inline>.inline { color: red; }</style>
			`),
		);
		expect(walked.sheets).toEqual(["scoped", "plain"]);
		expect(walked.blocks.map((block) => block.sheet)).toEqual([0, 1, 0, 1]);
	});

	it("marks the scoped sheet as one whose build adds the file's scope to @scope limits", () => {
		const model = analyze(
			parseAstro(`
				<style>.card { color: red; } @scope (.card) to (:global([data-component])) { p { margin: 0; } }</style>
				<style is:global>.page { color: red; } @scope (.page) to ([data-component]) { p { margin: 0; } }</style>
			`),
			defaults,
		);
		expect(model.sheets).toEqual([
			{ kind: "scoped", scopesLimits: true },
			{ kind: "plain", scopesLimits: false },
		]);
		expect(
			model.scopes.map((scope) => [scope.sheet, scope.limitIsComponents, scope.limitIsGlobalComponents]),
		).toEqual([
			[0, false, true],
			[1, true, false],
		]);
	});

	it("leaves a Vue scoped sheet's limits as written", () => {
		const parseHTML = html.parse;
		if (!parseHTML) throw new Error("postcss-html has no parser");
		const model = analyze(
			parseHTML(`<template><div></div></template>\n<style scoped>.card { color: red; }</style>`, {
				from: "/project/src/Card.vue",
			}),
			defaults,
		);
		expect(model.sheets).toEqual([{ kind: "scoped", scopesLimits: false }]);
	});
});
