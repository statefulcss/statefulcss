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

/**
 * Known issues to fix in the redesign (audit WEB-02/WEB-03). Tests for these are marked `fixme`
 * instead of failing CI; remove entries as they are fixed and the tests will start enforcing them.
 */
export const knownIssues = {
	/** Pages that render their own <main> inside Layout's <main>. */
	nestedMain: (route: string) =>
		route.startsWith("/docs/") || route.startsWith("/blog/") || route === missingRoute,
	/** Pages without an <h1>. */
	missingH1: (route: string) => route === "/",
	/** Every page is wider than a 375px phone: the header navigation overflows (audit WEB-02). */
	phoneOverflow: true,
};
