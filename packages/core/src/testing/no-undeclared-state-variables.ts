// A test-only check for `no-undeclared-state-variables` (rule 4), written as a plain function over the model. It
// proves the model can answer the rule's cases; the rule itself, with its messages, belongs to the Stylelint plugin.
import type { Node } from "postcss";

import type { Element, Id, Model, Read, Variable } from "../model.js";

export type Problem =
	/** A state variable or a private is read, and nothing in the component declares it. */
	| "undeclared"
	/** A part variable is read, and its owner doesn't declare it: the browser would take an outer component's. */
	| "not-declared-by-owner"
	/** An element reads a state variable another element of its component declares: a part reading the root's. */
	| "state-variable-of-another-element"
	/** An element reads a private that isn't named for it, without taking it with `inherit`. */
	| "private-of-another-element"
	/** A variable is written only in a variant or a state, so a nested instance would inherit that value. */
	| "no-default"
	/** A component declares a part variable that none of its variants, states or queries changes. */
	| "unchanging-part-variable"
	/** Warning: a part variable, or a private named for a part, that nothing reads. The part was probably renamed. */
	| "unread";

export interface Finding {
	readonly problem: Problem;
	readonly severity: "error" | "warning";
	readonly name: string;
	readonly node: Node;
}

export function noUndeclaredStateVariables(model: Model): Finding[] {
	const findings: Finding[] = [];
	const error = (problem: Problem, name: string, node: Node | undefined): void => {
		if (node) findings.push({ problem, severity: "error", name, node });
	};

	for (const read of model.reads) {
		if (read.via !== "var") continue;
		const node = read.declaration === undefined ? undefined : model.declarations[read.declaration]?.node;
		const source = read.source === undefined ? undefined : model.variables[read.source];

		if (read.role === "part") {
			if (!source && !rootIsElsewhere(model, read)) error("not-declared-by-owner", read.name, node);
		} else if (read.role === "state" || read.role === "private") {
			if (!source) error("undeclared", read.name, node);
			else if (source.element === read.element) continue;
			else if (read.role === "state") error("state-variable-of-another-element", read.name, node);
			else if (!isNamedFor(model, source, read.element)) error("private-of-another-element", read.name, node);
		}
	}

	for (const variable of model.variables) {
		const [first] = variable.writes;
		const node = first === undefined ? undefined : model.declarations[first]?.node;
		if (variable.role !== "state" && variable.role !== "private" && variable.role !== "part") continue;

		if (variable.default === undefined) error("no-default", variable.name, node);
		if (variable.role === "part" && variable.default !== undefined && !variable.changing)
			error("unchanging-part-variable", variable.name, node);

		// A root block whose file holds no scope for the component: its parts may be styled in another file.
		const forPart = variable.role === "part" || variable.namedFor.length > 0;
		if (forPart && variable.reads.length === 0 && hasScope(model, variable.element) && node)
			findings.push({ problem: "unread", severity: "warning", name: variable.name, node });
	}

	return findings;
}

/**
 * Whether a read sits in a scope that names its component by attribute, in a file with no root block for it: the
 * root block is in another file, so "declared by its owner" can't be checked here.
 */
function rootIsElsewhere(model: Model, read: Read): boolean {
	const block = model.blocks[read.block];
	const scope = block?.scope === undefined ? undefined : model.scopes[block.scope];
	const component = scope?.component === undefined ? undefined : model.components[scope.component];
	return scope?.rootKind === "attribute" && component?.hasRootBlock === false;
}

/** Whether a variable is named for the element that reads it: the part itself, its pseudo-element, or content under it. */
function isNamedFor(model: Model, variable: Variable, reader: Id): boolean {
	const stands = new Set<Id>();
	for (let id: Id | undefined = reader; id !== undefined && !stands.has(id);) {
		stands.add(id);
		const element: Element | undefined = model.elements[id];
		id =
			element?.kind === "pseudo-element"
				? element.host
				: element?.kind === "content"
					? element.under
					: undefined;
	}
	return variable.namedFor.some((named) => stands.has(named));
}

function hasScope(model: Model, element: Id): boolean {
	const owner = model.elements[element];
	const component =
		owner && "component" in owner && owner.component !== undefined
			? model.components[owner.component]
			: undefined;
	return (component?.scopes.length ?? 0) > 0;
}
