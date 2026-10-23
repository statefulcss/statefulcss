import path from "node:path";

import { describe, expect, it } from "vitest";

import { threwError } from "./messages.js";

// Most messages are tested through loadConfig. These are the ones Vitest can't produce, because Vite loads every
// module as ESM.
describe("threwError", () => {
	const file = path.join(process.cwd(), "statefulcss.config.ts");

	it.each(["Cannot use import statement outside a module", "Unexpected token 'export'"])(
		'explains "%s" in a CommonJS package',
		(message) => {
			expect(threwError(file, new SyntaxError(message)).message).toMatchSnapshot();
		},
	);

	it("adds nothing to other syntax errors", () => {
		expect(threwError(file, new SyntaxError("Unexpected end of input")).message).toBe(
			"Can't load statefulcss.config.ts, because it threw an error: Unexpected end of input.",
		);
	});
});
