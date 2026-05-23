import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import {
	transformerMetaHighlight,
	transformerMetaWordHighlight,
	transformerNotationDiff,
	transformerNotationFocus,
	transformerNotationHighlight,
	transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { defineConfig, fontProviders } from "astro/config";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSlug from "rehype-slug";

import { getSiteUrl } from "./src/config/site";

// https://astro.build/config
export default defineConfig({
	site: getSiteUrl(),
	trailingSlash: "always",
	integrations: [mdx(), sitemap()],
	markdown: {
		rehypePlugins: [
			rehypeSlug,
			[
				rehypeAutolinkHeadings,
				{
					behavior: "wrap",
					test: ["h2", "h3", "h4", "h5", "h6"],
				},
			],
		],
		shikiConfig: {
			themes: {
				light: "github-light",
				dark: "github-dark",
			},
			transformers: [
				transformerNotationDiff(),
				transformerNotationFocus(),
				transformerNotationHighlight(),
				transformerNotationWordHighlight(),
				transformerMetaHighlight(),
				transformerMetaWordHighlight(),
			],
		},
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: "Switzer Variable",
			cssVariable: "--font-switzer",
			options: {
				variants: [
					{
						src: ["./src/assets/fonts/Switzer-Variable.woff2"],
						weight: "100 900",
						style: "normal",
					},
					{
						src: ["./src/assets/fonts/Switzer-Variable-Italic.woff2"],
						weight: "100 900",
						style: "italic",
					},
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: "JetBrains Mono",
			cssVariable: "--font-jetbrains-mono",
			options: {
				variants: [
					{
						src: ["./src/assets/fonts/JetBrainsMono-Variable.woff2"],
						weight: "100 900",
						style: "normal",
					},
				],
			},
		},
	],
});
