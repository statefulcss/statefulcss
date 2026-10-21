import type { APIContext } from "astro";
import { afterEach, describe, expect, it, vi } from "vitest";

async function renderRobots(siteUrl: string | undefined) {
	vi.resetModules();
	vi.stubEnv("PUBLIC_SITE_URL", siteUrl);
	const { GET } = await import("../../src/pages/robots.txt");
	const response = await GET({} as APIContext);
	return { response, body: await response.text() };
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("robots.txt", () => {
	it("allows crawling in production", async () => {
		const { response, body } = await renderRobots(undefined);

		expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
		expect(body).toContain("Allow: /");
		expect(body).toContain("Sitemap: https://statefulcss.com/sitemap-index.xml");
	});

	it("blocks crawling on preview deployments", async () => {
		const { body } = await renderRobots("https://preview.statefulcss.com");

		expect(body).toContain("Disallow: /");
		expect(body).not.toContain("Allow: /\n");
		expect(body).toContain("Sitemap: https://preview.statefulcss.com/sitemap-index.xml");
	});
});
