import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConfigError } from "./config-error.js";
import { loadConfig } from "./load-config.js";
import { defaults } from "./schema.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A repository in a temporary folder, with the given files. Returns its path. */
async function project(files: Record<string, string>, { repository = true } = {}): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "statefulcss-config-"));
	roots.push(root);
	if (repository) await mkdir(path.join(root, ".git"));
	await Promise.all(Object.entries(files).map(([file, contents]) => write(root, file, contents)));
	return root;
}

async function write(root: string, file: string, contents: string): Promise<void> {
	await mkdir(path.dirname(path.join(root, file)), { recursive: true });
	await writeFile(path.join(root, file), contents);
}

/** Moves a file's or folder's modification time, so the cache sees a change even within the same millisecond. */
async function touch(root: string, file: string, seconds: number): Promise<void> {
	const time = new Date(Date.now() + seconds * 1000);
	await utimes(path.join(root, file), time, time);
}

/** The error `loadConfig` throws, with the temporary folder in its message replaced by `<root>`. */
async function errorFrom(root: string, file: string): Promise<ConfigError> {
	const error = await loadConfig(path.join(root, file)).then(
		() => expect.unreachable("expected a ConfigError"),
		(error: unknown) => error,
	);
	expect(error).toBeInstanceOf(ConfigError);
	const configError = error as ConfigError;
	configError.message = configError.message.replaceAll(root, "<root>");
	return configError;
}

describe("loadConfig", () => {
	describe("formats", () => {
		it("reads statefulcss.config.json, with comments and trailing commas", async () => {
			const root = await project({
				"statefulcss.config.json": `{
					"$schema": "./node_modules/@statefulcss/config/schema.json",
					// Radix renders its open state as a value
					"stateAttributes": ["data-state"],
				}`,
			});
			await expect(loadConfig(path.join(root, "button.css"))).resolves.toEqual({
				...defaults,
				stateAttributes: ["data-state"],
			});
		});

		it.each(["js", "mjs"])("reads statefulcss.config.%s", async (extension) => {
			const root = await project({ [`statefulcss.config.${extension}`]: "export default { strict: true };" });
			await expect(loadConfig(path.join(root, "button.css"))).resolves.toEqual({ ...defaults, strict: true });
		});

		it("reads statefulcss.config.ts", async () => {
			const root = await project({
				"statefulcss.config.ts": `const layers: string[] = ["base", "components"];
					export default { layers };`,
			});
			await expect(loadConfig(path.join(root, "button.css"))).resolves.toEqual({
				...defaults,
				layers: ["base", "components"],
			});
		});

		it('reads the "statefulcss" key in package.json', async () => {
			const root = await project({
				"package.json": JSON.stringify({ name: "app", statefulcss: { baseTheme: "default" } }),
			});
			await expect(loadConfig(path.join(root, "button.css"))).resolves.toEqual({
				...defaults,
				baseTheme: "default",
			});
		});
	});

	describe("the search", () => {
		it("returns the defaults when there's no config", async () => {
			const root = await project({});
			await expect(loadConfig(path.join(root, "src/button.css"))).resolves.toBe(defaults);
		});

		it("uses the nearest config to the file", async () => {
			const root = await project({
				"statefulcss.config.json": '{ "baseTheme": "outer" }',
				"apps/shop/statefulcss.config.json": '{ "baseTheme": "inner" }',
			});
			await expect(loadConfig(path.join(root, "apps/shop/src/button.css"))).resolves.toMatchObject({
				baseTheme: "inner",
			});
			await expect(loadConfig(path.join(root, "apps/blog/src/button.css"))).resolves.toMatchObject({
				baseTheme: "outer",
			});
		});

		it("goes past a package.json without the key", async () => {
			const root = await project({
				"statefulcss.config.json": '{ "strict": true }',
				"packages/ui/package.json": '{ "name": "ui" }',
			});
			await expect(loadConfig(path.join(root, "packages/ui/button.css"))).resolves.toMatchObject({
				strict: true,
			});
		});

		it("stops at the repository root", async () => {
			const outside = await project(
				{ "statefulcss.config.json": '{ "strict": true }' },
				{ repository: false },
			);
			await mkdir(path.join(outside, "repo/.git"), { recursive: true });
			await expect(loadConfig(path.join(outside, "repo/src/button.css"))).resolves.toBe(defaults);
		});

		it("goes up to the filesystem root outside a repository", async () => {
			const root = await project({ "statefulcss.config.json": '{ "strict": true }' }, { repository: false });
			await expect(loadConfig(path.join(root, "a/b/c/button.css"))).resolves.toMatchObject({ strict: true });
		});
	});

	describe("the cache", () => {
		it("returns the same settings while the config is unchanged", async () => {
			const root = await project({ "statefulcss.config.json": '{ "strict": true }' });
			const first = await loadConfig(path.join(root, "a.css"));
			await expect(loadConfig(path.join(root, "src/b.css"))).resolves.toBe(first);
		});

		it("reads a config again after it's edited", async () => {
			const root = await project({ "statefulcss.config.json": '{ "strict": true }' });
			await expect(loadConfig(path.join(root, "a.css"))).resolves.toMatchObject({ strict: true });
			await write(root, "statefulcss.config.json", '{ "strict": false }');
			await touch(root, "statefulcss.config.json", 10);
			await expect(loadConfig(path.join(root, "a.css"))).resolves.toMatchObject({ strict: false });
		});

		it("loads a JavaScript config again after it's edited", async () => {
			const root = await project({ "statefulcss.config.mjs": 'export default { baseTheme: "one" };' });
			await expect(loadConfig(path.join(root, "a.css"))).resolves.toMatchObject({ baseTheme: "one" });
			await write(root, "statefulcss.config.mjs", 'export default { baseTheme: "two" };');
			await touch(root, "statefulcss.config.mjs", 10);
			await expect(loadConfig(path.join(root, "a.css"))).resolves.toMatchObject({ baseTheme: "two" });
		});

		it("finds a config added after the first search", async () => {
			const root = await project({ "src/button.css": "" });
			await expect(loadConfig(path.join(root, "src/button.css"))).resolves.toBe(defaults);
			await write(root, "src/statefulcss.config.json", '{ "strict": true }');
			await touch(root, "src", 10);
			await expect(loadConfig(path.join(root, "src/button.css"))).resolves.toMatchObject({ strict: true });
		});
	});

	describe("errors", () => {
		it("rejects two config files in one folder, naming both", async () => {
			const root = await project({
				"statefulcss.config.json": "{}",
				"statefulcss.config.ts": "export default {};",
			});
			const error = await errorFrom(root, "button.css");
			expect(error).toMatchObject({
				kind: "multiple-files",
				files: [path.join(root, "statefulcss.config.json"), path.join(root, "statefulcss.config.ts")],
			});
			expect(error.message).toMatchInlineSnapshot(
				`"<root> has more than one Stateful CSS config: statefulcss.config.json, statefulcss.config.ts. Keep one and remove the others."`,
			);
		});

		it('rejects a config file next to a "statefulcss" key in package.json', async () => {
			const root = await project({
				"statefulcss.config.json": "{}",
				"package.json": '{ "statefulcss": {} }',
			});
			const error = await errorFrom(root, "button.css");
			expect(error.kind).toBe("multiple-files");
			expect(error.message).toMatchInlineSnapshot(
				`"<root> has more than one Stateful CSS config: statefulcss.config.json, the "statefulcss" key in package.json. Keep one and remove the others."`,
			);
		});

		it("rejects JSON it can't parse, with the line and column", async () => {
			const root = await project({ "statefulcss.config.json": '{\n\t"strict": true\n\t"layers": []\n}' });
			const error = await errorFrom(root, "button.css");
			expect(error).toMatchObject({ kind: "unreadable", file: path.join(root, "statefulcss.config.json") });
			expect(error.message).toMatchInlineSnapshot(
				`"Can't read <root>/statefulcss.config.json: comma expected at line 3, column 2. Comments and trailing commas are allowed; anything else has to be JSON."`,
			);
		});

		it("rejects an empty JSON file", async () => {
			const root = await project({ "statefulcss.config.json": "" });
			expect((await errorFrom(root, "button.css")).message).toMatchInlineSnapshot(
				`"Can't read <root>/statefulcss.config.json: value expected at line 1, column 1. Comments and trailing commas are allowed; anything else has to be JSON."`,
			);
		});

		it("rejects a package.json it can't parse", async () => {
			const root = await project({ "package.json": "{ name: app }" });
			const error = await errorFrom(root, "button.css");
			expect(error.kind).toBe("unreadable");
		});

		it("rejects a JavaScript config that throws, keeping what it threw", async () => {
			const root = await project({ "statefulcss.config.mjs": 'throw new Error("Missing THEME");' });
			const error = await errorFrom(root, "button.css");
			expect(error.kind).toBe("unreadable");
			expect(error.cause).toBeInstanceOf(Error);
			expect(error.message).toMatchInlineSnapshot(
				`"Can't load <root>/statefulcss.config.mjs, because it threw: Missing THEME"`,
			);
		});

		it("rejects a JavaScript config with no default export", async () => {
			const root = await project({ "statefulcss.config.mjs": "export const strict = true;" });
			const error = await errorFrom(root, "button.css");
			expect(error.kind).toBe("unreadable");
			expect(error.message).toMatchInlineSnapshot(
				`"<root>/statefulcss.config.mjs has no default export. Export the config as the default: export default defineConfig({ … })."`,
			);
		});

		it("rejects an unknown key", async () => {
			const root = await project({ "statefulcss.config.json": '{ "blockingState": [] }' });
			expect(await errorFrom(root, "button.css")).toMatchObject({
				kind: "unknown-key",
				key: "blockingState",
			});
		});

		it("rejects a value of the wrong kind, with its key path", async () => {
			const root = await project({ "statefulcss.config.json": '{ "blockingStates": [":disabled", 1] }' });
			expect(await errorFrom(root, "button.css")).toMatchObject({
				kind: "invalid-value",
				key: "blockingStates[1]",
			});
		});

		it("rejects a config that isn't an object", async () => {
			const root = await project({ "package.json": '{ "statefulcss": true }' });
			expect(await errorFrom(root, "button.css")).toMatchObject({
				kind: "invalid-value",
				file: path.join(root, "package.json"),
				key: undefined,
			});
		});
	});
});
