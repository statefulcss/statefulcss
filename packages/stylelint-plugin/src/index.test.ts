import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import compatible from "./configs/compatible.js";
import recommended from "./configs/recommended.js";

describe("configs", () => {
	it.each([
		["recommended", recommended],
		["compatible", compatible],
	])("%s lints a stylesheet", async (_name, config) => {
		const { results } = await stylelint.lint({ code: ".button { color: red; }", config });

		expect(results[0]?.warnings).toEqual([]);
	});
});
