import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";

import { siteConfig } from "./src/config/site";

// https://astro.build/config
export default defineConfig({
	site: siteConfig.url,
	trailingSlash: "always",
	integrations: [sitemap()],
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
