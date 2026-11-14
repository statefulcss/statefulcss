import { defaults } from "@statefulcss/config";
import { describe, expect, it } from "vitest";

import { namesFrom } from "./names.js";

describe("the names core reads a stylesheet with", () => {
	it("has a default for every name", () => {
		expect(namesFrom(defaults)).toEqual({
			componentAttribute: "data-component",
			partAttribute: "data-part",
			slotAttribute: "data-slot",
			themeAttribute: "data-theme",
			colorSchemeAttribute: "data-color-scheme",
			utilitiesLayer: "utilities",
		});
	});

	it("takes the four attributes from the settings, in lower case", () => {
		const names = namesFrom({
			...defaults,
			componentAttribute: "data-widget",
			partAttribute: "Data-Area",
			slotAttribute: "data-place",
			themeAttribute: "Data-Brand",
		});
		expect(names).toMatchObject({
			componentAttribute: "data-widget",
			partAttribute: "data-area",
			slotAttribute: "data-place",
			themeAttribute: "data-brand",
		});
	});

	it("keeps the color-scheme attribute and the utilities layer as core's own", () => {
		const names = namesFrom({ ...defaults, componentAttribute: "data-widget" });
		expect([names.colorSchemeAttribute, names.utilitiesLayer]).toEqual(["data-color-scheme", "utilities"]);
	});
});
