import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

import { siteConfig } from "@config/site";
import { comparePostsByDate, getBlogPostPath } from "@utils/content";

export const GET: APIRoute = async (context) => {
	const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(comparePostsByDate);

	return rss({
		title: `${siteConfig.name} Blog`,
		description: "Articles and updates from Stateful CSS.",
		site: context.site ?? siteConfig.url,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			link: getBlogPostPath(post),
			pubDate: post.data.publishedAt,
		})),
	});
};
