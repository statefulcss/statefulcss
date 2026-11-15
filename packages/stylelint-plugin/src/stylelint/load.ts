import path from "node:path";

import { ConfigError, loadConfig, type Settings } from "@statefulcss/config";
import { analyze, type Model } from "@statefulcss/core";
import type { Document, Root } from "postcss";
import type stylelint from "stylelint";

/** What the rules of one file share: its settings and core's model, or the reason there are none. */
export type Loaded =
	| { readonly settings: Settings; readonly model: Model }
	/** The project's config can't be used. */
	| { readonly error: ConfigError }
	/** A fault of the plugin's own. */
	| { readonly fault: unknown };

// One entry for each file Stylelint lints. A `.vue` file's `<style>` blocks share one result, whose root is the
// Document, so the whole file is analyzed once. The promise is kept, not its value: rules that run while the first
// one is still loading wait for the same work.
const cache = new WeakMap<Root | Document, Promise<Loaded>>();

/** The settings and the model for the file a result belongs to, loaded once. */
export function load(result: stylelint.PostcssResult): Promise<Loaded> {
	const root = result.root;
	const cached = cache.get(root);
	if (cached) return cached;
	const loading = read(root, result.opts?.from);
	cache.set(root, loading);
	return loading;
}

async function read(root: Root | Document, from: string | undefined): Promise<Loaded> {
	try {
		// Code passed as a string has no file: its settings are the working directory's.
		const file = root.source?.input.file ?? from ?? path.join(process.cwd(), "stylesheet.css");
		const settings = await loadConfig(file);
		return { settings, model: analyze(root, settings) };
	} catch (error) {
		return error instanceof ConfigError ? { error } : { fault: error };
	}
}
