import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfigError } from "./config-error.js";
import { loadConfig } from "./load-config.js";
import { defaults } from "./schema.js";

/** The filesystem errors a test injects, by call and path: `stat /project/app`. */
const failures = vi.hoisted(() => new Map<string, Error>());

// The real filesystem, except for the calls a test makes fail. A permission or I/O error can't be made on disk the
// same way on every system (or at all, as root).
vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	const failing = (name: string, call: (...parameters: never[]) => Promise<unknown>) =>
		((...parameters: unknown[]) => {
			const error = failures.get(`${name} ${String(parameters[0])}`);
			return error ? Promise.reject(error) : call(...(parameters as never[]));
		}) as unknown;
	return {
		...actual,
		readdir: failing("readdir", actual.readdir) as typeof actual.readdir,
		stat: failing("stat", actual.stat) as typeof actual.stat,
	};
});

const roots: string[] = [];

afterEach(async () => {
	failures.clear();
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Makes `readdir` or `stat` fail for one path, the way Node reports it. */
function fail(call: "readdir" | "stat", root: string, file: string, code: string): void {
	const target = path.join(root, file);
	const messages: Record<string, string> = {
		EACCES: "permission denied",
		EIO: "i/o error",
		ENOENT: "no such file or directory",
		ENOTDIR: "not a directory",
	};
	const error = new Error(`${code}: ${messages[code] ?? "failed"}, ${call} '${target}'`);
	failures.set(`${call} ${target}`, Object.assign(error, { code }));
}

/**
 * A script for Node itself: writes each source to the config file in turn, loads it, and prints the `baseTheme`
 * each load gave. Node reads the loader's TypeScript as it is, once the `.js` in its imports finds the `.ts` file.
 */
const loadInNode = `
	import { utimes, writeFile } from "node:fs/promises";
	import { registerHooks } from "node:module";

	registerHooks({
		resolve(specifier, context, nextResolve) {
			try {
				return nextResolve(specifier, context);
			} catch (error) {
				if (!specifier.endsWith(".js")) throw error;
				return nextResolve(specifier.slice(0, -3) + ".ts", context);
			}
		},
	});

	const [loader, file, ...sources] = process.argv.slice(1);
	const { loadConfig } = await import(loader);
	const loaded = [];
	for (const [index, source] of sources.entries()) {
		await writeFile(file, source);
		const time = new Date(Date.now() + index * 10_000);
		await utimes(file, time, time);
		loaded.push((await loadConfig(file)).baseTheme);
	}
	console.log(JSON.stringify(loaded));
`;

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

		// Node keeps a CommonJS module by its path, whatever the URL it's imported with. Vite loads every module as
		// ESM, so only Node itself shows that: this runs the loader's source there, three times over one file.
		it.each([
			["statefulcss.config.js", '{ "type": "commonjs" }', "module.exports = { baseTheme: NAME };"],
			["statefulcss.config.js", "{}", "module.exports = { baseTheme: NAME };"],
			[
				"statefulcss.config.ts",
				'{ "type": "commonjs" }',
				"const baseTheme: string = NAME;\nmodule.exports = { baseTheme };",
			],
			["statefulcss.config.js", '{ "type": "module" }', "export default { baseTheme: NAME };"],
		])("loads %s again in Node after it's edited, in a package with %s", async (file, manifest, source) => {
			const root = await project({ "package.json": manifest });
			const names = ["one", "two", "three"];
			const { stdout } = await promisify(execFile)(process.execPath, [
				"--input-type=module",
				"--eval",
				loadInNode,
				new URL("./load-config.ts", import.meta.url).href,
				path.join(root, file),
				...names.map((name) => source.replace("NAME", JSON.stringify(name))),
			]);
			expect(JSON.parse(stdout)).toEqual(names);
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

		describe("unreadable, on the way up", () => {
			// The nearer config must win. Going past it would lint with the outer one's settings.
			const nested = {
				"statefulcss.config.json": '{ "strict": true }',
				"app/statefulcss.config.json": '{ "strict": false }',
			};

			it("stops at a folder that can't be listed, and lists it again next time", async () => {
				const root = await project(nested);
				fail("readdir", root, "app", "EACCES");
				const error = await errorFrom(root, "app/button.css");
				expect(error).toMatchObject({ kind: "unreadable", file: path.join(root, "app") });
				expect(error.cause).toMatchObject({ code: "EACCES" });
				expect(error.message).toMatchInlineSnapshot(
					`"Can't read the folder <root>/app, which is searched for a Stateful CSS config: EACCES: permission denied, readdir '<root>/app'."`,
				);

				failures.clear();
				await expect(loadConfig(path.join(root, "app/button.css"))).resolves.toMatchObject({ strict: false });
			});

			it("stops at a folder whose details can't be read", async () => {
				const root = await project(nested);
				fail("stat", root, "app", "EACCES");
				const error = await errorFrom(root, "app/button.css");
				expect(error).toMatchObject({ kind: "unreadable", file: path.join(root, "app") });
				expect(error.message).toMatchInlineSnapshot(
					`"Can't read the folder <root>/app, which is searched for a Stateful CSS config: EACCES: permission denied, stat '<root>/app'."`,
				);
			});

			it.each(["EACCES", "EIO"])("stops at a config whose details can't be read (%s)", async (code) => {
				const root = await project(nested);
				fail("stat", root, "app/statefulcss.config.json", code);
				const error = await errorFrom(root, "app/button.css");
				expect(error).toMatchObject({
					kind: "unreadable",
					file: path.join(root, "app/statefulcss.config.json"),
				});
				expect(error.cause).toMatchObject({ code });
				expect(error.message).toMatch(
					new RegExp(`^Can't read <root>/app/statefulcss\\.config\\.json: ${code}: .+, stat '<root>/app/`),
				);

				failures.clear();
				await expect(loadConfig(path.join(root, "app/button.css"))).resolves.toMatchObject({ strict: false });
			});

			it("stops at a package.json whose details can't be read", async () => {
				const root = await project({ ...nested, "app/package.json": '{ "name": "app" }' });
				fail("stat", root, "app/package.json", "EACCES");
				expect(await errorFrom(root, "app/button.css")).toMatchObject({
					kind: "unreadable",
					file: path.join(root, "app/package.json"),
				});
			});

			it.each(["ENOENT", "ENOTDIR"])("goes past a config that's gone (%s)", async (code) => {
				const root = await project(nested);
				fail("stat", root, "app/statefulcss.config.json", code);
				await expect(loadConfig(path.join(root, "app/button.css"))).resolves.toMatchObject({ strict: true });
			});

			it.each([
				["stat", "ENOENT"],
				["stat", "ENOTDIR"],
				["readdir", "ENOENT"],
				["readdir", "ENOTDIR"],
			] as const)(
				"goes past a folder that's gone, and looks again next time (%s, %s)",
				async (call, code) => {
					const root = await project(nested);
					fail(call, root, "app", code);
					await expect(loadConfig(path.join(root, "app/button.css"))).resolves.toMatchObject({
						strict: true,
					});

					failures.clear();
					await expect(loadConfig(path.join(root, "app/button.css"))).resolves.toMatchObject({
						strict: false,
					});
				},
			);

			it("goes past a folder that doesn't exist yet", async () => {
				const root = await project({ "statefulcss.config.json": '{ "strict": true }' });
				await expect(loadConfig(path.join(root, "new/button.css"))).resolves.toMatchObject({ strict: true });
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
					`"Unknown setting "colors" in <root>/statefulcss.config.json. The settings are themeAttribute, componentAttribute, partAttribute, slotAttribute, themeFiles, baseTheme, blockingStates, interactionStates, stateAttributes, layers, strict and ignoreLayers."`,
				);
			});

			it("names every unknown key", async () => {
				expect(
					await messageFor("statefulcss.config.json", '{ "layer": [], "colors": {}, "strict": true }'),
				).toMatchInlineSnapshot(
					`"Unknown settings "layer" (did you mean "layers"?) and "colors" in <root>/statefulcss.config.json. The settings are themeAttribute, componentAttribute, partAttribute, slotAttribute, themeFiles, baseTheme, blockingStates, interactionStates, stateAttributes, layers, strict and ignoreLayers."`,
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
					`""blockingStates" in <root>/statefulcss.config.json must be a list of pseudo-classes and attribute selectors, like [":disabled", "[aria-disabled=\\"true\\"]"]. It's ":disabled"."`,
				);
			});

			it("names the item in a list that's wrong", async () => {
				const root = await project({ "statefulcss.config.json": '{ "blockingStates": [":disabled", 1] }' });
				const error = await errorFrom(root, "button.css");
				expect(error).toMatchObject({ kind: "invalid-value", key: "blockingStates[1]" });
				expect(error.message).toMatchInlineSnapshot(
					`""blockingStates" in <root>/statefulcss.config.json must be a list of pseudo-classes and attribute selectors, like [":disabled", "[aria-disabled=\\"true\\"]"]. blockingStates[1] is 1."`,
				);
			});

			describe("the form of a state list's entries", () => {
				/** The key and the end of the message, after what the setting must be. */
				async function entryError(config: Record<string, string[]>): Promise<[string | undefined, string]> {
					const root = await project({ "statefulcss.config.json": JSON.stringify(config) });
					const error = await errorFrom(root, "button.css");
					expect(error.kind).toBe("invalid-value");
					return [error.key, error.message.replace(/^.*?\]\. /, "")];
				}

				it("says in full what a state list takes, and which entry is wrong", async () => {
					expect(
						await messageFor(
							"statefulcss.config.json",
							'{ "blockingStates": [":disabled", "[inert]", ":disabled[data-busy]"] }',
						),
					).toMatchInlineSnapshot(
						`""blockingStates" in <root>/statefulcss.config.json must be a list of pseudo-classes and attribute selectors, like [":disabled", "[aria-disabled=\\"true\\"]"]. blockingStates[2] is ":disabled[data-busy]", a compound. List ":disabled" or "[data-busy]" on its own: an entry is one simple selector."`,
					);
					expect(
						await messageFor("statefulcss.config.json", '{ "interactionStates": [":hover:active"] }'),
					).toMatchInlineSnapshot(
						`""interactionStates" in <root>/statefulcss.config.json must be a list of pseudo-classes and attribute selectors, like [":hover", ":focus-visible", ":active"]. interactionStates[0] is ":hover:active", a compound. List ":hover" or ":active" on its own: an entry is one simple selector."`,
					);
					expect(
						await messageFor("statefulcss.config.json", '{ "stateAttributes": ["[data-mode=\\"on\\"]"] }'),
					).toMatchInlineSnapshot(
						`""stateAttributes" in <root>/statefulcss.config.json must be a list of attribute names, like ["data-state"]. stateAttributes[0] is "[data-mode=\\"on\\"]", an attribute selector. Write the attribute name "data-mode"."`,
					);
				});

				it.each(["blockingStates", "interactionStates"])(
					"takes one pseudo-class or attribute selector for each entry of %s",
					async (setting) => {
						const rows: [entry: string, message: string][] = [
							// The other list's form
							["data-busy", `is "data-busy", an attribute name. Write "[data-busy]".`],
							["aria-busy", `is "aria-busy", an attribute name. Write "[aria-busy]".`],
							[
								"hover",
								`is "hover", a name on its own. Write ":hover" for the pseudo-class or "[hover]" for the attribute.`,
							],
							// More than one simple selector
							[
								":disabled[data-busy]",
								`is ":disabled[data-busy]", a compound. List ":disabled" or "[data-busy]" on its own: an entry is one simple selector.`,
							],
							[
								":hover:active:focus",
								`is ":hover:active:focus", a compound. List ":hover", ":active" or ":focus" on its own: an entry is one simple selector.`,
							],
							[
								"button[disabled]",
								`is "button[disabled]", a compound. List "[disabled]" on its own: an entry is one simple selector.`,
							],
							[
								"button.busy",
								`is "button.busy", a compound. An entry is one pseudo-class or one attribute selector.`,
							],
							[":hover, :focus", `is ":hover, :focus", a list. Give each selector its own entry.`],
							[":hover , :focus", `is ":hover , :focus", a list. Give each selector its own entry.`],
							[
								".card :hover",
								`is ".card :hover", a selector with a combinator. An entry is one pseudo-class or one attribute selector.`,
							],
							[
								":hover>[data-busy]",
								`is ":hover>[data-busy]", a selector with a combinator. An entry is one pseudo-class or one attribute selector.`,
							],
							// One simple selector that isn't a state
							[".is-disabled", `is ".is-disabled", a class.`],
							["#busy", `is "#busy", an ID.`],
							["::before", `is "::before", a pseudo-element.`],
							[":after", `is ":after", a pseudo-element.`],
							[":not(:disabled)", `is ":not(:disabled)", which can't be a state.`],
							[":is(:hover, :focus)", `is ":is(:hover, :focus)", which can't be a state.`],
							[":has([data-busy])", `is ":has([data-busy])", which can't be a state.`],
							[":root", `is ":root", which can't be a state.`],
							[":global(.busy)", `is ":global(.busy)", which can't be a state.`],
							["*", `is "*", which can't be a state.`],
							// Not a selector
							[
								"[data-step=2]",
								`is "[data-step=2]", an attribute selector whose value needs quotes. Write "[data-step=\\"2\\"]".`,
							],
							["[data-busy", `is "[data-busy", which isn't a selector.`],
							["[]", `is "[]", which isn't a selector.`],
							[":hover:", `is ":hover:", which isn't a selector.`],
							[":state(loading", `is ":state(loading", which isn't a selector.`],
						];
						for (const [entry, message] of rows) {
							expect(await entryError({ [setting]: [":disabled", entry] })).toEqual([
								`${setting}[1]`,
								`${setting}[1] ${message}`,
							]);
						}
					},
				);

				it("takes an attribute name for each entry of stateAttributes", async () => {
					const rows: [entry: string, message: string][] = [
						[
							'[data-mode="on"]',
							`is "[data-mode=\\"on\\"]", an attribute selector. Write the attribute name "data-mode".`,
						],
						["[data-mode]", `is "[data-mode]", an attribute selector. Write the attribute name "data-mode".`],
						[
							"[ data-mode = on ]",
							`is "[ data-mode = on ]", an attribute selector. Write the attribute name "data-mode".`,
						],
						["data-state[data-busy]", `is "data-state[data-busy]".`],
						["[data-state][data-busy]", `is "[data-state][data-busy]".`],
						[":open", `is ":open".`],
						["data state", `is "data state".`],
						["2state", `is "2state".`],
					];
					for (const [entry, message] of rows) {
						expect(await entryError({ stateAttributes: ["data-state", entry] })).toEqual([
							"stateAttributes[1]",
							`stateAttributes[1] ${message}`,
						]);
					}
				});

				it("keeps every form of one simple selector, without the space around it", async () => {
					const selectors = [
						":disabled",
						":HOVER",
						":state(loading)",
						":nth-child(2n + 1 of [data-busy])",
						":--custom",
						"[data-busy]",
						"[ data-busy ]",
						"[DATA-BUSY]",
						'[aria-disabled="true"]',
						"[aria-disabled='true']",
						"[aria-disabled=true]",
						'[aria-disabled = "true" i]',
						'[data-label="a ] b, c"]',
						'[data-label="say \\"hi\\""]',
						'[class~="busy"]',
						'[lang|="en"]',
						'[href^="#"]',
						'[href$=".pdf"]',
						'[data-tags*="new"]',
						"[data-\\:x]",
					];
					const root = await project({
						"statefulcss.config.json": JSON.stringify({
							blockingStates: [...selectors, " [inert]\t"],
							interactionStates: selectors,
							stateAttributes: ["data-state", "Data-Mode", "aria_x", " data-open "],
						}),
					});
					await expect(loadConfig(path.join(root, "button.css"))).resolves.toEqual({
						...defaults,
						blockingStates: [...selectors, "[inert]"],
						interactionStates: selectors,
						stateAttributes: ["data-state", "Data-Mode", "aria_x", "data-open"],
					});
				});
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
					componentAttribute: "Data-root",
					partAttribute: "2part",
					slotAttribute: "data_slot",
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
					  ""componentAttribute" in <root>/statefulcss.config.json must be an attribute name, like "data-component". It's "Data-root".",
					  ""partAttribute" in <root>/statefulcss.config.json must be an attribute name, like "data-part". It's "2part".",
					  ""slotAttribute" in <root>/statefulcss.config.json must be an attribute name, like "data-slot". It's "data_slot".",
					  ""themeFiles" in <root>/statefulcss.config.json must be a list of globs, like ["src/styles/themes/**"]. It's "src/themes/**".",
					  ""baseTheme" in <root>/statefulcss.config.json must be a folder name, like "default". It's ["default"].",
					  ""blockingStates" in <root>/statefulcss.config.json must be a list of pseudo-classes and attribute selectors, like [":disabled", "[aria-disabled=\\"true\\"]"]. It's ":disabled".",
					  ""interactionStates" in <root>/statefulcss.config.json must be a list of pseudo-classes and attribute selectors, like [":hover", ":focus-visible", ":active"]. It's ":hover".",
					  ""stateAttributes" in <root>/statefulcss.config.json must be a list of attribute names, like ["data-state"]. It's "data-state".",
					  ""layers" in <root>/statefulcss.config.json must be a list of layer names, like ["reset", "base", "themes", "components", "utilities"]. It's "base, components".",
					  ""strict" in <root>/statefulcss.config.json must be true or false, like true. It's "yes".",
					  ""ignoreLayers" in <root>/statefulcss.config.json must be a list of layer names, like ["base"]. It's "base".",
					]
				`);
			});

			it.each([
				["themeAttribute", "componentAttribute"],
				["themeAttribute", "partAttribute"],
				["themeAttribute", "slotAttribute"],
				["componentAttribute", "partAttribute"],
				["componentAttribute", "slotAttribute"],
				["partAttribute", "slotAttribute"],
			])("rejects a name shared by %s and %s", async (first, second) => {
				const config = JSON.stringify({ [first]: "data-shared", [second]: "data-shared" });
				const root = await project({ "statefulcss.config.json": config });
				const error = await errorFrom(root, "button.css");
				expect(error).toMatchObject({ kind: "invalid-value", key: second });
				expect(error.message).toBe(
					`"${second}" in <root>/statefulcss.config.json must differ from "${first}". Both use "data-shared". Give each setting its own attribute name.`,
				);
			});

			it("rejects an attribute name shared with a default", async () => {
				expect(
					await messageFor("package.json", '{ "statefulcss": { "partAttribute": "data-component" } }'),
				).toMatchInlineSnapshot(
					`""partAttribute" in the "statefulcss" key in <root>/package.json must differ from "componentAttribute". Both use "data-component". Give each setting its own attribute name."`,
				);
			});

			it.each(["themeAttribute", "componentAttribute", "partAttribute", "slotAttribute"])(
				"keeps data-color-scheme for the light and dark switch, not %s",
				async (setting) => {
					const config = JSON.stringify({ [setting]: "data-color-scheme" });
					const root = await project({ "statefulcss.config.json": config });
					const error = await errorFrom(root, "button.css");
					expect(error).toMatchObject({ kind: "invalid-value", key: setting });
					expect(error.message).toBe(
						`"${setting}" in <root>/statefulcss.config.json can't be "data-color-scheme". That attribute is the methodology's light and dark switch. Give this setting another attribute name.`,
					);
				},
			);

			it("rejects a malformed theme attribute name", async () => {
				expect(
					await messageFor("statefulcss.config.json", '{ "themeAttribute": "data theme" }'),
				).toMatchInlineSnapshot(
					`""themeAttribute" in <root>/statefulcss.config.json must be an attribute name, like "data-theme". It's "data theme"."`,
				);
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
