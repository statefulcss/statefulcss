import { expect, test } from "@playwright/test";

import { missingRoute, routes, SITE_URL } from "./_fixtures";

test.describe("pages", () => {
	for (const route of routes) {
		test(`${route} responds with 200 and complete metadata`, async ({ page, request }) => {
			const response = await page.goto(route);
			expect(response?.status()).toBe(200);

			await expect(page).toHaveTitle(/\S/);
			await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S/);
			await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
				"href",
				new URL(route, SITE_URL).toString(),
			);
			await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index, follow/);

			const ogImage = page.locator('meta[property="og:image"]');
			if ((await ogImage.count()) > 0) {
				const ogPath = new URL((await ogImage.getAttribute("content")) ?? "").pathname;
				const ogResponse = await request.get(ogPath);
				expect(ogResponse.status(), `og:image at ${ogPath} should resolve`).toBe(200);
				expect(ogResponse.headers()["content-type"]).toMatch(/^image\/png/);
			}
		});
	}

	test("unknown paths serve the 404 page with a 404 status and noindex", async ({ page }) => {
		const response = await page.goto(missingRoute);

		expect(response?.status()).toBe(404);
		await expect(page).toHaveTitle(/Not Found/);
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
	});

	test("the footer links to the legal notice and privacy policy", async ({ page }) => {
		await page.goto("/");
		const footer = page.locator("footer");

		for (const [name, heading] of [
			["Legal Notice", "Legal Notice"],
			["Privacy Policy", "Privacy Policy"],
		]) {
			await footer.getByRole("link", { name }).click();
			await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
			await page.goBack();
		}
	});

	test("every internal link on every page resolves", async ({ page, request }) => {
		const links = new Set<string>();

		for (const route of routes) {
			await page.goto(route);
			const hrefs = await page
				.locator("a[href]")
				.evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
			for (const href of hrefs) {
				const url = new URL(href);
				if (url.origin === new URL(page.url()).origin) links.add(url.pathname);
			}
		}

		const broken: string[] = [];
		for (const path of links) {
			const response = await request.get(path);
			if (response.status() !== 200) broken.push(`${path} (${response.status()})`);
		}
		expect(broken, `broken internal links:\n${broken.join("\n")}`).toEqual([]);
	});
});
