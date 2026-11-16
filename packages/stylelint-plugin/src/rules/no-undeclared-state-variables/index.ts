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
		`Unexpected "${name}" read on ${reader}, where ${owner} declares it. Read a part variable that ${owner} declares for it, or declare its own.`,
	privateOfAnother: (name: string, reader: string, owner: string) =>
		`Unexpected "${name}" read on ${reader}, where ${owner} declares it. Take it on purpose with "${name}: inherit" in the block of ${reader}.`,
	notDeclaredByOwner: (name: string, reader: string, owner: string) =>
		`Unexpected "${name}" read on ${reader} but never declared on ${owner}, so it would come from an outer component. Declare it on ${owner} and write it in its variants or states.`,
	noDefault: (name: string, where: string, element: string) =>
		`Unexpected "${name}" changed in "${where}" but never declared on ${element}. Declare its default in the block of ${element}.`,
	unchanging: (name: string, element: string, part: string) =>
		`Unexpected "${name}" declared on ${element} but never changed by its variants, states or queries. Declare the value on ${part} instead.`,
	inheritState: (name: string, element: string) =>
		`Unexpected "${name}" taken with "inherit". Only a private is taken that way, so declare its default in the block of ${element}.`,
	inheritPart: (name: string, element: string) =>
		`Unexpected "${name}" taken with "inherit". Only a private is taken that way, so remove it: ${element} reads what its owner declares without declaring it.`,
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
		const findings: Finding<Key>[] = [];
		// One finding for each written declaration, name and problem: a selector list writes a declaration once.
		const seen = new Set<string>();
		const report = (declaration: Declaration, name: string, finding: Finding<Key>): void => {
			const key = `${declaration.written}\n${name}\n${finding.message}`;
			if (seen.has(key)) return;
			seen.add(key);
			findings.push(finding);
		};
		const context: Context = { model, settings, report };
		for (const read of model.reads) checkRead(context, read);
		for (const variable of model.variables) checkVariable(context, variable);
		return findings;
	},
});

interface Context {
	readonly model: Model;
	readonly settings: Settings;
	readonly report: (declaration: Declaration, name: string, finding: Finding<Key>) => void;
}

/** A read of a state variable, a private or a part variable: whether its element may read it. */
function checkRead({ model, settings, report }: Context, read: Read): void {
	if (read.via !== "var" || read.declaration === undefined) return;
	if (read.role !== "state" && read.role !== "private" && read.role !== "part") return;
	const reader = model.elements[read.element];
	const declaration = model.declarations[read.declaration];
	if (!reader || !declaration || skipped(reader)) return;
	const at = { node: declaration.node, part: "value" } as const;
	const name = (id: Id): string => nameOf(model, settings, id);
	const source = read.source === undefined ? undefined : model.variables[read.source];
	const own = source?.element === read.element;

	if (read.role === "part") {
		// A root's own part variables, and a global element's, are which part reads them: `part-variables` asks that.
		const owners = ownersOf(model, read.element);
		if (owners.length === 0) return;
		const declared = owners.some((owner) => declares(model, owner, read.name));
		// An unknown on an owner may declare it; one inside the reader can't, since a part never declares its own.
		if (declared || owners.some((owner) => hasUnknown(model, owner)) || rootIsElsewhere(model, read)) return;
		const owner = ownerFor(model, read.element, read.name);
		report(declaration, read.name, {
			message: "notDeclaredByOwner",
			args: [read.name, name(read.element), name(owner)],
			at,
		});
		return;
	}

	// An unknown on the reader may declare its own.
	if (own || hasUnknown(model, read.element)) return;
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
	const owners = namingOwners(model, read.element, read.name);
	if (source && owners.includes(source.element)) return;
	if (source) {
		report(declaration, read.name, {
			message: "privateOfAnother",
			args: [read.name, name(read.element), name(source.element)],
			at,
		});
		return;
	}
	// The owner that would declare it may do so in an unknown, or in another file.
	if (owners.some((owner) => hasUnknown(model, owner)) || (owners.length > 0 && rootIsElsewhere(model, read)))
		return;
	report(declaration, read.name, { message: "undeclared", args: [read.name, name(read.element)], at });
}

/** A state variable, a private or a part variable written on an element: its default, and how it's written. */
function checkVariable({ model, settings, report }: Context, variable: Variable): void {
	if (variable.role !== "state" && variable.role !== "private" && variable.role !== "part") return;
	const element = model.elements[variable.element];
	if (!element || skipped(element)) return;
	const name = (id: Id): string => nameOf(model, settings, id);
	const writes = variable.writes.flatMap((id) => model.declarations[id] ?? []);
	// A write core can't classify may be a default or a change: the rule doesn't guess.
	const unclassified =
		hasUnknown(model, variable.element) ||
		writes.some((write) => model.blocks[write.block]?.kind === "unknown");

	for (const write of writes) {
		if (!write.inherits || variable.role === "private") continue;
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
	if (variable.default === undefined && first && !unclassified) {
		const change = model.declarations[variable.changes[0] ?? first.id] ?? first;
		report(change, variable.name, {
			message: "noDefault",
			args: [variable.name, whereOf(model.blocks[change.block]), name(variable.element)],
			at: { node: change.node, part: "property" },
		});
	}
	// A direct write in a variant, state or query, not a value that reads a changing variable.
	if (variable.role === "part" && byOwner && fallback && variable.changes.length === 0 && !unclassified) {
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

	// Renaming a part: a variable named for a part that no part reads. The root's own reads don't count.
	const forPart =
		(variable.role === "part" && byOwner) || (variable.role === "private" && variable.namedFor.length > 0);
	const declaredAt = fallback ?? first;
	if (!forPart || !declaredAt || !inScopeHere(model, element)) return;
	const readers = variable.reads.flatMap((id) => model.reads[id]?.element ?? []);
	const read =
		variable.role === "part" ? readers.some((reader) => reader !== variable.element) : readers.length > 0;
	if (read || componentHasUnknown(model, element)) return;
	report(declaredAt, variable.name, {
		message: "unread",
		args: [variable.name, name(variable.element)],
		at: { node: declaredAt.node, part: "property" },
		severity: "warning",
	});
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

/**
 * The elements that may declare variables for an element: those it stands in, and its component's root. A root owns
 * its parts, its slots and its own pseudo-elements; a part owns its pseudo-elements. A root itself has none.
 */
function ownersOf(model: Model, id: Id): Id[] {
	const element = model.elements[id];
	if (!element || element.kind === "root" || element.kind === "global") return [];
	const owners = chainOf(model, id).slice(1);
	const root = componentOf(model, element)?.root;
	if (root !== undefined && root !== id && !owners.includes(root)) owners.push(root);
	return owners;
}

/** The owner a part variable's message names: a part for its own pseudo-element's, else the root. */
function ownerFor(model: Model, reader: Id, name: string): Id {
	const owners = ownersOf(model, reader);
	const element = model.elements[reader];
	if (element?.kind === "pseudo-element" && namedFor(name, [element.name]) !== undefined)
		return owners[0] ?? reader;
	return owners.at(-1) ?? reader;
}

function declares(model: Model, element: Id, name: string): boolean {
	return (model.elements[element]?.variables ?? []).some((id) => model.variables[id]?.name === name);
}

/**
 * The names each owner gives the elements it declares for: a root names its parts, its slots and its own
 * pseudo-elements, and its parts' pseudo-elements as `{part}-{pseudo}`; a part names its own pseudo-elements.
 */
function namesBy(model: Model, owner: Id): { name: string; element: Id }[] {
	const names: { name: string; element: Id }[] = [];
	for (const element of model.elements) {
		if ((element.kind === "part" || element.kind === "slot") && componentOf(model, element)?.root === owner)
			names.push({ name: element.name, element: element.id });
		if (element.kind !== "pseudo-element") continue;
		const host = model.elements[element.host];
		if (element.host === owner) names.push({ name: element.name, element: element.id });
		else if (host?.kind === "part" && componentOf(model, host)?.root === owner)
			names.push({ name: `${host.name}-${element.name}`, element: element.id });
	}
	return names;
}

/**
 * The owners that name a private for the reader: the longest name it starts with is the reader's, or the name of an
 * element the reader stands in. A part's pseudo-element may read the private named for its host part.
 */
function namingOwners(model: Model, reader: Id, name: string): Id[] {
	const chain = chainOf(model, reader);
	return ownersOf(model, reader).filter((owner) => {
		const names = namesBy(model, owner);
		const match = namedFor(
			name,
			names.map((one) => one.name),
		);
		return names.some((one) => one.name === match && chain.includes(one.element));
	});
}

function hasUnknown(model: Model, element: Id): boolean {
	return model.unknowns.some((unknown) => unknown.elements.includes(element));
}

function componentHasUnknown(model: Model, element: Element): boolean {
	const elements = componentOf(model, element)?.elements ?? [element.id];
	return elements.some((id) => hasUnknown(model, id));
}

/**
 * A read in a scope that names its component by attribute, in a file with no root block for it: the root block is in
 * another file, so what the owner declares can't be checked here.
 */
function rootIsElsewhere(model: Model, read: Read): boolean {
	const block = model.blocks[read.block];
	const scope = block?.scope === undefined ? undefined : model.scopes[block.scope];
	const component = scope?.component === undefined ? undefined : model.components[scope.component];
	return scope?.rootKind === "attribute" && component?.hasRootBlock === false;
}

/** A root block whose file holds no scope for its component: its parts may be styled in another file. */
function inScopeHere(model: Model, element: Element): boolean {
	return (componentOf(model, element)?.scopes.length ?? 0) > 0;
}

/** Where a change is written: the block's conditions, else its queries. */
function whereOf(block: Block | undefined): string {
	if (!block) return "";
	if (block.conditions.length > 0) return block.conditions.map((condition) => condition.text).join("");
	if (block.queries.length > 0)
		return block.queries.map((query) => `@${query.name} ${query.params}`).join(" ");
	return block.selector;
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
