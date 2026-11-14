import { defaults } from "@statefulcss/config";
import { describe, expect } from "vitest";

import { inEverySyntax } from "../testing/syntaxes.js";

describe("the model", () => {
	inEverySyntax("keeps the tree and the settings it was read with", ({ parse, read }) => {
		const model = read(".button { color: red; }");
		expect(model.root.type).toBe(parse(".button { color: red; }").type);
		expect(model.settings).toBe(defaults);
	});

	inEverySyntax("a plain file isn't a CSS Module", ({ read }) => {
		const model = read(".root { color: red; }");
		expect(model.file.cssModule).toBe(false);
		expect(model.sheets).toEqual([{ kind: "plain" }]);
	});

	inEverySyntax("a CSS Module is one", ({ read }) => {
		const model = read(".root { color: red; }", { module: true });
		expect(model.file.cssModule).toBe(true);
		expect(model.sheets).toEqual([{ kind: "module" }]);
	});

	inEverySyntax("at-rules that don't style elements", ({ read }) => {
		const model = read("@layer base, components; @keyframes --spin { to { rotate: 1turn; } }");
		expect(model.atRules.map((atRule) => [atRule.name, atRule.node.type])).toEqual([
			["layer", "atrule"],
			["keyframes", "atrule"],
		]);
	});

	inEverySyntax("is JSON once the PostCSS nodes are dropped", ({ read }) => {
		const model = read("@import 'reset.css'; @include reset; .card { color: red; }");
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the tree is the one field that isn't data
		const { root, ...data } = model;
		const json = JSON.stringify(data, (key, value: unknown) => (key === "node" ? undefined : value));
		expect(JSON.parse(json)).toMatchObject({
			sheets: [{ kind: "plain" }],
			atRules: [{ name: "import" }],
			unknowns: [{ reason: "unknown-at-rule", detail: "@include", elements: [] }],
		});
	});
});
