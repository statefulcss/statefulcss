import { describe, expect, it } from "vitest";
import { defaults, loadConfig } from "./index.js";

describe("loadConfig", () => {
	it("returns the defaults when there is no config", async () => {
		await expect(loadConfig("src/components/button.css")).resolves.toEqual(defaults);
	});
});
