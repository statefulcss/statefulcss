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

	it("takes the theme attribute from the settings, in lower case", () => {
		expect(namesFrom({ ...defaults, themeAttribute: "Data-Brand" }).themeAttribute).toBe("data-brand");
	});
});
