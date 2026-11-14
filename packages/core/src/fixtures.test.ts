import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { noUndeclaredStateVariables } from "./testing/no-undeclared-state-variables.js";
import { partsInScope } from "./testing/parts-in-scope.js";
import { summarize } from "./testing/summarize.js";
import { sourceFor, syntaxes } from "./testing/syntaxes.js";

// The whole components of the parts page and the methodology, each read as CSS, as SCSS and in a Vue file.
const folder = new URL("../fixtures/components/", import.meta.url);
const files = readdirSync(folder).filter((file) => file.endsWith(".css"));

describe("whole components", () => {
	it("are the four the pages show", () => {
		expect(files).toEqual(["button.css", "card.css", "field.css", "tabs.css"]);
	});

	for (const file of files) {
		const css = readFileSync(new URL(file, folder), "utf8");

		it(`${file} reads the same in every syntax`, () => {
			const [first, ...rest] = syntaxes.map((syntax) => {
				const model = sourceFor(syntax).read(css, { file });
				expect(model.unknowns).toEqual([]);
				return summarize(model);
			});
			for (const summary of rest) expect(summary).toBe(first);
			expect(first).toMatchSnapshot();
		});

		it(`${file} passes the two test-only checks`, () => {
			for (const syntax of syntaxes) {
				const model = sourceFor(syntax).read(css, { file });
				expect(partsInScope(model)).toEqual([]);
				expect(noUndeclaredStateVariables(model)).toEqual([]);
			}
		});
	}
});
