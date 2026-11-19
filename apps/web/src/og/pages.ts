import { getCollection } from "astro:content";

import { siteConfig } from "@config/site";
import { getRulePath } from "@loaders/lint-rules";
import { getDocs, getDocsPath, isBuilt } from "@utils/content";

import { getOgImagePath, type OgImageTemplateProps } from "./templates";

export interface OgImageDefinition extends OgImageTemplateProps {
	imagePath: string;
}

function defineOgImage(
	path: string,
	definition: OgImageTemplateProps,
	options: { index?: boolean } = {},
): OgImageDefinition {
	return {
		...definition,
		imagePath: getOgImagePath(path, options),
	};
}

export async function getOgImageDefinitions(): Promise<OgImageDefinition[]> {
	const docs = (await getDocs()).filter(isBuilt);
	const definitions: OgImageDefinition[] = [
		defineOgImage("/", { title: siteConfig.name, variant: "default" }, { index: true }),
		defineOgImage("/changelog/", { title: "Changelog", variant: "content" }, { index: true }),
	];

	const home = docs.find((entry) => getDocsPath(entry.id) === "/docs/");
	definitions.push(
		defineOgImage("/docs/", { title: home?.data.title ?? "Docs", variant: "content" }, { index: true }),
	);

	for (const entry of docs) {
		if (entry === home) continue;
		definitions.push(defineOgImage(getDocsPath(entry.id), { title: entry.data.title, variant: "content" }));
	}

	definitions.push(
		defineOgImage("/docs/lint-rules/", { title: "Lint Rules", variant: "content" }, { index: true }),
	);
	for (const rule of await getCollection("lintRules")) {
		definitions.push(defineOgImage(getRulePath(rule.id), { title: rule.data.title, variant: "content" }));
	}

	return definitions;
}
