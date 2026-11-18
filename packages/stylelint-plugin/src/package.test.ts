// What a project that installs the package gets: the files it ships, and links that lead somewhere.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ruleMeta, ruleNames } from "./index.js";
import { rulesUrl } from "./stylelint/plugin.js";

const packageFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repository = path.resolve(packageFolder, "../..");
const rulesFolder = path.join(packageFolder, "src/rules");

/** The files `npm pack` puts in the package, by their path inside it. */
function packed(): string[] {
	const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
		cwd: packageFolder,
		encoding: "utf8",
	});
	const [pack] = JSON.parse(output) as { files: { path: string }[] }[];
	return (pack?.files ?? []).map((file) => file.path);
}

const ruleFolders = readdirSync(rulesFolder, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name);

describe("the package", () => {
	it("has a README for every rule, and a rule for every README", () => {
		expect(ruleFolders.map((name) => `statefulcss/${name}`).sort()).toEqual([...ruleNames].sort());
	});

	it("ships every rule's README, and none of the rules' source or tests", { timeout: 30_000 }, () => {
		const files = packed();
		for (const name of ruleFolders) expect(files).toContain(`src/rules/${name}/README.md`);
		expect(files.filter((file) => file.startsWith("src/") && !file.endsWith("/README.md"))).toEqual([]);
		expect(files).toEqual(expect.arrayContaining(["README.md", "LICENSE", "package.json"]));
	});

	it("links its README to files that are there once it's installed", () => {
		const readme = readFileSync(path.join(packageFolder, "README.md"), "utf8");
		const links = [...readme.matchAll(/\]\((?!https?:)([^)#]+)(?:#[^)]*)?\)/g)].map(
			(match) => match[1] ?? "",
		);
		expect(links.length).toBeGreaterThan(ruleFolders.length);
		for (const link of links) {
			// `../config` is the settings package, installed next to this one under `@statefulcss/`.
			expect(existsSync(path.resolve(packageFolder, link)), link).toBe(true);
		}
		for (const name of ruleFolders) expect(links).toContain(`./src/rules/${name}/README.md`);
	});

	it("gives each rule a URL to its README on the repository's main branch", () => {
		for (const name of ruleNames) {
			const url = ruleMeta[name]?.url ?? "";
			expect(url.startsWith(`${rulesUrl}/`), url).toBe(true);
			const file = url.replace("https://github.com/statefulcss/statefulcss/blob/main/", "");
			expect(existsSync(path.join(repository, file)), url).toBe(true);
		}
	});
});
