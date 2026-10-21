import { expect, test } from "@playwright/test";

// Headers come from public/_headers, applied by Cloudflare (and by `wrangler dev` locally).
const securityHeaders = {
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
	"referrer-policy": "strict-origin-when-cross-origin",
	"cross-origin-opener-policy": "same-origin",
};

test.describe("response headers", () => {
	for (const path of ["/", "/docs/", "/robots.txt"]) {
		test(`${path} sends the security headers`, async ({ request }) => {
			const headers = (await request.get(path)).headers();

			for (const [name, value] of Object.entries(securityHeaders)) expect(headers[name], name).toBe(value);
			expect(headers["permissions-policy"]).toContain("camera=()");
		});
	}

	test("fingerprinted assets are cached immutably", async ({ page, request }) => {
		await page.goto("/");
		const stylesheet = await page
			.locator('link[rel="stylesheet"][href^="/_astro/"]')
			.first()
			.getAttribute("href");
		expect(stylesheet).toBeTruthy();

		const headers = (await request.get(stylesheet ?? "")).headers();
		expect(headers["cache-control"]).toBe("public, max-age=31536000, immutable");
	});

	test("OG images are cached for a day", async ({ request }) => {
		const headers = (await request.get("/og/index.png")).headers();

		expect(headers["cache-control"]).toBe("public, max-age=86400");
	});

	test("HTML is revalidated on every request", async ({ request }) => {
		const headers = (await request.get("/")).headers();

		expect(headers["cache-control"]).not.toContain("immutable");
	});
});
