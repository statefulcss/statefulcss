import rss from "@astrojs/rss";
import type { APIRoute } from "astro";

import { siteConfig, toCanonicalUrl } from "@config/site";
import { getChangelog } from "@utils/content";

export const GET: APIRoute = async (context) => {
	const entries = await getChangelog();

	return rss({
		title: `${siteConfig.name} Changelog`,
		description: `Changes to ${siteConfig.name}: the methodology, the lint rules and the packages.`,
		site: context.site ?? siteConfig.url,
		items: entries.map((entry) => ({
			title: entry.data.title,
			link: `${toCanonicalUrl("/changelog/")}#${entry.id}`,
			pubDate: entry.data.date,
			categories: entry.data.tags,
		})),
	});
};
