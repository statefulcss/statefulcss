import { describe, expect, it } from "vitest";

import { jsonSchema } from "./json-schema.js";
import { configSchema, defaults } from "./schema.js";

const settingKeys = Object.keys(configSchema.shape).filter((key) => key !== "$schema");

describe("defaults", () => {
	it("has the default of every setting", () => {
		expect(defaults).toEqual({
			themeAttribute: "data-theme",
			themeFiles: ["**/styles/themes/**"],
			baseTheme: "base",
			blockingStates: [":disabled", '[aria-disabled="true"]', "[data-loading]", "[inert]"],
			interactionStates: [":hover", ":focus", ":focus-visible", ":focus-within", ":active"],
			stateAttributes: [],
			layers: ["base", "themes", "components", "utilities"],
			strict: false,
			ignoreLayers: [],
		});
	});

	it("can't be changed", () => {
		expect(Object.isFrozen(defaults)).toBe(true);
		expect(Object.isFrozen(defaults.layers)).toBe(true);
	});
});

describe("configSchema", () => {
	it("fills in the defaults for an empty config", () => {
		expect(configSchema.parse({})).toEqual(defaults);
	});

	it("keeps the values a config sets", () => {
		expect(
			configSchema.parse({ $schema: "./schema.json", strict: true, stateAttributes: ["data-state"] }),
		).toEqual({
			...defaults,
			$schema: "./schema.json",
			strict: true,
			stateAttributes: ["data-state"],
		});
	});

	it("gives each parse its own lists", () => {
		const first = configSchema.parse({});
		first.layers.push("reset");
		expect(configSchema.parse({}).layers).toEqual(defaults.layers);
	});

	it("rejects an unknown key", () => {
		expect(configSchema.safeParse({ blockingState: [":disabled"] }).success).toBe(false);
	});

	it("rejects a value of the wrong type", () => {
		expect(configSchema.safeParse({ blockingStates: ":disabled" }).success).toBe(false);
		expect(configSchema.safeParse({ themeFiles: [""] }).success).toBe(false);
	});

	it.each(settingKeys)("describes %s, with what it expects and a valid example", (key) => {
		const setting = configSchema.shape[key as keyof typeof configSchema.shape];
		const meta = setting.meta();
		expect(meta?.description).toMatch(/^[^\n]+\.$/);
		expect(meta?.expected).toMatch(/^(a|an|true) /);
		expect(meta?.examples).toHaveLength(1);
		for (const example of meta?.examples as unknown[]) {
			expect(setting.safeParse(example).success).toBe(true);
		}
	});
});

describe("jsonSchema", () => {
	it("has every setting, with its default", () => {
		const properties = jsonSchema.properties as Record<string, { default?: unknown }>;
		expect(Object.keys(properties)).toEqual(["$schema", ...settingKeys]);
		for (const key of settingKeys) {
			expect(properties[key]?.default).toEqual(defaults[key as keyof typeof defaults]);
		}
	});

	it("leaves out what's only for error messages", () => {
		expect(JSON.stringify(jsonSchema)).not.toContain('"expected"');
	});

	it("allows no other keys and requires none", () => {
		expect(jsonSchema.additionalProperties).toBe(false);
		expect(jsonSchema.required).toBeUndefined();
	});

	it("matches the snapshot", () => {
		expect(jsonSchema).toMatchSnapshot();
	});
});
