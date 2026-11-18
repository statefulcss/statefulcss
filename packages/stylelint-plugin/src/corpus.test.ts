// The fixture corpus: whole components that must pass both configs with no warning, and whole components with a
// mistake, whose first line names the rules they must fail. Each runs as plain CSS, SCSS and a `.vue` file's
// `<style>` block.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import compatible from "./configs/compatible.js";
import recommended from "./configs/recommended.js";
import { lint, sourceFor, syntaxes, temporaryProject } from "./testing/test-rule.js";

const configs = [
	["recommended", recommended],
	["compatible", compatible],
] as const;

/** Core's four whole components, which every rule must leave clean. */
const correct = fileURLToPath(new URL("../../core/fixtures/components", import.meta.url));
/** Components with a mistake, each one naming the rules it fails on its first line. */
const wrong = fileURLToPath(new URL("../fixtures/wrong", import.meta.url));

const read = (folder: string): (readonly [string, string])[] =>
	readdirSync(folder)
		.filter((file) => file.endsWith(".css"))
		.sort()
		.map((file) => [file, readFileSync(path.join(folder, file), "utf8")] as const);

/** The rules a wrong component's first line names: `/* Fails statefulcss/bind-once, …: why. *\/`. */
function failsOf(code: string): string[] {
	const names = /^\/\* Fails ([^:]+):/.exec(code)?.[1];
	if (!names) throw new Error("A wrong component's first line names the rules it fails");
	return names.split(", ").sort();
}

describe.each(configs)("the corpus under %s", (_name, config) => {
	const project = temporaryProject();

	describe.each(read(correct))("%s passes with no warning", (_file, code) => {
		it.each(syntaxes)("%s", async (syntax) => {
			const { warnings, invalid } = await lint(sourceFor(syntax, { code }), project(), config);
			expect(invalid).toEqual([]);
			expect(warnings.map((warning) => warning.text)).toEqual([]);
		});
	});

	describe.each(read(wrong))("%s fails with the rules it names, and no other", (_file, code) => {
		it.each(syntaxes)("%s", async (syntax) => {
			const { warnings, invalid } = await lint(sourceFor(syntax, { code }), project(), config);
			expect(invalid).toEqual([]);
			expect([...new Set(warnings.map((warning) => warning.rule))].sort()).toEqual(failsOf(code));
		});
	});

	it("has a wrong component for every rule over a stylesheet", () => {
		const named = new Set(read(wrong).flatMap(([, code]) => failsOf(code)));
		const rules = Object.keys(config.rules ?? {}).filter(
			(rule) => rule.startsWith("statefulcss/") && rule !== "statefulcss/config-check",
		);
		expect(rules.filter((rule) => !named.has(rule))).toEqual([]);
	});
});
