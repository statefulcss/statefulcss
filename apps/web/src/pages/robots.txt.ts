import type { APIRoute } from "astro";

import { isProductionSite, siteConfig, toAbsoluteUrl } from "@config/site";

export const GET: APIRoute = () => {
	const body = [
		"User-agent: *",
		isProductionSite ? "Allow: /" : "Disallow: /",
		"",
		`Sitemap: ${toAbsoluteUrl(siteConfig.sitemapPath).href}`,
		"",
	].join("\n");

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
};
