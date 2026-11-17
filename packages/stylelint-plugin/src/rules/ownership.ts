// Who owns what in one model: an element's owners, the one owner a variable's name points to for a reader, and the
// element that supplies a value past any `inherit`. Each is decided once per model and kept, so every rule reading the
// same model shares the decisions.
import { namedFor } from "@statefulcss/core";
import type { Element, Id, Model, Variable } from "@statefulcss/core";

export interface Ownership {
	/** The component an element belongs to. */
	component(element: Element | undefined): Model["components"][number] | undefined;
	/**
	 * The element and those it stands in: a pseudo-element's host, and the part content is under. What's named for
	 * one of them is named for the element.
	 */
	chain(id: Id): readonly Id[];
	/** The elements above an element in its component, nearest first: those it stands in, then its root. */
	owners(id: Id): readonly Id[];
	/**
	 * The one element that may declare a variable for a reader, chosen from the reader and the name: the owner whose
	 * name for an element the reader stands in starts the variable's name. For a part variable no owner names for the
	 * reader: a part's or a slot's is the root, a part's pseudo-element's is that part, a root's pseudo-element's is
	 * the root. Content is not a part, so no owner declares part variables for it.
	 */
	owner(reader: Id, name: string, role: "state" | "private" | "part"): Id | undefined;
	/**
	 * The owner whose name for an element the reader stands in starts the variable's name, with no fallback: the one
	 * that declares it for this reader by name. Undefined when the name is for no element in the reader's chain.
	 */
	namedOwner(reader: Id, name: string): Id | undefined;
	/**
	 * The elements an owner's name for them starts the variable's name with, by its longest matching name: the root's
	 * `tab-after` before its `tab`. Empty when the owner names none of them.
	 */
	named(owner: Id, name: string): readonly Id[];
	/** The variable of that name an element writes. */
	variable(element: Id, name: string): Variable | undefined;
	/**
	 * The variable that supplies a value: the variable itself, or, when every write of it is `inherit`, the nearest
	 * owner's variable of that name, past any `inherit` there too. Undefined when no owner declares it.
	 */
	supplier(variable: Variable): Variable | undefined;
	/** What an `inherit` on this variable takes: the nearest owner's variable of that name, past any `inherit`. */
	taken(variable: Variable): Variable | undefined;
	/**
	 * The elements a variable supplies a value to: each one that reads it, past any `inherit` on the way, and each
	 * one that takes it with `inherit`.
	 */
	consumers(variable: Variable): readonly Consumer[];
}

export interface Consumer {
	readonly element: Id;
	/** The read, or undefined for an element that takes it with `inherit`. */
	readonly read: Id | undefined;
}

const cache = new WeakMap<Model, Ownership>();

/** The ownership decisions for a model, made once. */
export function ownershipOf(model: Model): Ownership {
	const cached = cache.get(model);
	if (cached) return cached;
	const ownership = build(model);
	cache.set(model, ownership);
	return ownership;
}

interface Names {
	readonly names: readonly string[];
	/** The elements each name is given to. */
	readonly elements: ReadonlyMap<string, readonly Id[]>;
}

function build(model: Model): Ownership {
	const component = (element: Element | undefined): Model["components"][number] | undefined =>
		element && "component" in element && element.component !== undefined
			? model.components[element.component]
			: undefined;

	const chains = new Map<Id, readonly Id[]>();
	const chain = (id: Id): readonly Id[] => {
		const known = chains.get(id);
		if (known) return known;
		const ids: Id[] = [];
		for (let next: Id | undefined = id; next !== undefined && !ids.includes(next);) {
			ids.push(next);
			const element: Element | undefined = model.elements[next];
			next =
				element?.kind === "pseudo-element"
					? element.host
					: element?.kind === "content"
						? element.under
						: undefined;
		}
		chains.set(id, ids);
		return ids;
	};

	const ownersById = new Map<Id, readonly Id[]>();
	const owners = (id: Id): readonly Id[] => {
		const known = ownersById.get(id);
		if (known) return known;
		const element = model.elements[id];
		const ids: Id[] = [];
		if (element && element.kind !== "root" && element.kind !== "global") {
			ids.push(...chain(id).slice(1));
			const root = component(element)?.root;
			if (root !== undefined && root !== id && !ids.includes(root)) ids.push(root);
		}
		ownersById.set(id, ids);
		return ids;
	};

	const names = namesByOwner(model, component);
	const variables = new Map<Id, Map<string, Variable>>();
	for (const variable of model.variables) {
		const byName = variables.get(variable.element) ?? new Map<string, Variable>();
		if (!byName.has(variable.name)) byName.set(variable.name, variable);
		variables.set(variable.element, byName);
	}
	const variable = (element: Id, name: string): Variable | undefined => variables.get(element)?.get(name);

	const named = (owner: Id, name: string): readonly Id[] => {
		const given = names.get(owner);
		const match = given && namedFor(name, given.names);
		return (match !== undefined && given?.elements.get(match)) || [];
	};

	// One decision for each reader and name: the owner whose name for the reader starts the variable's name.
	const namedOwners = new Map<string, Id | undefined>();
	const namedOwner = (reader: Id, name: string): Id | undefined => {
		const key = `${reader}\n${name}`;
		if (namedOwners.has(key)) return namedOwners.get(key);
		const readerChain = chain(reader);
		const found = owners(reader).find((owner) => named(owner, name).some((id) => readerChain.includes(id)));
		namedOwners.set(key, found);
		return found;
	};

	const owner = (reader: Id, name: string, role: "state" | "private" | "part"): Id | undefined => {
		const found = namedOwner(reader, name);
		if (found !== undefined || role !== "part") return found;
		const element = model.elements[reader];
		if (element?.kind === "part" || element?.kind === "slot") return component(element)?.root;
		if (element?.kind !== "pseudo-element") return undefined;
		const host = model.elements[element.host];
		if (host?.kind === "part" || host?.kind === "slot" || host?.kind === "root") return host.id;
		return undefined;
	};

	const passesThrough = (one: Variable): boolean =>
		one.writes.length > 0 && one.writes.every((id) => model.declarations[id]?.inherits === true);

	const suppliers = new Map<Id, Variable | undefined>();
	const taken = (one: Variable): Variable | undefined => {
		for (const above of owners(one.element)) {
			const up = variable(above, one.name);
			if (up) return supplier(up);
		}
		return undefined;
	};
	const supplier = (one: Variable): Variable | undefined => {
		if (suppliers.has(one.id)) return suppliers.get(one.id);
		const found = passesThrough(one) ? taken(one) : one;
		suppliers.set(one.id, found);
		return found;
	};

	let consumersById: Map<Id, Consumer[]> | undefined;
	const consumers = (one: Variable): readonly Consumer[] => {
		if (!consumersById) {
			consumersById = new Map();
			const add = (to: Variable | undefined, consumer: Consumer): void => {
				if (to && consumersById) consumersById.set(to.id, [...(consumersById.get(to.id) ?? []), consumer]);
			};
			for (const read of model.reads) {
				const source = read.source === undefined ? undefined : model.variables[read.source];
				if (source) add(supplier(source), { element: read.element, read: read.id });
			}
			for (const taker of model.variables) {
				const inherits = taker.writes.some((id) => model.declarations[id]?.inherits === true);
				if (inherits) add(taken(taker), { element: taker.element, read: undefined });
			}
		}
		return consumersById.get(one.id) ?? [];
	};

	return { component, chain, owners, owner, namedOwner, named, variable, supplier, taken, consumers };
}

/**
 * The names each owner gives the elements it declares for: a root names its parts, its slots and its own
 * pseudo-elements, and its parts' pseudo-elements as `{part}-{pseudo}`; a part names its own pseudo-elements.
 */
function namesByOwner(
	model: Model,
	component: (element: Element | undefined) => Model["components"][number] | undefined,
): Map<Id, Names> {
	const given = new Map<Id, Map<string, Id[]>>();
	const add = (owner: Id | undefined, name: string, element: Id): void => {
		if (owner === undefined) return;
		const byName = given.get(owner) ?? new Map<string, Id[]>();
		byName.set(name, [...(byName.get(name) ?? []), element]);
		given.set(owner, byName);
	};
	for (const element of model.elements) {
		if (element.kind === "part" || element.kind === "slot")
			add(component(element)?.root, element.name, element.id);
		if (element.kind !== "pseudo-element") continue;
		const host = model.elements[element.host];
		if (host?.kind === "root" || host?.kind === "part" || host?.kind === "slot")
			add(host.id, element.name, element.id);
		if (host?.kind === "part" || host?.kind === "slot")
			add(component(host)?.root, `${host.name}-${element.name}`, element.id);
	}
	return new Map(
		[...given].map(([owner, byName]) => [owner, { names: [...byName.keys()], elements: byName }]),
	);
}
