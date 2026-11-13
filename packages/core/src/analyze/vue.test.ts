import { defaults } from "@statefulcss/config";
import html from "postcss-html";
import { describe, expect, it } from "vitest";

import { analyze } from "../index.js";

// Files with several <style> blocks exist only in Vue (and other single-file components), so these run once.
function readVue(styles: string): ReturnType<typeof analyze> {
	const parseHTML = html.parse;
	if (!parseHTML) throw new Error("postcss-html has no parser");
	const root = parseHTML(`<template><div></div></template>\n${styles}`, { from: "/project/src/Button.vue" });
	return analyze(root, defaults);
}

const byKey = (model: ReturnType<typeof analyze>) =>
	model.elements.map((element) => [element.key, element.blocks.map((block) => block.selector)]);

describe("Vue files with several <style> blocks", () => {
	it("reads plain blocks together as one stylesheet, and scoped blocks together as another", () => {
		const model = readVue(`
			<style>.button { color: red; }</style>
			<style scoped>.card { color: red; }</style>
			<style>.button:hover { color: blue; }</style>
			<style scoped>.card:hover { color: blue; }</style>
		`);
		expect(byKey(model)).toEqual([
			[".button", [".button", ".button:hover"]],
			[".card", [".card", ".card:hover"]],
		]);
	});

	it("never merges a plain block with a scoped one", () => {
		const model = readVue(`
			<style>.button { color: red; }</style>
			<style scoped>.button:hover { color: blue; }</style>
		`);
		expect(byKey(model)).toEqual([
			[".button", [".button"]],
			[".button", [".button:hover"]],
		]);
	});

	it("reads each module block on its own", () => {
		const model = readVue(`
			<style module>.root { & .icon { color: red; } }</style>
			<style module>.root { color: blue; }</style>
		`);
		expect(model.file.cssModule).toBe(true);
		expect(byKey(model)).toEqual([
			[".root", []],
			[".icon", [".root .icon"]],
			[".root", [".root"]],
		]);
	});
});
