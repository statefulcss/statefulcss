import { expect, test } from "@playwright/test";

import { routes, SITE_URL } from "./_fixtures";

test.describe("crawler files", () => {
	test("robots.txt allows crawling and points to the sitemap", async ({ request }) => {
		const response = await request.get("/robots.txt");
		const body = await response.text();

		expect(response.status()).toBe(200);
		expect(body).toContain("Allow: /");
		expect(body).toContain(`Sitemap: ${SITE_URL}/sitemap-index.xml`);
	});

	test("the sitemap lists public pages only", async () => {
		expect(routes).toEqual(
			expect.arrayContaining(["/docs/", "/changelog/", "/legal-notice/", "/privacy-policy/"]),
		);
		for (const route of routes) {
			expect(route, "404 and dev-only pages stay out of the sitemap").not.toMatch(/404|og-preview/);
		}
	});

	test("the sitemap index references the sitemap", async ({ request }) => {
		const response = await request.get("/sitemap-index.xml");

		expect(response.status()).toBe(200);
		expect(await response.text()).toContain(`${SITE_URL}/sitemap-0.xml`);
	});

	test("the RSS feed is valid XML with absolute item links", async ({ page, request }) => {
		const response = await request.get("/changelog/rss.xml");
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toMatch(/xml/);

		const xml = await response.text();
		const parsed = await page.evaluate((source) => {
			const document = new DOMParser().parseFromString(source, "application/xml");
			return {
				error: document.querySelector("parsererror")?.textContent ?? null,
				links: Array.from(document.querySelectorAll("item > link"), (link) => link.textContent ?? ""),
			};
		}, xml);

		expect(parsed.error).toBeNull();
		// The Changelog may have no entries yet; every entry it has links absolutely.
		for (const link of parsed.links) expect(link).toMatch(new RegExp(`^${SITE_URL}/`));
	});
});
