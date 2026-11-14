import type { Settings } from "@statefulcss/config";
import type { Document, Root } from "postcss";

import type { Block, Model, Unknown } from "../model.js";
import { type Classified, classify, vocabularyFrom } from "./classify.js";
import { components } from "./components.js";
import { declarations } from "./declarations.js";
import { namesFrom } from "./names.js";
import { complexToString } from "./selectors.js";
import { variables } from "./variables.js";
import { walk, type WalkedBlock } from "./walk.js";

/**
 * Reads one stylesheet and describes it. A `.vue` file arrives as a Document, with one root per `<style>`.
 *
 * The passes run in order, each a pure function over what the ones before it returned, and the model is put together
 * once, here.
 *
 * Never throws on syntax it doesn't understand, and never changes the tree.
 */
export function analyze(root: Root | Document, settings: Settings): Model {
	try {
		return read(root, settings);
	} catch (error) {
		// A fault of core's own: nothing is read, and the model says so.
		const detail = error instanceof Error ? error.message : String(error);
		return {
			...empty(root, settings),
			unknowns: [{ node: root, reason: "internal", detail, elements: [] }],
		};
	}
}

function read(root: Root | Document, settings: Settings): Model {
	const vocabulary = vocabularyFrom(settings, namesFrom(settings));
	const walked = walk(root);

	// A block core fails on is left out, and recorded, so the rest of the file is still read.
	const failed: Unknown[] = [];
	const classified: { block: WalkedBlock; read: Classified }[] = [];
	for (const block of walked.blocks) {
		try {
			classified.push({ block, read: classify(block, vocabulary) });
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			failed.push({ node: block.node, reason: "internal", detail, elements: [] });
		}
	}

	const placed = components(
		{ ...walked, blocks: classified.map(({ block }) => block) },
		classified.map((one) => one.read),
		vocabulary,
	);

	const declared = declarations(
		classified.map(({ block, read }, id) => ({
			node: block.node,
			element: placed.blocks[id]?.element ?? 0,
			queries: read.queries,
		})),
		placed.elements,
		placed.docComments,
		walked.registrations,
	);

	const blocks = classified.map(({ block, read }, id): Block => {
		const place = placed.blocks[id];
		if (!place) throw new Error(`block ${id} has no element`);
		return {
			id,
			node: block.node,
			selector: complexToString(block.selector),
			element: place.element,
			reach: place.reach,
			scope: block.scope,
			scopeRoot: block.scopeRoot,
			path: read.path,
			conditions: place.conditions,
			queries: read.queries,
			guard: place.guard,
			layer: block.layer,
			declarations: declared.blockDeclarations[id] ?? [],
			...(read.kind === "state" ? { kind: "state", groups: read.groups } : { kind: read.kind }),
		};
	});

	const linked = variables(declared.declarations, declared.reads, blocks, placed.elements);

	return {
		...empty(root, settings),
		file: { path: root.source?.input.file, cssModule: walked.sheets.includes("module") },
		sheets: walked.sheets.map((kind) => ({ kind })),
		components: placed.components,
		scopes: placed.scopes,
		elements: placed.elements.map((element, id) => ({
			...element,
			variables: linked.elementVariables[id] ?? [],
		})),
		blocks,
		guards: placed.guards,
		declarations: declared.declarations,
		variables: linked.variables,
		reads: declared.reads.map((one, id) => ({ ...one, source: linked.sources[id] })),
		registrations: declared.registrations,
		partReferences: placed.partReferences,
		docComments: placed.docComments,
		atRules: walked.atRules,
		unknowns: [
			...walked.unknowns.map(({ node, reason, detail }, index) => ({
				node,
				reason,
				detail,
				elements: placed.unknownElements[index] ?? [],
			})),
			...declared.unknowns,
			...failed,
		],
	};
}

function empty(root: Root | Document, settings: Settings): Model {
	return {
		root,
		settings,
		file: { path: root.source?.input.file, cssModule: false },
		sheets: [],
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
		atRules: [],
		unknowns: [],
	};
}
