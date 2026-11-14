// Pass 4. Reads what each block declares: every declaration with its role, the variables its value reads, the reads
// a style query makes, and the `@property` registrations.
import type { AtRule, Node, Rule } from "postcss";

import type {
	Declaration,
	DocComment,
	Element,
	Id,
	Query,
	Read,
	Registration,
	Role,
	UnknownReason,
} from "../model.js";
import { roleOf } from "./roles.js";
import { isUnreadValue, readsOf } from "./values.js";

/** What this pass needs to know of a block. */
export interface DeclaringBlock {
	/** The rule, or the at-rule, whose own declarations are the block's. */
	readonly node: Rule | AtRule;
	readonly element: Id;
	readonly queries: readonly Query[];
}

export interface Declared {
	readonly declarations: readonly Declaration[];
	/** Every read has no `source` yet: that's the next pass's. */
	readonly reads: readonly Read[];
	readonly registrations: readonly Registration[];
	/** One list per block, in the blocks' order: the ids of its declarations. */
	readonly blockDeclarations: readonly (readonly Id[])[];
	/** Declarations whose property core can't read. */
	readonly unknowns: readonly DeclaredUnknown[];
}

export interface DeclaredUnknown {
	readonly node: Node;
	readonly reason: UnknownReason;
	readonly detail: string | undefined;
	readonly elements: readonly Id[];
}

/** Pure: it returns new data and changes nothing it's given. */
export function declarations(
	blocks: readonly DeclaringBlock[],
	elements: readonly Element[],
	docComments: readonly DocComment[],
	registrations: readonly AtRule[],
): Declared {
	// The library variables each component's doc comments name: its `@sets` and `@reads`, for the whole component.
	const libraries = new Map<Id, Set<string>>();
	for (const comment of docComments) {
		if (comment.component === undefined) continue;
		const named = libraries.get(comment.component) ?? new Set<string>();
		for (const name of [...comment.sets, ...comment.reads]) named.add(name);
		libraries.set(comment.component, named);
	}
	const roleIn = (name: string, element: Id): Role => {
		const role = roleOf(name);
		if (role !== "none") return role;
		const owner = elements[element];
		const component = owner && "component" in owner ? owner.component : undefined;
		return component !== undefined && libraries.get(component)?.has(name) ? "library" : "none";
	};

	const declared: Declaration[] = [];
	const reads: Read[] = [];
	const unknowns: DeclaredUnknown[] = [];

	const blockDeclarations = blocks.map((block, blockId): Id[] => {
		const { element } = block;
		const read = { element, block: blockId, source: undefined };

		// A style query asks about a variable, so it reads it, once for each block it's around.
		for (const query of block.queries)
			for (const { name } of query.styleQueries)
				reads.push({
					...read,
					id: reads.length,
					name,
					role: roleIn(name, element),
					via: "style-query",
					declaration: undefined,
					hasFallback: false,
					inFallback: false,
					position: "whole",
				});

		const ids: Id[] = [];
		for (const node of block.node.nodes ?? []) {
			// SCSS variables (`$gap: …`) aren't CSS declarations.
			if (node.type !== "decl" || node.prop.startsWith("$")) continue;
			const unreadable = /#\{[^}]*\}?|@\{[^}]*\}?|\$\{[^}]*\}?|\{\{[^}]*(\}\})?/.exec(node.prop);
			if (unreadable) {
				unknowns.push({ node, reason: "interpolation", detail: unreadable[0], elements: [element] });
				continue;
			}
			const custom = node.prop.startsWith("--");
			const id = declared.length;
			const valueUnread = isUnreadValue(node.value);
			const own = valueUnread ? [] : readsOf(node.value);
			const firstRead = reads.length;
			for (const one of own)
				reads.push({
					...read,
					...one,
					id: reads.length,
					role: roleIn(one.name, element),
					via: "var",
					declaration: id,
				});
			declared.push({
				id,
				node,
				block: blockId,
				property: custom ? node.prop : node.prop.toLowerCase(),
				role: custom ? roleIn(node.prop, element) : undefined,
				value: node.value,
				inherits: custom && node.value.trim().toLowerCase() === "inherit",
				valueUnread,
				reads: own.map((_, index) => firstRead + index),
			});
			ids.push(id);
		}
		return ids;
	});

	return {
		declarations: declared,
		reads,
		registrations: registrations.map(registrationOf),
		blockDeclarations,
		unknowns,
	};
}

/** `@property --t-space-2 { syntax: "<length>"; inherits: true; initial-value: 0.5rem; }` */
function registrationOf(node: AtRule): Registration {
	const descriptor = (name: string): string | undefined => {
		const found = (node.nodes ?? []).find(
			(child) => child.type === "decl" && child.prop.toLowerCase() === name,
		);
		return found?.type === "decl" ? found.value.trim() : undefined;
	};
	const name = node.params.trim();
	return {
		node,
		name,
		role: roleOf(name),
		syntax: descriptor("syntax")?.replace(/^(["'])(.*)\1$/, "$2"),
		inherits: descriptor("inherits")?.toLowerCase(),
		initialValue: descriptor("initial-value"),
	};
}
