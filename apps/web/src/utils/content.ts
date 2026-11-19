import { getCollection, type CollectionEntry } from "astro:content";

import { sidebar } from "@config/sidebar";
import {
	formatPageTitle,
	getSiteUrl,
	isProductionSite,
	siteConfig,
	toCanonicalUrl,
	type JsonLdSchema,
} from "@config/site";

export type DocsEntry = CollectionEntry<"docs">;
export type ChangelogEntry = CollectionEntry<"changelog">;

/** The page /docs/ shows. */
const DOCS_HOME = "introduction";

/** Drafts are built and linked everywhere but production. */
export const showDrafts = !isProductionSite;

export interface SidebarItem {
	id: string;
	title: string;
	/** Missing for a draft that isn't built. */
	href?: string;
	draft: boolean;
	current: boolean;
}

export interface SidebarSection {
	label?: string;
	items: SidebarItem[];
}

export function getDocsPath(id: string): string {
	return id === DOCS_HOME ? "/docs/" : `/docs/${id}/`;
}

export function isBuilt(entry: DocsEntry): boolean {
	return entry.data.status === "published" || showDrafts;
}

/** Every docs page, drafts included. */
export async function getDocs(): Promise<DocsEntry[]> {
	return getCollection("docs");
}

/** The sidebar's sections, with only the pages that have a file, and only the sections with a page. */
export function getSidebar(entries: DocsEntry[], currentId?: string): SidebarSection[] {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));

	return sidebar
		.map((group) => ({
			label: group.label,
			items: group.pages.flatMap((id): SidebarItem[] => {
				const entry = byId.get(id);
				if (!entry) return [];
				return [
					{
						id,
						title: entry.data.title,
						href: isBuilt(entry) ? getDocsPath(id) : undefined,
						draft: entry.data.status === "draft",
						current: id === currentId,
					},
				];
			}),
		}))
		.filter((section) => section.items.length > 0);
}

/** The linked pages before and after the current one, in sidebar order. */
export function getPager(sections: SidebarSection[]): { previous?: SidebarItem; next?: SidebarItem } {
	const linked = sections.flatMap((section) => section.items).filter((item) => item.href || item.current);
	const index = linked.findIndex((item) => item.current);
	if (index === -1) return {};
	return { previous: linked[index - 1], next: linked[index + 1] };
}

export async function getChangelog(): Promise<ChangelogEntry[]> {
	return (await getCollection("changelog")).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export function getCollectionPageSchema(path: string, title: string, description: string): JsonLdSchema {
	const canonicalUrl = toCanonicalUrl(path);

	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		"@id": `${canonicalUrl}#collection`,
		url: canonicalUrl,
		name: formatPageTitle(title),
		description,
		inLanguage: siteConfig.language,
		isPartOf: {
			"@id": `${getSiteUrl()}/#website`,
		},
	};
}

export function getDocsEntrySchema(entry: DocsEntry): JsonLdSchema[] {
	const path = getDocsPath(entry.id);
	const canonicalUrl = toCanonicalUrl(path);
	const siteUrl = getSiteUrl();
	const crumbs = [
		{ name: "Docs", path: "/docs/" },
		...(path === "/docs/" ? [] : [{ name: entry.data.title, path }]),
	];

	return [
		{
			"@context": "https://schema.org",
			"@type": "TechArticle",
			"@id": `${canonicalUrl}#techarticle`,
			mainEntityOfPage: {
				"@id": `${canonicalUrl}#webpage`,
			},
			headline: entry.data.title,
			description: entry.data.summary,
			url: canonicalUrl,
			inLanguage: siteConfig.language,
			author: {
				"@id": `${siteUrl}/#organization`,
			},
			publisher: {
				"@id": `${siteUrl}/#organization`,
			},
		},
		{
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			"@id": `${canonicalUrl}#breadcrumb`,
			itemListElement: crumbs.map((crumb, index) => ({
				"@type": "ListItem",
				position: index + 1,
				name: crumb.name,
				item: toCanonicalUrl(crumb.path),
			})),
		},
	];
}
