import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import plugin from "../../index.js";

const { lint } = stylelint;

const config: stylelint.Config = {
	plugins: plugin,
	rules: {
		"statefulcss/no-theme-token-reassign": true,
	},
};

describe("statefulcss/no-theme-token-reassign", () => {
	it("should report an error when a --t-* custom property is declared", async () => {
		const result = await lint({
			code: ":root { --t-color-primary: red; }",
			config,
		});

		expect(result.results[0]?.warnings).toHaveLength(1);
		expect(result.results[0]?.warnings[0]?.rule).toBe("statefulcss/no-theme-token-reassign");
		expect(result.results[0]?.warnings[0]?.text).toContain("--t-color-primary");
	});

	it("should report an error when --t-* is used in a regular selector", async () => {
		const result = await lint({
			code: ".card { --t-spacing: 8px; }",
			config,
		});

		expect(result.results[0]?.warnings).toHaveLength(1);
	});

	it("should not report an error for non --t-* custom properties", async () => {
		const result = await lint({
			code: ":root { --color-primary: red; --my-spacing: 8px; }",
			config,
		});

		expect(result.results[0]?.warnings).toHaveLength(0);
	});

	it("should not report an error when using var(--t-*) references", async () => {
		const result = await lint({
			code: "a { color: var(--t-color-primary); }",
			config,
		});

		expect(result.results[0]?.warnings).toHaveLength(0);
	});

	it("should report multiple errors for multiple --t-* declarations", async () => {
		const result = await lint({
			code: ":root { --t-color-primary: red; --t-color-secondary: blue; --t-spacing: 4px; }",
			config,
		});

		expect(result.results[0]?.warnings).toHaveLength(3);
	});

	it("should do nothing when the rule is disabled", async () => {
		const result = await lint({
			code: ":root { --t-color-primary: red; }",
			config: {
				plugins: plugin,
				rules: {
					"statefulcss/no-theme-token-reassign": null,
				},
			},
		});

		expect(result.results[0]?.warnings).toHaveLength(0);
	});
});
