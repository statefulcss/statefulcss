import type { Settings } from "@statefulcss/config";
import type { Document, Root } from "postcss";

import type { Model } from "../model.js";
import { walk } from "./walk.js";

/**
 * Reads one stylesheet and describes it. A `.vue` file arrives as a Document, with one root per `<style>`.
 *
 * The passes run in order, each a pure function over what the ones before it returned, and the model is put together
 * once, here. Only the first pass exists so far, so the model holds the file, its sheets, the at-rules that aren't
 * about elements, and what core couldn't read.
 *
 * Never throws on syntax it doesn't understand, and never changes the tree.
 */
export function analyze(root: Root | Document, settings: Settings): Model {
	const walked = walk(root);
	return {
		root,
		settings,
		file: { path: root.source?.input.file, cssModule: walked.sheets.includes("module") },
		sheets: walked.sheets.map((kind) => ({ kind })),
		components: [],
		scopes: [],
		elements: [],
		blocks: [],
		guards: [],
		declarations: [],
		variables: [],
		reads: [],
		partReferences: [],
		registrations: [],
		docComments: [],
		atRules: walked.atRules,
		unknowns: walked.unknowns.map(({ node, reason, detail }) => ({ node, reason, detail, elements: [] })),
	};
}
