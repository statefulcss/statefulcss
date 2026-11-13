import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readerFor, syntaxes } from "./testing/syntaxes.js";
import { summarize } from "./testing/summarize.js";

const folder = new URL("../fixtures/components/", import.meta.url);
const files = readdirSync(folder).filter((file) => file.endsWith(".css"));

describe("fixture components", () => {
	for (const file of files) {
		it(`${file} reads the same in every syntax`, () => {
			const css = readFileSync(new URL(file, folder), "utf8");
			const [first, ...rest] = syntaxes.map((syntax) => {
				const model = readerFor(syntax)(css, { file });
				expect(model.unknowns).toEqual([]);
				return summarize(model);
			});
			for (const summary of rest) expect(summary).toBe(first);
			expect(first).toMatchSnapshot();
		});
	}
});
