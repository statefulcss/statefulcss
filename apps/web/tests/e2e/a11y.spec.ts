import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { missingRoute, routes } from "./_fixtures";

// Automated checks catch a subset of issues; they don't replace keyboard and zoom testing.
test.describe("accessibility", () => {
	for (const route of [...routes, missingRoute]) {
		test(`${route} has no critical or serious axe violations`, async ({ page }) => {
			await page.goto(route);
			const results = await new AxeBuilder({ page })
				.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
				.analyze();

			const blocking = results.violations.filter(
				(violation) => violation.impact === "critical" || violation.impact === "serious",
			);
			expect(blocking, formatViolations(blocking)).toEqual([]);
		});
	}
});

function formatViolations(violations: { id: string; description: string; nodes: { target: unknown }[] }[]) {
	if (violations.length === 0) return undefined;
	return violations
		.map(
			(v) =>
				`${v.id} (${v.description})\n  nodes: ${v.nodes.map((n) => JSON.stringify(n.target)).join(", ")}`,
		)
		.join("\n\n");
}
