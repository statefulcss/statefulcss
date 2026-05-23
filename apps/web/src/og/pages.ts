import { getCollection } from "astro:content";

import { siteConfig } from "@config/site";
import {
	compareByOrderAndTitle,
	comparePostsByDate,
	docsSections,
	getBlogPostMeta,
	getDocsEntryMeta,
	type DocsSection,
} from "@utils/content";

import { getOgImagePath, type OgImageTemplateProps } from "./templates";

export interface OgImageDefinition extends OgImageTemplateProps {
	imagePath: string;
}

function defineOgImage(
	path: string,
	definition: OgImageTemplateProps,
	options: { index?: boolean } = {},
): OgImageDefinition {
	return {
		...definition,
		imagePath: getOgImagePath(path, options),
	};
}

export async function getOgImageDefinitions(): Promise<OgImageDefinition[]> {
	const [blogPosts, docsConcepts, docsArchitecture, docsTools] = await Promise.all([
		getCollection("blog", ({ data }) => !data.draft),
		getCollection("docsConcepts", ({ data }) => !data.draft),
		getCollection("docsArchitecture", ({ data }) => !data.draft),
		getCollection("docsTools", ({ data }) => !data.draft),
	]);

	const definitions: OgImageDefinition[] = [
		defineOgImage("/", { title: siteConfig.name, variant: "default" }, { index: true }),
		defineOgImage("/docs/", { title: "Docs", variant: "content" }, { index: true }),
		defineOgImage("/blog/", { title: "Blog", variant: "content" }, { index: true }),
		...Object.values(docsSections).map((section) =>
			defineOgImage(section.path, { title: section.title, variant: "content" }, { index: true }),
		),
	];

	const docsEntries = [
		{ section: "concepts" as DocsSection, entries: docsConcepts.sort(compareByOrderAndTitle) },
		{ section: "architecture" as DocsSection, entries: docsArchitecture.sort(compareByOrderAndTitle) },
		{ section: "tools" as DocsSection, entries: docsTools.sort(compareByOrderAndTitle) },
	];

	for (const group of docsEntries) {
		for (const entry of group.entries) {
			const meta = getDocsEntryMeta(group.section, entry);
			definitions.push(defineOgImage(meta.path, { title: entry.data.title, variant: "content" }));
		}
	}

	for (const post of blogPosts.sort(comparePostsByDate)) {
		const meta = getBlogPostMeta(post);
		definitions.push(defineOgImage(meta.path, { title: post.data.title, variant: "content" }));
	}

	return definitions;
}
