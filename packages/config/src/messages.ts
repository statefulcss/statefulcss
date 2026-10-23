import path from "node:path";

import jsonc from "jsonc-parser";
import type * as z from "zod";

import { ConfigError } from "./config-error.js";
import { configSchema } from "./schema.js";

// Every message a config error can have. Each names the file, says what's wrong, and says or shows the fix.

export const packageJsonKey = "statefulcss";

const settingKeys = Object.keys(configSchema.shape).filter((key) => key !== "$schema");

/** A file's contents that aren't JSON (with comments and trailing commas). */
export function invalidJsonError(file: string, text: string, error: jsonc.ParseError): ConfigError {
	if (jsonc.stripComments(text).trim() === "") {
		return new ConfigError(
			"unreadable",
			`${display(file)} is empty. Write {} in it to use the defaults, or delete it.`,
			{ file },
		);
	}
	const before = text.slice(0, error.offset).split("\n");
	const line = before.length;
	const column = (before.at(-1)?.length ?? 0) + 1;
	const problem = jsonc
		.printParseErrorCode(error.error)
		.replace(/(?<=[a-z])(?=[A-Z])/g, " ")
		.toLowerCase();
	return new ConfigError(
		"unreadable",
		`Can't read ${display(file)}: ${problem} at line ${line}, column ${column}. Fix the JSON there; comments and trailing commas are allowed.`,
		{ file },
	);
}

/** A `package.json` that isn't JSON, so it's unclear whether it has the key. */
export function invalidPackageJsonError(file: string, error: unknown): ConfigError {
	return new ConfigError(
		"unreadable",
		`Can't read ${display(file)}, which is checked for a "${packageJsonKey}" key: ${reason(error)}`,
		{ file, cause: error },
	);
}

/** A file that exists but can't be read, such as one without read permission. */
export function readError(file: string, error: unknown): ConfigError {
	return new ConfigError("unreadable", `Can't read ${display(file)}: ${reason(error)}`, {
		file,
		cause: error,
	});
}

/** A JavaScript or TypeScript config that threw while it loaded. */
export function threwError(file: string, error: unknown): ConfigError {
	// A .js or .ts file in a package whose package.json says "type": "commonjs" (npm init's default) can't use
	// import or export, and Node's own message doesn't say why.
	const isCommonJs =
		error instanceof SyntaxError &&
		/Cannot use import statement outside a module|Unexpected token 'export'/.test(error.message);
	const fix = isCommonJs
		? ` Node loaded it as CommonJS, where import and export don't work: set "type": "module" in package.json, or use statefulcss.config.json or statefulcss.config.mjs.`
		: "";
	return new ConfigError(
		"unreadable",
		`Can't load ${display(file)}, because it threw an error: ${reason(error)}${fix}`,
		{ file, cause: error },
	);
}

/** A JavaScript or TypeScript config without `export default`. */
export function noDefaultExportError(file: string): ConfigError {
	return new ConfigError(
		"unreadable",
		`${display(file)} has no default export. Export the settings as its default, like export default { strict: true }.`,
		{ file },
	);
}

/** More than one config in one folder. */
export function multipleFilesError(directory: string, files: readonly string[]): ConfigError {
	const names = files.map((file) =>
		path.basename(file) === "package.json"
			? `the "${packageJsonKey}" key in package.json`
			: path.basename(file),
	);
	const others = files.length > 2 ? "the others" : "the other";
	return new ConfigError(
		"multiple-files",
		`${display(directory) || "This folder"} has more than one Stateful CSS config: ${list(names)}. Keep one and remove ${others}, so it's clear which applies.`,
		{ file: files[0] ?? directory, files },
	);
}

/** The first problem the schema found, with unknown keys first: a typo is the most likely mistake. */
export function schemaError(file: string, config: unknown, issues: readonly z.core.$ZodIssue[]): ConfigError {
	const issue = issues.find((candidate) => candidate.code === "unrecognized_keys") ?? issues[0];
	if (issue?.code === "unrecognized_keys") return unknownKeyError(file, issue.keys);

	const [setting, ...rest] = issue?.path ?? [];
	if (typeof setting !== "string") return notAnObjectError(file, config);

	const schema = configSchema.shape[setting as keyof typeof configSchema.shape];
	const meta = schema.meta();
	const examples = meta?.examples as unknown[] | undefined;
	const key = keyPath(issue?.path ?? []);
	const value = valueAt(config, issue?.path ?? []);
	const actual = rest.length === 0 ? `It's ${literal(value)}.` : `${key} is ${literal(value)}.`;
	return new ConfigError(
		"invalid-value",
		`"${setting}" in ${where(file)} must be ${String(meta?.expected)}, like ${literal(examples?.[0])}. ${actual}`,
		{ file, key },
	);
}

function unknownKeyError(file: string, keys: readonly string[]): ConfigError {
	const suggestions = keys.map((key) => ({ key, suggestion: closest(key) }));
	const allSettings = ` The settings are ${list(settingKeys)}.`;
	let message: string;
	if (suggestions.length === 1) {
		const [{ key, suggestion } = { key: "" }] = suggestions;
		message = `Unknown setting "${key}" in ${where(file)}.${suggestion ? ` Did you mean "${suggestion}"?` : allSettings}`;
	} else {
		const named = suggestions.map(({ key, suggestion }) =>
			suggestion ? `"${key}" (did you mean "${suggestion}"?)` : `"${key}"`,
		);
		const fix = suggestions.every(({ suggestion }) => suggestion) ? "" : allSettings;
		message = `Unknown settings ${list(named)} in ${where(file)}.${fix}`;
	}
	return new ConfigError("unknown-key", message, { file, key: keys[0] });
}

function notAnObjectError(file: string, config: unknown): ConfigError {
	const isModule = /\.(?:js|mjs|ts)$/.test(file);
	const message = isModule
		? `${display(file)} must export an object of settings as its default, like export default { strict: true }. It exports ${literal(config)}.`
		: path.basename(file) === "package.json"
			? `The "${packageJsonKey}" key in ${display(file)} must be an object of settings, like { "strict": true }. It's ${literal(config)}.`
			: `${display(file)} must contain an object of settings, like { "strict": true }. It's ${literal(config)}.`;
	return new ConfigError("invalid-value", message, { file });
}

/** The setting a mistyped key most likely meant, if one is close enough. */
function closest(key: string): string | undefined {
	let best: { setting: string; distance: number } | undefined;
	for (const setting of settingKeys) {
		const distance = editDistance(key.toLowerCase(), setting.toLowerCase());
		if (!best || distance < best.distance) best = { setting, distance };
	}
	return best && best.distance <= Math.max(1, Math.floor(key.length / 3)) ? best.setting : undefined;
}

/** How many single-character insertions, deletions and substitutions turn one string into the other. */
function editDistance(from: string, to: string): number {
	let previous = Array.from({ length: to.length + 1 }, (_, index) => index);
	for (let i = 1; i <= from.length; i++) {
		const current = [i];
		for (let j = 1; j <= to.length; j++) {
			const substitution = (previous[j - 1] ?? 0) + (from[i - 1] === to[j - 1] ? 0 : 1);
			current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution);
		}
		previous = current;
	}
	return previous[to.length] ?? 0;
}

/** Where a key is: the file, or the `package.json` key. */
function where(file: string): string {
	return path.basename(file) === "package.json"
		? `the "${packageJsonKey}" key in ${display(file)}`
		: display(file);
}

/** The path as people see it in their terminal: relative to where the command runs, or absolute outside it. */
export function display(file: string): string {
	const relative = path.relative(process.cwd(), file);
	return relative.startsWith("..") || path.isAbsolute(relative) ? file : relative;
}

/** `blockingStates[2]`, from Zod's `["blockingStates", 2]`. */
function keyPath(segments: readonly PropertyKey[]): string {
	return segments
		.map((segment, index) =>
			typeof segment === "number" ? `[${segment}]` : `${index === 0 ? "" : "."}${String(segment)}`,
		)
		.join("");
}

function valueAt(config: unknown, segments: readonly PropertyKey[]): unknown {
	let value = config;
	for (const segment of segments) {
		if (typeof value !== "object" || value === null) return undefined;
		value = (value as Record<PropertyKey, unknown>)[segment];
	}
	return value;
}

/** A value as it's written in a config: `[":disabled", "[inert]"]`, `true`, `"data-theme"`. */
function literal(value: unknown): string {
	if (value === undefined) return "undefined";
	if (typeof value === "function") return "a function";
	if (typeof value === "bigint" || typeof value === "symbol") return String(value);
	const text = Array.isArray(value)
		? `[${value.map(literal).join(", ")}]`
		: typeof value === "object" && value !== null
			? Object.keys(value).length === 0
				? "{}"
				: `{ ${Object.entries(value)
						.map(([key, item]) => `${JSON.stringify(key)}: ${literal(item)}`)
						.join(", ")} }`
			: JSON.stringify(value);
	return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/** `a, b and c`. */
function list(items: readonly string[]): string {
	return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** An error's message as the end of a sentence. */
function reason(error: unknown): string {
	const message = (error instanceof Error ? error.message : String(error)).trim();
	return /[.!?]$/.test(message) ? message : `${message}.`;
}
