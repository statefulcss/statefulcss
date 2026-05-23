import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const docsSchema = z.object({
	title: z.string(),
	description: z.string(),
	order: z.number().int().nonnegative().default(0),
	draft: z.boolean().default(false),
	updatedAt: z.coerce.date().optional(),
	canonical: z.string().optional(),
	tags: z.array(z.string()).default([]),
});

const blogSchema = z.object({
	title: z.string(),
	description: z.string(),
	publishedAt: z.coerce.date(),
	updatedAt: z.coerce.date().optional(),
	draft: z.boolean().default(false),
	tags: z.array(z.string()).default([]),
	canonical: z.string().optional(),
});

const docsConcepts = defineCollection({
	loader: glob({ base: "./src/content/docs/concepts", pattern: "**/*.{md,mdx}" }),
	schema: docsSchema,
});

const docsArchitecture = defineCollection({
	loader: glob({ base: "./src/content/docs/architecture", pattern: "**/*.{md,mdx}" }),
	schema: docsSchema,
});

const docsTools = defineCollection({
	loader: glob({ base: "./src/content/docs/tools", pattern: "**/*.{md,mdx}" }),
	schema: docsSchema,
});

const blog = defineCollection({
	loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
	schema: blogSchema,
});

export const collections = {
	blog,
	docsArchitecture,
	docsConcepts,
	docsTools,
};
