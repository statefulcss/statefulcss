import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";

import csp from "./integrations/csp";
import { getSiteUrl } from "./src/config/site";
import { markdownProcessor, shikiConfig } from "./src/markdown/config";

// https://astro.build/config
export default defineConfig({
	devToolbar: {
		enabled: false,
	},
	site: getSiteUrl(),
	trailingSlash: "always",
	// Scoped <style> blocks select their file with :where(), so the scope adds no specificity.
	scopedStyleStrategy: "where",
	build: {
		// Every inline <style> adds a hash to the CSP header, which Cloudflare caps at 2,000 characters.
		inlineStylesheets: "never",
	},
	vite: {
		build: {
			// Scripts are files, never inline. After an inline module script, <ClientRouter /> adds a
			// `data:` script to know when it has run, and the CSP blocks `data:` scripts.
			assetsInlineLimit: (filePath) => (filePath.endsWith(".js") ? false : undefined),
		},
	},
	integrations: [
		mdx(),
		sitemap(),
		// Cloudflare Web Analytics (production only): beacon script and its report endpoint.
		csp({
			scriptOrigins: ["https://static.cloudflareinsights.com"],
			connectOrigins: ["https://cloudflareinsights.com"],
		}),
	],
	markdown: {
		processor: markdownProcessor,
		shikiConfig,
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: "Switzer Variable",
			cssVariable: "--font-switzer",
			fallbacks: ["ui-sans-serif", "system-ui", "sans-serif"],
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
			fallbacks: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
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
