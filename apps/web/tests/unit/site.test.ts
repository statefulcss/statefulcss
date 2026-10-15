import { afterEach, describe, expect, it, vi } from "vitest";

// site.ts reads the environment when it is imported, so each case imports a fresh copy.
async function loadSite(env: Record<string, string | undefined>) {
	vi.resetModules();
	for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
	return import("@config/site");
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("site config", () => {
	it("treats the default build as production", async () => {
		const site = await loadSite({ PUBLIC_SITE_URL: undefined });

		expect(site.getSiteUrl()).toBe("https://statefulcss.com");
		expect(site.isProductionSite).toBe(true);
	});

	it("treats the preview origin as non-production", async () => {
		const site = await loadSite({ PUBLIC_SITE_URL: "https://preview.statefulcss.com" });

		expect(site.getSiteUrl()).toBe("https://preview.statefulcss.com");
		expect(site.isProductionSite).toBe(false);
	});

	it("only exposes the analytics token in production", async () => {
		const production = await loadSite({
			PUBLIC_SITE_URL: "https://statefulcss.com",
			PUBLIC_CF_WEB_ANALYTICS_TOKEN: "token",
		});
		expect(production.webAnalyticsToken).toBe("token");

		const preview = await loadSite({
			PUBLIC_SITE_URL: "https://preview.statefulcss.com",
			PUBLIC_CF_WEB_ANALYTICS_TOKEN: "token",
		});
		expect(preview.webAnalyticsToken).toBeUndefined();
	});

	it("builds canonical URLs with a trailing slash and without query or hash", async () => {
		const site = await loadSite({ PUBLIC_SITE_URL: undefined });

		expect(site.toCanonicalUrl("/docs")).toBe("https://statefulcss.com/docs/");
		expect(site.toCanonicalUrl("/docs/?ref=x#intro")).toBe("https://statefulcss.com/docs/");
		expect(site.toCanonicalUrl("/rss.xml")).toBe("https://statefulcss.com/rss.xml");
	});
});
