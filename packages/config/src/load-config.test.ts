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
		/** The message for a config file with these contents. */
		async function messageFor(file: string, contents: string): Promise<string> {
			const root = await project({ [file]: contents });
			return (await errorFrom(root, "button.css")).message;
		}

		describe("multiple-files", () => {
			it("names both files", async () => {
				const root = await project({
					"statefulcss.config.json": "{}",
					"statefulcss.config.ts": "export default {};",
				});
				const error = await errorFrom(root, "button.css");
				expect(error).toMatchObject({
					kind: "multiple-files",
					file: path.join(root, "statefulcss.config.json"),
					files: [path.join(root, "statefulcss.config.json"), path.join(root, "statefulcss.config.ts")],
				});
				expect(error.message).toMatchInlineSnapshot(
					`"<root> has more than one Stateful CSS config: statefulcss.config.json and statefulcss.config.ts. Keep one and remove the other, so it's clear which applies."`,
				);
			});

			it('names a "statefulcss" key in package.json', async () => {
				const root = await project({
					"statefulcss.config.json": "{}",
					"statefulcss.config.mjs": "export default {};",
					"package.json": '{ "statefulcss": {} }',
				});
				const error = await errorFrom(root, "button.css");
				expect(error.kind).toBe("multiple-files");
				expect(error.files).toHaveLength(3);
				expect(error.message).toMatchInlineSnapshot(
					`"<root> has more than one Stateful CSS config: statefulcss.config.json, statefulcss.config.mjs and the "statefulcss" key in package.json. Keep one and remove the others, so it's clear which applies."`,
				);
			});

			it("doesn't load either file", async () => {
				const root = await project({
					"statefulcss.config.json": "{ not json",
					"statefulcss.config.mjs": 'throw new Error("loaded");',
				});
				expect((await errorFrom(root, "button.css")).kind).toBe("multiple-files");
			});
		});

		describe("unreadable", () => {
			it("gives the line and column of invalid JSON", async () => {
				const root = await project({ "statefulcss.config.json": '{\n\t"strict": true\n\t"layers": []\n}' });
				const error = await errorFrom(root, "button.css");
				expect(error).toMatchObject({ kind: "unreadable", file: path.join(root, "statefulcss.config.json") });
				expect(error.message).toMatchInlineSnapshot(
					`"Can't read <root>/statefulcss.config.json: comma expected at line 3, column 2. Fix the JSON there; comments and trailing commas are allowed."`,
				);
			});

			it("says what to write in an empty JSON file", async () => {
				expect(await messageFor("statefulcss.config.json", "")).toMatchInlineSnapshot(
					`"<root>/statefulcss.config.json is empty. Write {} in it to use the defaults, or delete it."`,
				);
				expect(await messageFor("statefulcss.config.json", "// nothing yet\n")).toMatchInlineSnapshot(
					`"<root>/statefulcss.config.json is empty. Write {} in it to use the defaults, or delete it."`,
				);
			});

			it("names a package.json that isn't JSON", async () => {
				const root = await project({ "package.json": "{ name: app }" });
				const error = await errorFrom(root, "button.css");
				expect(error.kind).toBe("unreadable");
				expect(error.message).toMatch(
					/^Can't read <root>\/package\.json, which is checked for a "statefulcss" key: /,
				);
			});

			it("keeps what a JavaScript config threw", async () => {
				const root = await project({ "statefulcss.config.mjs": 'throw new Error("THEME is not set");' });
				const error = await errorFrom(root, "button.css");
				expect(error.kind).toBe("unreadable");
				expect(error.cause).toBeInstanceOf(Error);
				expect(error.message).toMatchInlineSnapshot(
					`"Can't load <root>/statefulcss.config.mjs, because it threw an error: THEME is not set."`,
				);
			});

			it("shows the default export a JavaScript config is missing", async () => {
				const root = await project({ "statefulcss.config.mjs": "export const strict = true;" });
				const error = await errorFrom(root, "button.css");
				expect(error.kind).toBe("unreadable");
				expect(error.message).toMatchInlineSnapshot(
					`"<root>/statefulcss.config.mjs has no default export. Export the settings as its default, like export default { strict: true }."`,
				);
			});
		});

		describe("unknown-key", () => {
			it("suggests the setting a typo meant", async () => {
				const root = await project({ "statefulcss.config.json": '{ "blockingState": [] }' });
				const error = await errorFrom(root, "button.css");
				expect(error).toMatchObject({ kind: "unknown-key", key: "blockingState" });
				expect(error.message).toMatchInlineSnapshot(
					`"Unknown setting "blockingState" in <root>/statefulcss.config.json. Did you mean "blockingStates"?"`,
				);
			});

			it("suggests regardless of case", async () => {
				expect(await messageFor("statefulcss.config.json", '{ "ignorelayers": [] }')).toMatchInlineSnapshot(
					`"Unknown setting "ignorelayers" in <root>/statefulcss.config.json. Did you mean "ignoreLayers"?"`,
				);
			});

			it("lists the settings when nothing is close", async () => {
				expect(await messageFor("statefulcss.config.json", '{ "colors": {} }')).toMatchInlineSnapshot(
					`"Unknown setting "colors" in <root>/statefulcss.config.json. The settings are themeAttribute, themeFiles, baseTheme, blockingStates, interactionStates, stateAttributes, layers, strict and ignoreLayers."`,
				);
			});

			it("names every unknown key", async () => {
				expect(
					await messageFor("statefulcss.config.json", '{ "layer": [], "colors": {}, "strict": true }'),
				).toMatchInlineSnapshot(
					`"Unknown settings "layer" (did you mean "layers"?) and "colors" in <root>/statefulcss.config.json. The settings are themeAttribute, themeFiles, baseTheme, blockingStates, interactionStates, stateAttributes, layers, strict and ignoreLayers."`,
				);
			});

			it("comes before a wrong value", async () => {
				const root = await project({ "statefulcss.config.json": '{ "strict": "yes", "layer": [] }' });
				expect((await errorFrom(root, "button.css")).kind).toBe("unknown-key");
			});

			it('names the "statefulcss" key in package.json', async () => {
				expect(
					await messageFor("package.json", '{ "statefulcss": { "baseThemes": "default" } }'),
				).toMatchInlineSnapshot(
					`"Unknown setting "baseThemes" in the "statefulcss" key in <root>/package.json. Did you mean "baseTheme"?"`,
				);
			});
		});

		describe("invalid-value", () => {
			it("says what a setting must be, with an example", async () => {
				const root = await project({ "statefulcss.config.json": '{ "blockingStates": ":disabled" }' });
				const error = await errorFrom(root, "button.css");
				expect(error).toMatchObject({ kind: "invalid-value", key: "blockingStates" });
				expect(error.message).toMatchInlineSnapshot(
					`""blockingStates" in <root>/statefulcss.config.json must be a list of selectors, like [":disabled", "[aria-disabled=\\"true\\"]"]. It's ":disabled"."`,
				);
			});

			it("names the item in a list that's wrong", async () => {
				const root = await project({ "statefulcss.config.json": '{ "blockingStates": [":disabled", 1] }' });
				const error = await errorFrom(root, "button.css");
				expect(error).toMatchObject({ kind: "invalid-value", key: "blockingStates[1]" });
				expect(error.message).toMatchInlineSnapshot(
					`""blockingStates" in <root>/statefulcss.config.json must be a list of selectors, like [":disabled", "[aria-disabled=\\"true\\"]"]. blockingStates[1] is 1."`,
				);
			});

			it("rejects an empty name", async () => {
				expect(await messageFor("statefulcss.config.json", '{ "baseTheme": "" }')).toMatchInlineSnapshot(
					`""baseTheme" in <root>/statefulcss.config.json must be a folder name, like "default". It's ""."`,
				);
				expect(
					await messageFor("statefulcss.config.json", '{ "layers": ["base", ""] }'),
				).toMatchInlineSnapshot(
					`""layers" in <root>/statefulcss.config.json must be a list of layer names, like ["reset", "base", "themes", "components", "utilities"]. layers[1] is ""."`,
				);
			});

			it("gives every setting's expected value and example", async () => {
				const messages = [];
				for (const [key, value] of Object.entries({
					themeAttribute: 1,
					themeFiles: "src/themes/**",
					baseTheme: ["default"],
					blockingStates: ":disabled",
					interactionStates: ":hover",
					stateAttributes: "data-state",
					layers: "base, components",
					strict: "yes",
					ignoreLayers: "base",
				})) {
					messages.push(await messageFor("statefulcss.config.json", JSON.stringify({ [key]: value })));
				}
				expect(messages).toMatchInlineSnapshot(`
					[
					  ""themeAttribute" in <root>/statefulcss.config.json must be an attribute name, like "data-theme". It's 1.",
					  ""themeFiles" in <root>/statefulcss.config.json must be a list of globs, like ["src/styles/themes/**"]. It's "src/themes/**".",
					  ""baseTheme" in <root>/statefulcss.config.json must be a folder name, like "default". It's ["default"].",
					  ""blockingStates" in <root>/statefulcss.config.json must be a list of selectors, like [":disabled", "[aria-disabled=\\"true\\"]"]. It's ":disabled".",
					  ""interactionStates" in <root>/statefulcss.config.json must be a list of selectors, like [":hover", ":focus-visible", ":active"]. It's ":hover".",
					  ""stateAttributes" in <root>/statefulcss.config.json must be a list of attribute names, like ["data-state"]. It's "data-state".",
					  ""layers" in <root>/statefulcss.config.json must be a list of layer names, like ["reset", "base", "themes", "components", "utilities"]. It's "base, components".",
					  ""strict" in <root>/statefulcss.config.json must be true or false, like true. It's "yes".",
					  ""ignoreLayers" in <root>/statefulcss.config.json must be a list of layer names, like ["base"]. It's "base".",
					]
				`);
			});

			it("rejects a JSON config that isn't an object", async () => {
				const error = await errorFrom(await project({ "statefulcss.config.json": "[]" }), "button.css");
				expect(error).toMatchObject({ kind: "invalid-value", key: undefined });
				expect(error.message).toMatchInlineSnapshot(
					`"<root>/statefulcss.config.json must contain an object of settings, like { "strict": true }. It's []."`,
				);
			});

			it("rejects a JavaScript config that doesn't export an object", async () => {
				expect(await messageFor("statefulcss.config.mjs", "export default null;")).toMatchInlineSnapshot(
					`"<root>/statefulcss.config.mjs must export an object of settings as its default, like export default { strict: true }. It exports null."`,
				);
			});

			it('rejects a "statefulcss" key in package.json that isn\'t an object', async () => {
				const root = await project({ "package.json": '{ "statefulcss": true }' });
				const error = await errorFrom(root, "button.css");
				expect(error).toMatchObject({ kind: "invalid-value", file: path.join(root, "package.json") });
				expect(error.message).toMatchInlineSnapshot(
					`"The "statefulcss" key in <root>/package.json must be an object of settings, like { "strict": true }. It's true."`,
				);
			});
		});
	});
});
