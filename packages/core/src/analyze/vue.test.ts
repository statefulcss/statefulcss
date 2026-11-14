import { defaults } from "@statefulcss/config";
import html from "postcss-html";
import { describe, expect, it } from "vitest";

import { analyze } from "../index.js";
import { complexToString } from "./selectors.js";
import { walk } from "./walk.js";

// Files with several <style> blocks exist only in Vue (and other single-file components), so these run once.
function parseVue(styles: string) {
	const parseHTML = html.parse;
	if (!parseHTML) throw new Error("postcss-html has no parser");
	return parseHTML(`<template><div></div></template>\n${styles}`, { from: "/project/src/Button.vue" });
}

const blocksBySheet = (styles: string) => {
	const walked = walk(parseVue(styles));
	return {
		sheets: walked.sheets,
		blocks: walked.blocks.map((block) => [complexToString(block.selector), block.sheet]),
	};
};

describe("Vue files with several <style> blocks", () => {
	it("reads plain blocks together as one stylesheet, and scoped blocks together as another", () => {
		expect(
			blocksBySheet(`
				<style>.button { color: red; }</style>
				<style scoped>.card { color: red; }</style>
				<style>.button:hover { color: blue; }</style>
				<style scoped>.card:hover { color: blue; }</style>
			`),
		).toEqual({
			sheets: ["plain", "scoped"],
			blocks: [
				[".button", 0],
				[".card", 1],
				[".button:hover", 0],
				[".card:hover", 1],
			],
		});
	});

	it("never puts a plain block with a scoped one", () => {
		expect(
			blocksBySheet(`
				<style>.button { color: red; }</style>
				<style scoped>.button:hover { color: blue; }</style>
			`).blocks,
		).toEqual([
			[".button", 0],
			[".button:hover", 1],
		]);
	});

	it("reads each module block on its own", () => {
		expect(
			blocksBySheet(`
				<style module>.root { color: red; }</style>
				<style module>.root { color: blue; }</style>
			`),
		).toEqual({
			sheets: ["module", "module"],
			blocks: [
				[".root", 0],
				[".root", 1],
			],
		});
	});

	it("numbers scopes and doc comments by their sheet", () => {
		const walked = walk(
			parseVue(`
				<style>/** Card */ .card { color: red; }</style>
				<style scoped>@scope (.card) to ([data-component]) { [data-part="title"] { color: red; } }</style>
			`),
		);
		expect(walked.docComments.map((comment) => comment.sheet)).toEqual([0]);
		expect(walked.scopes.map((scope) => scope.sheet)).toEqual([1]);
	});

	it("says in the model which sheets a file has", () => {
		const model = analyze(
			parseVue("<style>.button { color: red; }</style><style module>.root { color: red; }</style>"),
			defaults,
		);
		expect(model.sheets).toEqual([{ kind: "plain" }, { kind: "module" }]);
		expect(model.file).toEqual({ path: "/project/src/Button.vue", cssModule: true });
	});
});
