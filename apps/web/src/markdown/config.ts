import { rehypeHeadingIds, unified, type ShikiConfig } from "@astrojs/markdown-remark";
import {
	transformerMetaHighlight,
	transformerMetaWordHighlight,
	transformerNotationDiff,
	transformerNotationErrorLevel,
	transformerNotationFocus,
	transformerNotationHighlight,
	transformerNotationWordHighlight,
	transformerRemoveLineBreak,
} from "@shikijs/transformers";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

import { transformerCodeBlock } from "./code-block";
import { headingAnchors } from "./heading-anchors";

/** The Markdown and MDX pipeline: Astro's unified processor with section links on headings. */
export const markdownProcessor = unified({
	// Astro adds heading ids at the end; the anchors need them earlier.
	rehypePlugins: [rehypeHeadingIds, [rehypeAutolinkHeadings, headingAnchors]],
});

export const shikiConfig: ShikiConfig = {
	themes: {
		light: "github-light-high-contrast",
		dark: "github-dark-high-contrast",
	},
	// Token colors are inline `light-dark()` values, so they follow the element's color-scheme.
	defaultColor: "light-dark()",
	transformers: [
		transformerCodeBlock(),
		transformerNotationDiff(),
		transformerNotationHighlight(),
		transformerNotationWordHighlight(),
		transformerNotationFocus(),
		transformerNotationErrorLevel(),
		transformerMetaHighlight(),
		transformerMetaWordHighlight(),
		// Lines are blocks, so a highlight spans the whole width; the newlines between them would double the gaps.
		transformerRemoveLineBreak(),
	],
};
