import type { CollectionEntry } from "astro:content";
import readingTime from "reading-time";

import { formatPageTitle, siteConfig, toCanonicalUrl, type JsonLdSchema } from "@config/site";

export const docsSections = {
	concepts: {
		collection: "docsConcepts",
		description: "Core ideas and mental models for Stateful CSS.",
		path: "/docs/concepts/",
		title: "Concepts",
	},
	architecture: {
		collection: "docsArchitecture",
		description: "How to architect Stateful CSS components.",
		path: "/docs/architecture/",
		title: "Architecture",
	},
	tools: {
		collection: "docsTools",
		description: "Tools and workflows for building with Stateful CSS.",
		path: "/docs/tools/",
		title: "Tools",
	},
} as const;

export type DocsSection = keyof typeof docsSections;
export type DocsCollectionName = (typeof docsSections)[DocsSection]["collection"];
export type DocsEntry =
	| CollectionEntry<"docsArchitecture">
	| CollectionEntry<"docsConcepts">
	| CollectionEntry<"docsTools">;

export function compareByOrderAndTitle<T extends DocsEntry>(a: T, b: T): number {
	return a.data.order - b.data.order || a.data.title.localeCompare(b.data.title);
}

export function comparePostsByDate(a: CollectionEntry<"blog">, b: CollectionEntry<"blog">): number {
	return b.data.publishedAt.getTime() - a.data.publishedAt.getTime();
}

export function getDocsEntryPath(section: DocsSection, entry: DocsEntry): string {
	return `${docsSections[section].path}${entry.id}/`;
}

export function getBlogPostPath(entry: CollectionEntry<"blog">): string {
	return `/blog/${entry.id}/`;
}

export function getEntryCanonicalUrl(fallbackPath: string, canonical?: string): string {
	return toCanonicalUrl(canonical ?? fallbackPath);
}

export function getEntryModifiedDate(updatedAt?: Date, fallback?: Date): Date | undefined {
	return updatedAt ?? fallback;
}

export function getReadingTime(content = ""): ReturnType<typeof readingTime> {
	return readingTime(content);
}

export function getCollectionPageSchema(path: string, title: string, description: string): JsonLdSchema {
	const canonicalUrl = getEntryCanonicalUrl(path);

	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		"@id": `${canonicalUrl}#collection`,
		url: canonicalUrl,
		name: formatPageTitle(title),
		description,
		inLanguage: siteConfig.language,
		isPartOf: {
			"@id": `${siteConfig.url}/#website`,
		},
	};
}

function getBreadcrumbListSchema(
	canonicalUrl: string,
	items: Array<{ name: string; path: string }>,
): JsonLdSchema {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		"@id": `${canonicalUrl}#breadcrumb`,
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: getEntryCanonicalUrl(item.path),
		})),
	};
}

export function getBlogPostMeta(post: CollectionEntry<"blog">): {
	canonicalUrl: string;
	modifiedDate: Date;
	path: string;
	schema: JsonLdSchema[];
} {
	const path = getBlogPostPath(post);
	const canonicalUrl = getEntryCanonicalUrl(path, post.data.canonical);
	const modifiedDate =
		getEntryModifiedDate(post.data.updatedAt, post.data.publishedAt) ?? post.data.publishedAt;

	return {
		path,
		canonicalUrl,
		modifiedDate,
		schema: [
			{
				"@context": "https://schema.org",
				"@type": "BlogPosting",
				"@id": `${canonicalUrl}#blogposting`,
				mainEntityOfPage: {
					"@id": `${canonicalUrl}#webpage`,
				},
				headline: post.data.title,
				description: post.data.description,
				url: canonicalUrl,
				datePublished: post.data.publishedAt,
				dateModified: modifiedDate,
				...(post.data.tags.length ? { keywords: post.data.tags } : {}),
				inLanguage: siteConfig.language,
				author: {
					"@id": `${siteConfig.url}/#organization`,
				},
				publisher: {
					"@id": `${siteConfig.url}/#organization`,
				},
			},
			getBreadcrumbListSchema(canonicalUrl, [
				{ name: siteConfig.name, path: "/" },
				{ name: "Blog", path: "/blog/" },
				{ name: post.data.title, path },
			]),
		],
	};
}

export function getDocsEntryMeta(
	section: DocsSection,
	entry: DocsEntry,
): {
	canonicalUrl: string;
	modifiedDate?: Date;
	path: string;
	schema: JsonLdSchema[];
} {
	const path = getDocsEntryPath(section, entry);
	const sectionConfig = docsSections[section];
	const canonicalUrl = getEntryCanonicalUrl(path, entry.data.canonical);
	const modifiedDate = getEntryModifiedDate(entry.data.updatedAt);

	return {
		path,
		canonicalUrl,
		modifiedDate,
		schema: [
			{
				"@context": "https://schema.org",
				"@type": "TechArticle",
				"@id": `${canonicalUrl}#techarticle`,
				mainEntityOfPage: {
					"@id": `${canonicalUrl}#webpage`,
				},
				headline: entry.data.title,
				description: entry.data.description,
				url: canonicalUrl,
				...(modifiedDate ? { dateModified: modifiedDate } : {}),
				...(entry.data.tags.length ? { keywords: entry.data.tags } : {}),
				inLanguage: siteConfig.language,
				author: {
					"@id": `${siteConfig.url}/#organization`,
				},
				publisher: {
					"@id": `${siteConfig.url}/#organization`,
				},
			},
			getBreadcrumbListSchema(canonicalUrl, [
				{ name: siteConfig.name, path: "/" },
				{ name: "Docs", path: "/docs/" },
				{ name: sectionConfig.title, path: sectionConfig.path },
				{ name: entry.data.title, path },
			]),
		],
	};
}
