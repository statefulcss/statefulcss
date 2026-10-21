import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SITEMAP_PATH = resolve(process.cwd(), "dist/sitemap-0.xml");

function loadRoutes(): string[] {
	let xml: string;
	try {
		xml = readFileSync(SITEMAP_PATH, "utf8");
	} catch (error) {
		throw new Error(`Could not read ${SITEMAP_PATH}. Run \`pnpm build\` before running e2e tests.`, {
			cause: error,
		});
	}
	return Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g), (match) => new URL(match[1] ?? "").pathname).sort();
}

/** The production origin the default build is made for. */
export const SITE_URL = "https://statefulcss.com";

/** Public, indexable routes from the built sitemap. */
export const routes = loadRoutes();

/** Any path that does not exist, to exercise the 404 page. */
export const missingRoute = "/this-page-does-not-exist/";
