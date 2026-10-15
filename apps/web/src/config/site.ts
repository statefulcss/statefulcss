export type JsonLdSchema = Record<string, unknown>;

export const siteConfig = {
	name: "Stateful CSS",
	titleTemplate: "%s | Stateful CSS",
	description: "The official website of Stateful CSS.",
	url: "https://statefulcss.com",
	locale: "en_US",
	language: "en",
	author: {
		name: "Stateful CSS",
		url: "https://statefulcss.com",
	},
	themeColor: "#0a0a0a",
	robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
	rssPath: "/rss.xml",
	sitemapPath: "/sitemap-index.xml",
} as const;

const fileExtensionPattern = /\.[a-z0-9]+$/i;

export function getSiteUrl(): string {
	return new URL(process.env.PUBLIC_SITE_URL ?? siteConfig.url).origin;
}

/** False for preview and other non-production deployments, which should stay out of search results. */
export const isProductionSite = getSiteUrl() === new URL(siteConfig.url).origin;

/** Only set in the production deploy (GitHub `web-production` environment), so previews, local builds, and forks don't report. */
export const webAnalyticsToken = isProductionSite ? process.env.PUBLIC_CF_WEB_ANALYTICS_TOKEN : undefined;

export function formatPageTitle(title?: string): string {
	if (!title || title === siteConfig.name) {
		return siteConfig.name;
	}

	return siteConfig.titleTemplate.replace("%s", title);
}

export function toAbsoluteUrl(pathOrUrl: string | URL): URL {
	return new URL(pathOrUrl, getSiteUrl());
}

export function toCanonicalUrl(pathOrUrl: string | URL): string {
	const url = toAbsoluteUrl(pathOrUrl);

	if (url.pathname !== "/" && !url.pathname.endsWith("/") && !fileExtensionPattern.test(url.pathname)) {
		url.pathname = `${url.pathname}/`;
	}

	url.hash = "";
	url.search = "";

	return url.toString();
}
