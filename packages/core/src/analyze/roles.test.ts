import { describe, expect, it } from "vitest";

import { roleOf, rolePrefixes } from "./roles.js";

describe("a variable's role, from its name", () => {
	// Source: the methodology's "The six variable roles".
	it("is its prefix", () => {
		const rows: [name: string, role: string][] = [
			["--t-space-4", "token"],
			["--c-button-border-radius", "component"],
			["--s-color", "state"],
			["--p-icon-color", "part"],
			["--_gap", "private"],
			["--_icon-color-hover", "private"],
			["--q-tabs-blocked", "query"],
		];
		expect(rows.map(([name]) => roleOf(name))).toEqual(rows.map(([, role]) => role));
	});

	it("is none for a name with no prefix", () => {
		for (const name of ["--opacity", "--swiper-theme-color", "--tx", "--s", "--T-space", "--", "color", ""])
			expect(roleOf(name)).toBe("none");
	});

	// Source: the rules page, rule 1: "a prefix with no name".
	it("is still the prefix's role when no name follows it", () => {
		expect(roleOf("--t-")).toBe("token");
		expect(roleOf("--_")).toBe("private");
		expect(Object.values(rolePrefixes)).toEqual(["--t-", "--c-", "--s-", "--p-", "--_", "--q-"]);
	});
});
