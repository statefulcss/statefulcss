import { expect, test } from "@playwright/test";

import { knownIssues, missingRoute, routes } from "./_fixtures";

test.describe("page structure", () => {
	for (const route of [...routes, missingRoute]) {
		test(`${route} has exactly one main landmark`, async ({ page }) => {
			test.fixme(knownIssues.nestedMain(route), "nested <main> (audit WEB-03), fix in the redesign");
			await page.goto(route);

			await expect(page.locator("main")).toHaveCount(1);
		});

		test(`${route} has exactly one h1`, async ({ page }) => {
			test.fixme(knownIssues.missingH1(route), "missing <h1> (audit WEB-03), fix in the redesign");
			await page.goto(route);

			await expect(page.locator("h1")).toHaveCount(1);
		});
	}

	test.describe("on a phone-sized viewport", () => {
		test.use({ viewport: { width: 375, height: 812 } });

		for (const route of routes) {
			test(`${route} does not scroll horizontally`, async ({ page }) => {
				test.fixme(
					knownIssues.phoneOverflow,
					"header navigation overflows (audit WEB-02), fix in the redesign",
				);
				await page.goto(route);

				const { scrollWidth, clientWidth } = await page.evaluate(() => ({
					scrollWidth: document.documentElement.scrollWidth,
					clientWidth: document.documentElement.clientWidth,
				}));
				expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
			});
		}
	});
});
