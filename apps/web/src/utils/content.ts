import type { CollectionEntry } from "astro:content";
import readingTime from "reading-time";

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

export function getReadingTime(content = ""): ReturnType<typeof readingTime> {
	return readingTime(content);
}
