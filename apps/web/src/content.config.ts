import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { ruleNames } from "@statefulcss/stylelint-plugin/rule-names";

import { lintRulesLoader } from "./loaders/lint-rules";

/** The docs pages. A file's path in the folder is its URL under /docs/. */
const docs = defineCollection({
	loader: glob({ base: "./src/content/docs", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		title: z.string(),
		/** The page's lead, and its description for search results and link previews. */
		summary: z.string(),
		/** Drafts are built everywhere but production, where the sidebar lists them unlinked. */
		status: z.enum(["draft", "published"]),
	}),
});

/** The Changelog's entries, all shown on one page, newest first. */
const changelog = defineCollection({
	loader: glob({ base: "./src/content/changelog", pattern: "**/*.{md,mdx}" }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		/** What the change touches: the methodology, a lint rule, or a package and its version. */
		tags: z.array(z.string()).default([]),
	}),
});

/** The lint rules' pages: each rule's README in the plugin, in the plugin's order. */
const lintRules = defineCollection({
	loader: lintRulesLoader({
		folder: new URL("../../../packages/stylelint-plugin/src/rules/", import.meta.url),
		rules: ruleNames.map((name) => name.replace(/^statefulcss\//, "")),
	}),
	schema: z.object({
		title: z.string(),
		summary: z.string(),
		severity: z.enum(["error", "warning"]),
		severityText: z.string(),
		fixable: z.boolean(),
		order: z.number().int(),
	}),
});

export const collections = { changelog, docs, lintRules };
