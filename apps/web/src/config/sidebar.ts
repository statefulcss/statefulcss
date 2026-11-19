/**
 * The docs sidebar: sections of pages, in reading order. Each page is the path of its file in
 * src/content/docs, without the extension. A page without a file isn't shown, so the sidebar can
 * list pages before they're written. The previous and next links follow this order.
 */
export interface SidebarGroup {
	/** Omitted for the pages at the top, which belong to no section. */
	label?: string;
	pages: string[];
}

export const sidebar: SidebarGroup[] = [
	{ pages: ["introduction", "css-refresher", "quickstart"] },
	{
		label: "Principles",
		pages: ["markup-defines-state", "bind-properties-once", "mutate-variables"],
	},
	{
		label: "Writing Components",
		pages: ["variables", "component-structure", "state-selectors", "composition"],
	},
	{ label: "Tokens and Theming", pages: ["token-system", "theming"] },
	{ label: "Guides", pages: ["project-setup", "scoping", "adopting"] },
	{ label: "Tooling", pages: ["linting", "ai-assistance"] },
	{ label: "Reference", pages: ["conformance", "glossary"] },
];
