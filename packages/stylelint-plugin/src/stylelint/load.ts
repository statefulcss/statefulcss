import path from "node:path";

import { ConfigError, findConfig, type Settings } from "@statefulcss/config";
import { analyze, type Model } from "@statefulcss/core";
import type { Document, Node, Root } from "postcss";
import type stylelint from "stylelint";

/** What the rules of one file share: its settings and core's model, or the reason there are none. */
export type Loaded =
	| {
			readonly settings: Settings;
			readonly model: Model;
			/**
			 * The file's path from the config's folder, with `/` between its folders, which `themeFiles` is matched
			 * against; undefined for code with no file.
			 */
			readonly file: string | undefined;
	  }
	/** The project's config can't be used. */
	| { readonly error: ConfigError }
	/** A fault of the plugin's own. */
	| { readonly fault: unknown };

// One entry for each lint of a file. A `.vue` file's `<style>` blocks share one result, so the whole file is
// analyzed once. The promise is kept, not its value: rules that run while the first one is still loading wait for
// the same work.
const cache = new WeakMap<object, Promise<Loaded>>();

// Core reads a copy of the tree, taken when the first Stateful CSS rule is called and before anything is awaited.
// While the settings load, Stylelint's other rules run and may fix the tree, and Stylelint places every report in
// the code it parsed for this run of the rules: the copy still is that code, so its offsets are the ones Stylelint
// wants. With `--fix`, Stylelint parses the fixed code again and runs the rules once more, with a new result, until
// a run fixes nothing; each run loads its own copy. A copied node keeps its place in the source. This maps it to the
// node of the tree Stylelint writes out.
const counterparts = new WeakMap<Node, Node>();

/** The node of Stylelint's own tree that a node of the model was copied from. A fix edits this one. */
export function liveOf<Kind extends Node>(copy: Kind): Kind | undefined {
	return counterparts.get(copy) as Kind | undefined;
}

/** The settings and the model for the file a result belongs to, loaded once. */
export function load(result: stylelint.PostcssResult): Promise<Loaded> {
	const cached = cache.get(result);
	if (cached) return cached;
	const live = result.root;
	const copy = live.clone();
	pair(copy, live);
	const loading = read(copy, result.opts?.from);
	cache.set(result, loading);
	return loading;
}

function pair(copy: Node, live: Node): void {
	counterparts.set(copy, live);
	const copies = (copy as { nodes?: Node[] }).nodes ?? [];
	const lives = (live as { nodes?: Node[] }).nodes ?? [];
	copies.forEach((child, index) => {
		const other = lives[index];
		if (other) pair(child, other);
	});
}

async function read(root: Root | Document, from: string | undefined): Promise<Loaded> {
	try {
		// Code passed as a string has no file: its settings are the working directory's.
		const file = root.source?.input.file ?? from;
		const { settings, folder } = await findConfig(file ?? path.join(process.cwd(), "stylesheet.css"));
		const relative = file === undefined ? undefined : path.relative(folder, path.resolve(file));
		return { settings, model: analyze(root, settings), file: relative?.split(path.sep).join("/") };
	} catch (error) {
		return error instanceof ConfigError ? { error } : { fault: error };
	}
}
