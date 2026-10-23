import { defaults } from "@statefulcss/config";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";
import { analyze } from "./index.js";

describe("analyze", () => {
	it("returns an empty model", () => {
		const root = parse(".button { color: red; }");

		expect(analyze(root, defaults)).toEqual({ root, components: [], variables: [] });
	});
});
