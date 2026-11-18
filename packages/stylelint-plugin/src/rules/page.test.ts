import { describe, expect, it } from "vitest";

import { isPage } from "./page.js";

describe("isPage", () => {
	it("reads the document element in any form as the page", () => {
		for (const selector of [
			":root",
			"html",
			"HTML",
			':root[data-color-scheme="dark"]',
			"html.dark",
			".dark:root",
			"[data-theme]:root:hover",
		])
			expect(isPage(selector), selector).toBe(true);
	});

	it("leaves out its pseudo-elements, other elements and lists", () => {
		for (const selector of [
			"html::before",
			":root::after",
			"html:before",
			":root .card",
			"html > body",
			":root, .card",
			":not(:root)",
			":is(:root)",
			"htmlx",
			":root-ish",
			'[data-x=":root"]',
			".card",
		])
			expect(isPage(selector), selector).toBe(false);
	});
});
