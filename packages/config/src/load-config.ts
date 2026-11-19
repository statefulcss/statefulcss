import { readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import jsonc from "jsonc-parser";

import { ConfigError } from "./config-error.js";
import {
	folderError,
	invalidJsonError,
	invalidPackageJsonError,
	multipleFilesError,
	noDefaultExportError,
	packageJsonKey,
	readError,
	schemaError,
	threwError,
} from "./messages.js";
import { configSchema, defaults, toSettings, type Settings } from "./schema.js";

/** The config files a folder can have, besides a `"statefulcss"` key in its `package.json`. */
const configFileNames = [
	"statefulcss.config.json",
	"statefulcss.config.js",
	"statefulcss.config.mjs",
	"statefulcss.config.ts",
] as const;

interface Folder {
	mtimeMs: number;
	configFiles: string[];
	hasPackageJson: boolean;
	isRepositoryRoot: boolean;
}

/** A config file's settings, its error, or `undefined` for a `package.json` without the key. */
type Outcome = { settings: Settings } | { error: ConfigError } | undefined;

// Both caches are checked by modification time, so a long-running process (an editor's Stylelint server) sees a
// config that was edited, added or removed without a restart. A folder's time changes when a file in it is added,
// removed or renamed; a file's time changes when it's edited.
//
// A folder's configs are found by asking for each name, never by listing the folder: a folder on the way up may
// let a path through without letting its contents be listed, such as /home on a shared machine.
const folders = new Map<string, Folder>();
const files = new Map<string, { mtimeMs: number; outcome: Promise<Outcome> }>();

/** A folder that doesn't exist: it has no config, and the search goes on above it. */
const missingFolder: Folder = {
	mtimeMs: Number.NaN,
	configFiles: [],
	hasPackageJson: false,
	isRepositoryRoot: false,
};

/** Node's CommonJS modules, which it keeps by file path. */
const commonJsModules = createRequire(import.meta.url).cache;

/** The settings for a file, and the folder its `themeFiles` patterns are matched from. */
export interface FoundConfig {
	readonly settings: Settings;
	/**
	 * The config file's folder (a `package.json`'s, for its `"statefulcss"` key). With no config, the folder the search
	 * stopped at: the repository root, or the filesystem root outside a repository.
	 */
	readonly folder: string;
}

/**
 * The settings for a file: from the nearest `statefulcss.config` (or `"statefulcss"` key in `package.json`), checked,
 * with the defaults filled in.
 *
 * The search starts in the file's folder and goes up to the repository root (the folder with `.git`), or the
 * filesystem root outside a repository. No config means the defaults.
 *
 * @throws {ConfigError} When the config can't be read or checked, or a folder has more than one.
 */
export async function loadConfig(fromPath: string): Promise<Settings> {
	return (await findConfig(fromPath)).settings;
}

/**
 * The settings for a file, as `loadConfig` gives them, with the folder of the config they came from. A file's path
 * relative to that folder is what `themeFiles` matches.
 *
 * @throws {ConfigError} When the config can't be read or checked, or a folder has more than one.
 */
export async function findConfig(fromPath: string): Promise<FoundConfig> {
	let directory = path.dirname(path.resolve(fromPath));
	for (;;) {
		const folder = await readFolder(directory);
		const found = folder.configFiles.map((name) => path.join(directory, name));
		const packageJson = path.join(directory, "package.json");
		const packageJsonOutcome = folder.hasPackageJson ? await loadFile(packageJson) : undefined;
		// A package.json that isn't JSON may or may not have the key, so it can't be skipped.
		if (
			packageJsonOutcome &&
			"error" in packageJsonOutcome &&
			packageJsonOutcome.error.kind === "unreadable"
		) {
			throw packageJsonOutcome.error;
		}
		if (packageJsonOutcome) found.push(packageJson);

		if (found.length > 1) throw multipleFilesError(directory, found);
		const [file] = found;
		// Undefined when the file was removed after the folder was read: the search goes on above it.
		const outcome = file === packageJson ? packageJsonOutcome : file && (await loadFile(file));
		if (outcome) {
			if ("error" in outcome) throw outcome.error;
			return { settings: outcome.settings, folder: directory };
		}

		const parent = path.dirname(directory);
		if (folder.isRepositoryRoot || parent === directory) return { settings: defaults, folder: directory };
		directory = parent;
	}
}

async function readFolder(directory: string): Promise<Folder> {
	const mtimeMs = await modifiedAt(directory, folderError);
	const cached = folders.get(directory);
	if (cached && cached.mtimeMs === mtimeMs) return cached;

	// Only a folder that could be read is kept. A name that can't be asked for stops the search: it may be a config.
	folders.delete(directory);
	if (Number.isNaN(mtimeMs)) return missingFolder;
	const has = async (name: string) => !Number.isNaN(await modifiedAt(path.join(directory, name), readError));
	const configFiles: string[] = [];
	for (const name of configFileNames) {
		if (await has(name)) configFiles.push(name);
	}
	const folder: Folder = {
		mtimeMs,
		configFiles,
		hasPackageJson: await has("package.json"),
		isRepositoryRoot: await has(".git"),
	};
	folders.set(directory, folder);
	return folder;
}

async function loadFile(file: string): Promise<Outcome> {
	const mtimeMs = await modifiedAt(file, readError);
	if (Number.isNaN(mtimeMs)) return undefined;
	const cached = files.get(file);
	if (cached && cached.mtimeMs === mtimeMs) return cached.outcome;

	const outcome = readConfig(file, cached ? mtimeMs : undefined).then(
		(config): Outcome => (config === undefined ? undefined : check(file, config.value)),
		(error: unknown): Outcome => {
			if (error instanceof ConfigError) return { error };
			throw error;
		},
	);
	files.set(file, { mtimeMs, outcome });
	return outcome;
}

/**
 * A config's contents, unchecked, or `undefined` for a `package.json` without the key. `reloadAt` is the edited
 * file's modification time, when an earlier version was loaded.
 */
async function readConfig(
	file: string,
	reloadAt: number | undefined,
): Promise<{ value: unknown } | undefined> {
	const name = path.basename(file);
	if (name === "package.json") return readPackageJson(file);
	if (name.endsWith(".json")) return { value: readJsonc(file, await readText(file)) };

	// Node keeps every module it has loaded, so an edited file gets its time in the URL to load it again. The first
	// load has none, which keeps the path in the config's own errors clean (and Vite, in tests, reads it as .ts).
	// A CommonJS module is kept by its path whatever the URL, so an edited file is also dropped from there.
	const url = pathToFileURL(file).href;
	if (reloadAt !== undefined) await forgetCommonJs(file);
	let module: Record<string, unknown>;
	try {
		module = (await import(reloadAt === undefined ? url : `${url}?mtime=${reloadAt}`)) as Record<
			string,
			unknown
		>;
	} catch (error) {
		throw threwError(file, error);
	}
	if (!("default" in module)) throw noDefaultExportError(file);
	return { value: module.default };
}

async function readPackageJson(file: string): Promise<{ value: unknown } | undefined> {
	const text = await readText(file);
	let manifest: unknown;
	try {
		manifest = JSON.parse(text);
	} catch (error) {
		throw invalidPackageJsonError(file, error);
	}
	if (typeof manifest !== "object" || manifest === null || !(packageJsonKey in manifest)) return undefined;
	return { value: (manifest as Record<string, unknown>)[packageJsonKey] };
}

async function readText(file: string): Promise<string> {
	try {
		return await readFile(file, "utf8");
	} catch (error) {
		throw readError(file, error);
	}
}

function readJsonc(file: string, text: string): unknown {
	const errors: jsonc.ParseError[] = [];
	const value: unknown = jsonc.parse(text, errors, { allowTrailingComma: true });
	const [error] = errors;
	if (error) throw invalidJsonError(file, text, error);
	return value;
}

function check(file: string, config: unknown): Outcome {
	const result = configSchema.safeParse(config);
	return result.success
		? { settings: toSettings(result.data) }
		: { error: schemaError(file, config, result.error.issues) };
}

/** Drops a file from Node's CommonJS modules, under the path it was loaded by: the one with symlinks resolved. */
async function forgetCommonJs(file: string): Promise<void> {
	delete commonJsModules[file];
	try {
		delete commonJsModules[await realpath(file)];
	} catch {
		// Removed since it was found: loading it reports that.
	}
}

/**
 * When a file or folder was last changed, or `NaN` when it doesn't exist. Any other failure, such as a folder
 * that lets no path through, is an error: what's there can't be seen, so the search can't go past it.
 */
async function modifiedAt(
	file: string,
	unreadable: (file: string, error: unknown) => ConfigError,
): Promise<number> {
	try {
		return (await stat(file)).mtimeMs;
	} catch (error) {
		if (isMissing(error)) return Number.NaN;
		throw unreadable(file, error);
	}
}

/** Whether a filesystem error says the path doesn't exist. */
function isMissing(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | null)?.code;
	return code === "ENOENT" || code === "ENOTDIR";
}
