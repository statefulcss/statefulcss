// `no-undeclared-state-variables` (rule 4): every state variable and private an element reads or changes is declared
// on that element, except what its owner declares for it; and a part variable is declared by the part's owner, only
// when the owner's variants, states or queries write it.
import type { Settings } from "@statefulcss/config";
import { namedFor } from "@statefulcss/core";
import type { Block, Declaration, Element, Id, Model, Read, Variable } from "@statefulcss/core";

import { defineRule, type Finding } from "../rule.js";

const messages = {
	undeclared: (name: string, reader: string) =>
		`Unexpected "${name}" read on ${reader} but never declared there. Declare its default in the block of ${reader}.`,
	stateOfAnother: (name: string, reader: string, owner: string) =>
		`Unexpected "${name}" read on ${reader} but declared on ${owner}. Read a part variable declared for it on ${owner}, or declare its own.`,
	privateOfAnother: (name: string, reader: string, owner: string) =>
		`Unexpected "${name}" read on ${reader} but declared on ${owner}. Take it on purpose with "${name}: inherit" in the block of ${reader}.`,
	notDeclaredByOwner: (name: string, reader: string, owner: string) =>
		`Unexpected "${name}" read on ${reader} but never declared on ${owner}, so it would come from an outer component. Declare it on ${owner} and write it in its variants or states.`,
	noDefault: (name: string, where: string, element: string) =>
		`Unexpected "${name}" changed in ${where} but never declared on ${element}. Declare its default in the block of ${element}.`,
	unchanging: (name: string, element: string, part: string) =>
		`Unexpected "${name}" declared on ${element} but never changed by its variants, states or queries. Declare the value on ${part} instead.`,
	inheritState: (name: string, element: string) =>
		`Unexpected "${name}" taken with "inherit". Only a private is taken that way, so declare its default in the block of ${element}.`,
	inheritPart: (name: string, element: string) =>
		`Unexpected "${name}" taken with "inherit". Only a private is taken that way, so remove it: ${element} reads what its owner declares without declaring it.`,
	inheritUndeclared: (name: string, element: string, owner: string) =>
		`Unexpected "${name}" taken with "inherit" on ${element} but never declared on ${owner}, so it would come from an outer component. Declare it on ${owner}, or give ${element} its own value.`,
	unread: (name: string, element: string) =>
		`Unexpected "${name}" on ${element} that no part reads. If a part was renamed, rename the variable to match.`,
};

type Key = keyof typeof messages;

export default defineRule<Record<never, never>, Key>({
	name: "no-undeclared-state-variables",
	severity: "error",
	fixable: false,
	messages,
	check(model, { settings }) {
		// One finding for each written declaration, name and reason. A selector list writes a declaration once, and
		// what its branches say is gathered first: a reason they share names every element it holds for.
		const groups = new Map<string, Finding<Key>[]>();
		const report = (declaration: Declaration, name: string, finding: Finding<Key>): void => {
			const key = `${declaration.written}\n${name}\n${finding.message}`;
			groups.set(key, [...(groups.get(key) ?? []), finding]);
		};
		const context: Context = {
			model,
			settings,
			report,
			names: namesByOwner(model),
			unknowns: unknownsByElement(model),
			takers: takersByName(model),
		};
		for (const read of model.reads) checkRead(context, read);
		for (const variable of model.variables) checkVariable(context, variable);
		return [...groups.values()].flatMap((group) => {
			const [first] = group;
			if (!first) return [];
			const args = first.args.map((_, index) => listOf(group.map((finding) => finding.args[index] ?? "")));
			return [{ ...first, args }];
		});
	},
});

interface Context {
	readonly model: Model;
	readonly settings: Settings;
	readonly report: (declaration: Declaration, name: string, finding: Finding<Key>) => void;
	/** The names each owner gives the elements it declares for. */
	readonly names: ReadonlyMap<Id, readonly Naming[]>;
	/** Where each element's unknowns sit: whether one may write a default, and whether it has any. */
	readonly unknowns: ReadonlyMap<Id, Unknowns>;
	/** The elements that take a variable with `inherit`, by its name. */
	readonly takers: ReadonlyMap<string, readonly Id[]>;
}

interface Naming {
	readonly name: string;
	readonly element: Id;
}

interface Unknowns {
	/** One sits in a block with no variant, state or query, or in a block of unknown kind, so it may write a default. */
	readonly mayDeclare: boolean;
}

/** A read of a state variable, a private or a part variable: whether its element may read it. */
function checkRead(context: Context, read: Read): void {
	const { model, settings, report } = context;
	if (read.via !== "var" || read.declaration === undefined) return;
	if (read.role !== "state" && read.role !== "private" && read.role !== "part") return;
	const reader = model.elements[read.element];
	const declaration = model.declarations[read.declaration];
	if (!reader || !declaration || skipped(reader)) return;
	const at = { node: declaration.node, part: "value" } as const;
	const name = (id: Id): string => nameOf(model, settings, id);
	const source = read.source === undefined ? undefined : model.variables[read.source];
	const own = source?.element === read.element;
	// The one element that may declare it for the reader, chosen from the reader and the name.
	const owner = ownerOf(context, read.element, read.name, read.role);
	// That owner may declare it in an unknown, or in another file when it's a root whose block is elsewhere.
	const ownerMayDeclare =
		owner !== undefined &&
		(mayDeclare(context, owner) ||
			(owner === componentOf(model, reader)?.root && rootIsElsewhere(model, read)));

	if (read.role === "part") {
		// A root's own part variables, a global element's, and content's that names no part of its own: which
		// element reads them is `part-variables`' question.
		if (owner === undefined || declares(model, owner, read.name) || ownerMayDeclare) return;
		report(declaration, read.name, {
			message: "notDeclaredByOwner",
			args: [read.name, name(read.element), name(owner)],
			at,
		});
		return;
	}

	// An unknown on the reader may declare its own.
	if (own || mayDeclare(context, read.element)) return;
	if (read.role === "state") {
		report(
			declaration,
			read.name,
			source
				? { message: "stateOfAnother", args: [read.name, name(read.element), name(source.element)], at }
				: { message: "undeclared", args: [read.name, name(read.element)], at },
		);
		return;
	}

	// A private: its owner may declare it for the reader, by the reader's name.
	if (source && source.element === owner) return;
	if (ownerMayDeclare) return;
	report(
		declaration,
		read.name,
		source
			? { message: "privateOfAnother", args: [read.name, name(read.element), name(source.element)], at }
			: { message: "undeclared", args: [read.name, name(read.element)], at },
	);
}

/** A state variable, a private or a part variable written on an element: its default, and how it's written. */
function checkVariable(context: Context, variable: Variable): void {
	const { model, settings, report } = context;
	if (variable.role !== "state" && variable.role !== "private" && variable.role !== "part") return;
	const element = model.elements[variable.element];
	if (!element || skipped(element)) return;
	const name = (id: Id): string => nameOf(model, settings, id);
	const writes = variable.writes.flatMap((id) => model.declarations[id] ?? []);
	// A write core can't classify may be a default or a change: the rule doesn't guess.
	const unclassified = writes.some((write) => model.blocks[write.block]?.kind === "unknown");
	// An unknown may write the default only from the own block; anywhere on the element, it may change it.
	const defaultUnknown = unclassified || mayDeclare(context, variable.element);
	const changeUnknown = unclassified || context.unknowns.has(variable.element);

	for (const write of writes) {
		if (!write.inherits) continue;
		if (variable.role === "private") {
			checkInherited(context, variable, write);
			continue;
		}
		report(write, variable.name, {
			message: variable.role === "state" ? "inheritState" : "inheritPart",
			args: [variable.name, name(variable.element)],
			at: { node: write.node, part: "value" },
		});
	}

	const first = writes[0];
	const fallback = variable.default === undefined ? undefined : model.declarations[variable.default];
	// A part's own part variable, not named for its pseudo-element, is `part-variables`' business, not an owner's.
	const byOwner = element.kind === "root" || variable.namedFor.length > 0;
	if (variable.default === undefined && first && !defaultUnknown) {
		const change = model.declarations[variable.changes[0] ?? first.id] ?? first;
		report(change, variable.name, {
			message: "noDefault",
			args: [variable.name, `"${whereOf(model.blocks[change.block])}"`, name(variable.element)],
			at: { node: change.node, part: "property" },
		});
	}
	// A direct write in a variant, state or query, not a value that reads a changing variable.
	if (variable.role === "part" && byOwner && fallback && variable.changes.length === 0 && !changeUnknown) {
		const [part] = variable.namedFor;
		report(fallback, variable.name, {
			message: "unchanging",
			args: [
				variable.name,
				name(variable.element),
				part === undefined ? "the part that reads it" : name(part),
			],
			at: { node: fallback.node, part: "property" },
		});
	}

	// Renaming a part: a variable named for a part that no part reads.
	const forPart =
		(variable.role === "part" && byOwner) || (variable.role === "private" && variable.namedFor.length > 0);
	const declaredAt = fallback ?? first;
	if (!forPart || !declaredAt || !partsInView(model, element, variable)) return;
	if (readByPart(context, variable) || componentHasUnknown(context, element)) return;
	report(declaredAt, variable.name, {
		message: "unread",
		args: [variable.name, name(variable.element)],
		at: { node: declaredAt.node, part: "property" },
		severity: "warning",
	});
}

/** A private taken with `inherit`: some owner of the element, in its component, must declare it. */
function checkInherited(context: Context, variable: Variable, write: Declaration): void {
	const { model, settings, report } = context;
	const element = model.elements[variable.element];
	const root = componentOf(model, element)?.root;
	const owners = ownersOf(model, variable.element);
	if (!element || root === undefined || owners.length === 0) return;
	if (owners.some((owner) => declares(model, owner, variable.name) || mayDeclare(context, owner))) return;
	const block = model.blocks[write.block];
	const scope = block?.scope === undefined ? undefined : model.scopes[block.scope];
	if (scope?.rootKind === "attribute" && componentOf(model, element)?.hasRootBlock === false) return;
	const owner = ownerOf(context, variable.element, variable.name, "private") ?? root;
	report(write, variable.name, {
		message: "inheritUndeclared",
		args: [variable.name, nameOf(model, settings, variable.element), nameOf(model, settings, owner)],
		at: { node: write.node, part: "value" },
	});
}

/**
 * Whether a part reads a variable named for it: the part it's named for, a slot, a pseudo-element of either, or
 * content under that part, reading it or taking it with `inherit`. A private also counts when the root reads it into
 * a part variable that a part reads.
 */
function readByPart(context: Context, variable: Variable, depth = 0): boolean {
	const { model } = context;
	const named = new Set(variable.namedFor);
	const counts = (reader: Id): boolean => chainOf(model, reader).some((id) => named.has(id));
	for (const id of variable.reads) {
		const read = model.reads[id];
		if (!read) continue;
		if (counts(read.element)) return true;
		if (depth > 0 || variable.role !== "private" || read.element !== variable.element) continue;
		// The root reads the private into a part variable of its own: `--p-icon-color: var(--_icon-color)`.
		const into = read.declaration === undefined ? undefined : model.declarations[read.declaration];
		if (into?.role !== "part") continue;
		const target = variableOn(model, variable.element, into.property);
		if (target && readByPart(context, target, depth + 1)) return true;
	}
	// Taken with `inherit` from this element, by an element it owns.
	return (context.takers.get(variable.name) ?? []).some(
		(taker) => counts(taker) && ownersOf(model, taker).includes(variable.element),
	);
}

/** Foreign and utility elements are no component's: the rules skip them. */
function skipped(element: Element): boolean {
	return element.kind === "foreign" || element.kind === "utility";
}

/** The component an element belongs to. */
function componentOf(model: Model, element: Element | undefined): Model["components"][number] | undefined {
	return element && "component" in element && element.component !== undefined
		? model.components[element.component]
		: undefined;
}

/**
 * The element and those it stands in: a pseudo-element's host, and the part content is under. What's named for one
 * of them is named for the element.
 */
function chainOf(model: Model, id: Id): Id[] {
	const chain: Id[] = [];
	for (let next: Id | undefined = id; next !== undefined && !chain.includes(next);) {
		chain.push(next);
		const element: Element | undefined = model.elements[next];
		next =
			element?.kind === "pseudo-element"
				? element.host
				: element?.kind === "content"
					? element.under
					: undefined;
	}
	return chain;
}

/** The elements above an element in its component: those it stands in, and its component's root. A root has none. */
function ownersOf(model: Model, id: Id): Id[] {
	const element = model.elements[id];
	if (!element || element.kind === "root" || element.kind === "global") return [];
	const owners = chainOf(model, id).slice(1);
	const root = componentOf(model, element)?.root;
	if (root !== undefined && root !== id && !owners.includes(root)) owners.push(root);
	return owners;
}

/**
 * The one element that may declare a variable for a reader, chosen from the reader and the name: the owner whose
 * name for an element the reader stands in starts the variable's name. A root names its parts, slots and own
 * pseudo-elements, and its parts' pseudo-elements as `{part}-{pseudo}`; a part names its own pseudo-elements. For a
 * part variable no owner names for the reader: a part's or a slot's is the root, a part's pseudo-element's is that
 * part, a root's pseudo-element's is the root. Content is not a part, so no owner declares part variables for it.
 */
function ownerOf(
	context: Context,
	reader: Id,
	name: string,
	role: "state" | "private" | "part",
): Id | undefined {
	const { model } = context;
	const chain = chainOf(model, reader);
	const owners = ownersOf(model, reader);
	for (const owner of owners) {
		const names = context.names.get(owner) ?? [];
		const match = namedFor(
			name,
			names.map((one) => one.name),
		);
		if (names.some((one) => one.name === match && chain.includes(one.element))) return owner;
	}
	if (role !== "part") return undefined;
	const element = model.elements[reader];
	if (element?.kind === "part" || element?.kind === "slot") return componentOf(model, element)?.root;
	if (element?.kind !== "pseudo-element") return undefined;
	const host = model.elements[element.host];
	if (host?.kind === "part" || host?.kind === "slot" || host?.kind === "root") return host.id;
	return undefined;
}

/**
 * The names each owner gives the elements it declares for, gathered once: a root names its parts, its slots and its
 * own pseudo-elements, and its parts' pseudo-elements as `{part}-{pseudo}`; a part names its own pseudo-elements.
 */
function namesByOwner(model: Model): Map<Id, Naming[]> {
	const names = new Map<Id, Naming[]>();
	const add = (owner: Id | undefined, name: string, element: Id): void => {
		if (owner !== undefined) names.set(owner, [...(names.get(owner) ?? []), { name, element }]);
	};
	for (const element of model.elements) {
		if (element.kind === "part" || element.kind === "slot")
			add(componentOf(model, element)?.root, element.name, element.id);
		if (element.kind !== "pseudo-element") continue;
		const host = model.elements[element.host];
		if (host?.kind === "root" || host?.kind === "part" || host?.kind === "slot")
			add(host.id, element.name, element.id);
		if (host?.kind === "part" || host?.kind === "slot")
			add(componentOf(model, host)?.root, `${host.name}-${element.name}`, element.id);
	}
	return names;
}

/**
 * Where each element's unknowns sit, gathered once. An unknown in a block with no variant, state or query, or in a
 * block of unknown kind, may write a default; one under a variant, state or query may only change a value there. One
 * whose block can't be found may do either.
 */
function unknownsByElement(model: Model): Map<Id, Unknowns> {
	const unknowns = new Map<Id, Unknowns>();
	for (const unknown of model.unknowns) {
		const parent = unknown.node.parent;
		for (const id of unknown.elements) {
			const blocks = (model.elements[id]?.blocks ?? [])
				.map((block) => model.blocks[block])
				.filter((block) => block !== undefined && block.node === parent);
			const mayDeclare =
				blocks.length === 0 ||
				blocks.some(
					(block) => block?.kind === "own" || block?.kind === "supports" || block?.kind === "unknown",
				);
			unknowns.set(id, { mayDeclare: (unknowns.get(id)?.mayDeclare ?? false) || mayDeclare });
		}
	}
	return unknowns;
}

/** The elements that take a variable with `inherit`, by its name, gathered once. */
function takersByName(model: Model): Map<string, Id[]> {
	const takers = new Map<string, Id[]>();
	for (const variable of model.variables) {
		const inherits = variable.writes.some((id) => model.declarations[id]?.inherits === true);
		if (inherits) takers.set(variable.name, [...(takers.get(variable.name) ?? []), variable.element]);
	}
	return takers;
}

function mayDeclare(context: Context, element: Id): boolean {
	return context.unknowns.get(element)?.mayDeclare ?? false;
}

function declares(model: Model, element: Id, name: string): boolean {
	return variableOn(model, element, name) !== undefined;
}

function variableOn(model: Model, element: Id, name: string): Variable | undefined {
	for (const id of model.elements[element]?.variables ?? []) {
		const variable = model.variables[id];
		if (variable?.name === name) return variable;
	}
	return undefined;
}

function componentHasUnknown(context: Context, element: Element): boolean {
	const elements = componentOf(context.model, element)?.elements ?? [element.id];
	return elements.some((id) => context.unknowns.has(id));
}

/**
 * A read in a scope that names its component by attribute, in a file with no root block for it: the root block is in
 * another file, so what the root declares can't be checked here.
 */
function rootIsElsewhere(model: Model, read: Read): boolean {
	const block = model.blocks[read.block];
	const scope = block?.scope === undefined ? undefined : model.scopes[block.scope];
	const component = scope?.component === undefined ? undefined : model.components[scope.component];
	return scope?.rootKind === "attribute" && component?.hasRootBlock === false;
}

/**
 * Whether the elements a variable is for are styled in this file: when it holds a scope for the component, or when
 * the variable is named only for the root's own pseudo-elements, which the root block styles. Otherwise its parts may
 * be styled in another file.
 */
function partsInView(model: Model, element: Element, variable: Variable): boolean {
	if ((componentOf(model, element)?.scopes.length ?? 0) > 0) return true;
	return (
		variable.namedFor.length > 0 &&
		variable.namedFor.every((id) => {
			const named = model.elements[id];
			return named?.kind === "pseudo-element" && named.host === variable.element;
		})
	);
}

/** Where a change is written: the block's conditions, else its queries. */
function whereOf(block: Block | undefined): string {
	if (!block) return "";
	if (block.conditions.length > 0) return block.conditions.map((condition) => condition.text).join("");
	if (block.queries.length > 0)
		return block.queries.map((query) => `@${query.name} ${query.params}`).join(" ");
	return block.selector;
}

/** Each distinct text once, joined: `a`, `a and b`, `a, b and c`. */
function listOf(texts: readonly string[]): string {
	const distinct = [...new Set(texts)];
	return distinct.length < 2
		? distinct.join("")
		: `${distinct.slice(0, -1).join(", ")} and ${distinct.at(-1) ?? ""}`;
}

/**
 * An element as a message names it: a part or a slot by its name (`part "icon"`), a part's pseudo-element on it
 * (`"::after" of part "tab"`), and anything else as its selector is written (`".link::after"`).
 */
function nameOf(model: Model, settings: Settings, id: Id): string {
	const element = model.elements[id];
	if (!element) return "the element";
	if (element.kind === "part" || element.kind === "slot") return `${element.kind} "${element.name}"`;
	if (element.kind === "pseudo-element") {
		const host = model.elements[element.host];
		if (host?.kind === "part" || host?.kind === "slot")
			return `"::${element.name}" of ${nameOf(model, settings, host.id)}`;
	}
	if (element.kind === "root") {
		const identity = componentOf(model, element)?.identity;
		if (identity?.kind === "class") return `".${identity.className}"`;
		if (identity) return `"[${settings.componentAttribute}="${identity.value}"]"`;
	}
	return `"${element.key}"`;
}
