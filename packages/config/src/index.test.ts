import { describe, expect, expectTypeOf, it } from "vitest";

import {
	ConfigError,
	defaults,
	defineConfig,
	loadConfig,
	nonStatePseudoClasses,
	type Settings,
} from "./index.js";

describe("defineConfig", () => {
	it("returns the config it's given", () => {
		const config = { strict: true, layers: ["base", "components"] };
		expect(defineConfig(config)).toBe(config);
	});

	it("types every setting as optional", () => {
		defineConfig({});
		defineConfig({
			$schema: "./node_modules/@statefulcss/config/schema.json",
			themeAttribute: "data-theme",
			componentAttribute: "data-root",
			partAttribute: "data-piece",
			slotAttribute: "data-outlet",
		});
		// @ts-expect-error -- an unknown key
		defineConfig({ blockingState: [":disabled"] });
		// @ts-expect-error -- a list, not a string
		defineConfig({ blockingStates: ":disabled" });
	});
});

describe("Settings", () => {
	it("has every setting, read-only", () => {
		expectTypeOf<Settings["strict"]>().toEqualTypeOf<boolean>();
		expectTypeOf<Settings["layers"]>().toEqualTypeOf<readonly string[]>();
		expectTypeOf<Settings>().not.toHaveProperty("$schema");
	});
});

describe("exports", () => {
	it("has the loader, its error and the defaults", () => {
		expect(loadConfig).toBeTypeOf("function");
		expect(new ConfigError("unreadable", "message", { file: "statefulcss.config.json" })).toBeInstanceOf(
			Error,
		);
		expect(defaults.strict).toBe(false);
	});

	it("has the pseudo-classes that are never a state, for core, and they can't be changed", () => {
		expect(nonStatePseudoClasses).toEqual({
			matchesAny: [":is", ":where", ":matches", ":-webkit-any", ":-moz-any"],
			holders: [":not", ":has"],
			identity: [":root", ":scope", ":host", ":local"],
			wrappers: [":global", ":deep", ":slotted"],
			pseudoElements: [":before", ":after", ":first-line", ":first-letter"],
		});
		expect(Object.isFrozen(nonStatePseudoClasses)).toBe(true);
		expect(Object.values(nonStatePseudoClasses).every((names) => Object.isFrozen(names))).toBe(true);
	});
});
