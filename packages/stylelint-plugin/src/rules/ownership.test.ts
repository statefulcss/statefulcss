import { defaults } from "@statefulcss/config";
import { analyze, type Model } from "@statefulcss/core";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

import { ownershipOf } from "./ownership.js";

const modelOf = (css: string): Model => analyze(postcss.parse(css), defaults);

const css = `
	.card { color: red; }
	@scope (.card) to ([data-component]) {
		[data-part="tab"] { --_icon-color: inherit; &::after { color: var(--_icon-color); } }
	}
`;

function elementOf(model: Model, key: string): number {
	const element = model.elements.find((one) => one.key.endsWith(key));
	if (!element) throw new Error(`No element "${key}"`);
	return element.id;
}

describe("ownershipOf", () => {
	it("decides once for each model, and anew for another", () => {
		const model = modelOf(css);
		expect(ownershipOf(model)).toBe(ownershipOf(model));
		expect(ownershipOf(modelOf(css))).not.toBe(ownershipOf(model));
	});

	it("chooses the owner from the reader and the name", () => {
		const model = modelOf(css);
		const ownership = ownershipOf(model);
		const root = elementOf(model, ".card");
		const tab = elementOf(model, '[data-part="tab"]');
		const after = elementOf(model, '[data-part="tab"]::after');
		expect(ownership.owners(after)).toEqual([tab, root]);
		expect(ownership.owner(after, "--p-after-color", "part")).toBe(tab);
		expect(ownership.owner(after, "--p-tab-after-color", "part")).toBe(root);
		expect(ownership.owner(after, "--_other", "private")).toBeUndefined();
		expect(ownership.owner(after, "--p-other", "part")).toBe(tab);
	});

	it("follows an inherit to the variable that supplies the value", () => {
		const model = modelOf(`
			.card { --_icon-color: red; }
			@scope (.card) to ([data-component]) {
				[data-part="icon"] { --_icon-color: inherit; &::after { color: var(--_icon-color); } }
			}
		`);
		const ownership = ownershipOf(model);
		const root = elementOf(model, ".card");
		const icon = elementOf(model, '[data-part="icon"]');
		const supplied = ownership.variable(root, "--_icon-color");
		const forwarded = ownership.variable(icon, "--_icon-color");
		if (!supplied || !forwarded) throw new Error("No variable");
		expect(ownership.supplier(forwarded)).toBe(supplied);
		expect(ownership.supplier(supplied)).toBe(supplied);
		expect(ownership.consumers(supplied).map((one) => one.element)).toEqual([
			elementOf(model, '[data-part="icon"]::after'),
			icon,
		]);
		expect(ownership.consumers(forwarded)).toEqual([]);
	});

	it("gives no supplier to an inherit no owner declares", () => {
		const model = modelOf(css);
		const ownership = ownershipOf(model);
		const forwarded = ownership.variable(elementOf(model, '[data-part="tab"]'), "--_icon-color");
		if (!forwarded) throw new Error("No variable");
		expect(ownership.supplier(forwarded)).toBeUndefined();
		expect(ownership.taken(forwarded)).toBeUndefined();
	});
});
