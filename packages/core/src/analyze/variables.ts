// Pass 5. Makes the variables: one for each custom property on each element, with its writes and its default, the
// elements it's named for, the reads that reach it, and whether it's changing.
import type { BlockKind, Declaration, Element, Id, Read, Variable } from "../model.js";
import { rolePrefixes } from "./roles.js";

export interface Linked {
	readonly variables: readonly Variable[];
	/** One per read, in the reads' order: the variable it reaches. */
	readonly sources: readonly (Id | undefined)[];
	/** One list per element, in the elements' order: the variables its blocks write. */
	readonly elementVariables: readonly (readonly Id[])[];
}

/** What this pass needs to know of a block. */
export interface WritingBlock {
	readonly element: Id;
	readonly kind: BlockKind;
}

/** Pure: it returns new data and changes nothing it's given. */
export function variables(
	declarations: readonly Declaration[],
	reads: readonly Read[],
	blocks: readonly WritingBlock[],
	elements: readonly Element[],
): Linked {
	// One variable for each custom property on each element, in the order the file first writes it
	const ids = new Map<string, Id>();
	const drafts: { name: string; role: Variable["role"]; element: Id; writes: Id[] }[] = [];
	for (const declaration of declarations) {
		const block = blocks[declaration.block];
		if (declaration.role === undefined || !block) continue;
		const key = `${block.element} ${declaration.property}`;
		let id = ids.get(key);
		if (id === undefined) {
			id =
				drafts.push({
					name: declaration.property,
					role: declaration.role,
					element: block.element,
					writes: [],
				}) - 1;
			ids.set(key, id);
		}
		drafts[id]?.writes.push(declaration.id);
	}
	const kindOf = (declaration: Id): BlockKind | undefined => {
		const block = declarations[declaration]?.block;
		return block === undefined ? undefined : blocks[block]?.kind;
	};

	// Each read reaches the nearest variable of that name: the element's own, else its owner's, up to the root
	const roots = new Map<Id, Id>();
	for (const element of elements) if (element.kind === "root") roots.set(element.component, element.id);
	const ownerOf = (element: Element): Id | undefined => {
		if (element.kind === "pseudo-element") return element.host;
		if (element.kind === "content") return element.under ?? roots.get(element.component);
		if (element.kind === "part" || element.kind === "slot") return roots.get(element.component);
		return undefined;
	};
	const sources = reads.map((read): Id | undefined => {
		// Tokens and component variables come from outside the component.
		if (read.role === "token" || read.role === "component") return undefined;
		const seen = new Set<Id>();
		for (let id: Id | undefined = read.element; id !== undefined && !seen.has(id);) {
			seen.add(id);
			const found = ids.get(`${id} ${read.name}`);
			if (found !== undefined) return found;
			const element: Element | undefined = elements[id];
			id = element && ownerOf(element);
		}
		return undefined;
	});
	const readsOf = drafts.map((): Id[] => []);
	for (const [read, source] of sources.entries()) if (source !== undefined) readsOf[source]?.push(read);

	// Changing: a variant or a state writes it, or its value reads a variable that is. Repeated until nothing changes.
	const changes = drafts.map((draft) =>
		draft.writes.filter((write) => kindOf(write) === "variant" || kindOf(write) === "state"),
	);
	const changing = changes.map((own) => own.length > 0);
	for (let grew = true; grew;) {
		grew = false;
		for (const [id, draft] of drafts.entries()) {
			if (changing[id]) continue;
			const readsChanging = draft.writes.some((write) =>
				declarations[write]?.reads.some((read) => {
					const source = sources[read];
					return source !== undefined && changing[source] === true;
				}),
			);
			if (readsChanging) grew = changing[id] = true;
		}
	}

	const named = namesOf(elements, roots);
	return {
		variables: drafts.map((draft, id): Variable => {
			const candidates =
				(draft.role === "part" || draft.role === "private" ? named.get(draft.element) : undefined) ?? [];
			const match = namedFor(
				draft.name,
				candidates.map((candidate) => candidate.name),
			);
			return {
				id,
				...draft,
				default: draft.writes.find((write) => kindOf(write) === "own" || kindOf(write) === "supports"),
				changes: changes[id] ?? [],
				changing: changing[id] ?? false,
				namedFor: candidates
					.filter((candidate) => candidate.name === match)
					.map((candidate) => candidate.element),
				reads: readsOf[id] ?? [],
			};
		}),
		sources,
		elementVariables: elements.map((element) =>
			drafts.flatMap((draft, id) => (draft.element === element.id ? [id] : [])),
		),
	};
}

interface Named {
	readonly name: string;
	readonly element: Id;
}

/**
 * The names an element may start a variable's name with. A component root names its parts, its slots and its own
 * pseudo-elements, and its parts' pseudo-elements as `{part}-{pseudo}`; a part names its own pseudo-elements.
 */
function namesOf(elements: readonly Element[], roots: ReadonlyMap<Id, Id>): Map<Id, Named[]> {
	const names = new Map<Id, Named[]>();
	const add = (owner: Id | undefined, name: string, element: Id): void => {
		if (owner === undefined) return;
		names.set(owner, [...(names.get(owner) ?? []), { name, element }]);
	};
	for (const element of elements) {
		if (element.kind === "part" || element.kind === "slot")
			add(roots.get(element.component), element.name, element.id);
		if (element.kind !== "pseudo-element") continue;
		const host = elements[element.host];
		if (host?.kind === "root") add(host.id, element.name, element.id);
		if (host?.kind !== "part") continue;
		add(host.id, element.name, element.id);
		add(roots.get(host.component), `${host.name}-${element.name}`, element.id);
	}
	return names;
}

/**
 * The longest of `names` that starts a variable's name, after its role prefix: `tab-list` for `--p-tab-list-gap`
 * among `tab` and `tab-list`. Undefined when none does.
 */
export function namedFor(variable: string, names: readonly string[]): string | undefined {
	const prefix = Object.values(rolePrefixes).find((one) => variable.startsWith(one)) ?? "--";
	const rest = variable.slice(prefix.length);
	return names
		.filter((name) => name !== "" && (rest === name || rest.startsWith(`${name}-`)))
		.reduce<string | undefined>(
			(longest, name) => (longest === undefined || name.length > longest.length ? name : longest),
			undefined,
		);
}
