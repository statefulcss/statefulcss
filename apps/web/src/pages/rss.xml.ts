import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

import { siteConfig } from "@config/site";
import { comparePostsByDate, getBlogPostMeta } from "@utils/content";

export const GET: APIRoute = async (context) => {
	const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(comparePostsByDate);

	return rss({
		title: `${siteConfig.name} Blog`,
		description: "Articles and updates from Stateful CSS.",
		site: context.site ?? siteConfig.url,
		xmlns: {
			dc: "http://purl.org/dc/elements/1.1/",
		},
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			link: getBlogPostMeta(post).canonicalUrl,
			pubDate: post.data.publishedAt,
			categories: post.data.tags,
			customData: post.data.updatedAt ? `<dc:date>${post.data.updatedAt.toISOString()}</dc:date>` : undefined,
		})),
	});
};
