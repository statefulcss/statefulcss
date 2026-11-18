// `bind-through-state-variables` (rule 6): every change flows through a variable. A property never reads a private that
// a variant or a state changes; it reads its state variable, whose default reads the private. And a variable a variant
// writes is never written by a state too.
import type { Block, Declaration, Element, Id, Model, Variable } from "@statefulcss/core";

import { listOf, nameOf } from "../names.js";
import { ownershipOf } from "../ownership.js";
import { defineRule, type Finding } from "../rule.js";

const messages = {
	changingPrivate: (property: string, name: string, place: string, variable: string, owner: string) =>
		`Unexpected "${property}" reading "${name}", which changes in ${place}. Move this value into the default of "${variable}" on ${owner}, and read "var(${variable})" instead.`,
	changingChain: (
		property: string,
		name: string,
		chain: string,
		place: string,
		variable: string,
		owner: string,
	) =>
		`Unexpected "${property}" reading "${name}", which reads ${chain}, which changes in ${place}. Move this value into the default of "${variable}" on ${owner}, and read "var(${variable})" instead.`,
	variantAndState: (variable: string, variant: string, states: string, name: string) =>
		`Unexpected "${variable}" written by the variant ${variant} while a state writes it too, in ${states}. Set "${name}" in the variant instead, and give "${variable}" the default "var(${name})".`,
	combinationAndState: (
		variable: string,
		combination: string,
		states: string,
		variant: string,
		state: string,
	) =>
		`Unexpected "${variable}" written by ${combination}, a variant combined with a state, while another state writes it too, in ${states}. Set a private in ${variant} instead, and let ${state} set "${variable}" from it.`,
};

type Key = keyof typeof messages;

/** What a finding says before its branches are joined. */
interface Said {
	readonly message: Key;
	readonly args: readonly string[];
	readonly at: Finding<Key>["at"];
}

export default defineRule<Record<never, never>, Key>({
	name: "bind-through-state-variables",
	severity: "error",
	fixable: false,
	messages,
	check(model, { settings }) {
		const name = (id: Id): string => nameOf(model, settings, id);
		const ownership = ownershipOf(model);

		// One finding for each written declaration, name, message and binding: a selector list is reported once for each
		// variable it binds, so each binding keeps its own instruction.
		const groups = new Map<string, Said[]>();
		const report = (declaration: Declaration, key: string, said: Said): void => {
			const group = groups.get(`${declaration.written}\n${key}\n${said.message}`);
			if (group) group.push(said);
			else groups.set(`${declaration.written}\n${key}\n${said.message}`, [said]);
		};

		// A property reading a changing private.
		for (const declaration of model.declarations) {
			if (declaration.role !== undefined || declaration.property.includes("#{")) continue;
			const block = model.blocks[declaration.block];
			const element = block && model.elements[block.element];
			if (!element || skipped(model, element)) continue;
			for (const readId of declaration.reads) {
				const read = model.reads[readId];
				if (read?.role !== "private" || read.via !== "var" || read.source === undefined) continue;
				const source = model.variables[read.source];
				if (!source?.changing) continue;
				const supplier = ownership.supplier(source) ?? source;
				const change = changeOf(model, source);
				if (!change) continue;
				const binding = bindingOf(model, element, supplier.element, declaration.property);
				const place = listOf(change.blocks.map((one) => placeText(one)));
				const at = { node: declaration.node, part: "value" } as const;
				report(
					declaration,
					`${read.name}\n${binding.variable}`,
					change.chain.length === 0
						? {
								message: "changingPrivate",
								args: [declaration.property, read.name, place, binding.variable, name(binding.owner)],
								at,
							}
						: {
								message: "changingChain",
								args: [
									declaration.property,
									read.name,
									change.chain.map((one) => `"${one}"`).join(", which reads "),
									place,
									binding.variable,
									name(binding.owner),
								],
								at,
							},
				);
			}
		}

		// A variable a variant writes, which a state writes too.
		for (const variable of model.variables) {
			if (variable.role !== "state" && variable.role !== "part") continue;
			const element = model.elements[variable.element];
			if (!element || skipped(model, element)) continue;
			const variants: [Declaration, Block][] = [];
			const states: Block[] = [];
			for (const id of variable.writes) {
				const declaration = model.declarations[id];
				const block = declaration && model.blocks[declaration.block];
				if (!block || block.kind === "own" || block.kind === "supports" || block.kind === "unknown") continue;
				if (block.kind === "state" && block.groups.includes("visited")) continue;
				if (block.conditions.some((condition) => condition.kind === "variant"))
					variants.push([declaration, block]);
				else if (block.kind === "state") states.push(block);
			}
			if (states.length === 0) continue;
			const statesText = listOf(states.map((block) => placeText(block)));
			// `--s-x` and `--p-x` both become `--_x`.
			const privateName = `--_${variable.name.slice("--s-".length)}`;
			for (const [declaration, block] of variants) {
				const at = { node: declaration.node, part: "property" } as const;
				const state = block.conditions.filter((condition) => condition.kind === "state");
				report(
					declaration,
					variable.name,
					state.length === 0
						? {
								message: "variantAndState",
								args: [variable.name, placeText(block), statesText, privateName],
								at,
							}
						: {
								message: "combinationAndState",
								args: [
									variable.name,
									placeText(block),
									statesText,
									`"${textOf(block.conditions.filter((condition) => condition.kind === "variant"))}"`,
									`"${textOf(state)}"`,
								],
								at,
							},
				);
			}
		}

		return [...groups.values()].flatMap((group) => {
			const [first] = group;
			if (!first) return [];
			const args = first.args.map((_, index) => listOf(group.map((one) => one.args[index] ?? "")));
			return [{ message: first.message, args, at: first.at }];
		});
	},
});

/**
 * Elements the rule doesn't judge: a utility, what `:deep()` or `:global()` selects, and a theme scope, which holds
 * tokens. A pseudo-element goes with its host.
 */
function skipped(model: Model, element: Element): boolean {
	if (element.kind === "utility" || element.kind === "foreign") return true;
	if (element.kind === "global") return element.themeScope !== undefined;
	if (element.kind === "pseudo-element") {
		const host = model.elements[element.host];
		return host === undefined || skipped(model, host);
	}
	return false;
}

/**
 * Where a changing variable changes: its own variant and state blocks, or, when it has none, those of the first
 * changing variable it reads or takes with `inherit`, with the names read on the way. Undefined when no change is found
 * (a loop of reads).
 */
function changeOf(
	model: Model,
	variable: Variable,
	seen: Set<Id> = new Set(),
): { blocks: Block[]; chain: string[] } | undefined {
	if (seen.has(variable.id)) return undefined;
	seen.add(variable.id);
	const blocks = variable.changes.flatMap((id) => {
		const declaration = model.declarations[id];
		const block = declaration && model.blocks[declaration.block];
		return block ? [block] : [];
	});
	if (blocks.length > 0) return { blocks, chain: [] };
	const ownership = ownershipOf(model);
	for (const id of variable.writes) {
		const declaration = model.declarations[id];
		if (!declaration) continue;
		if (declaration.inherits) {
			const taken = ownership.taken(variable);
			const found = taken && changeOf(model, taken, seen);
			if (found) return found;
			continue;
		}
		for (const readId of declaration.reads) {
			const read = model.reads[readId];
			const source = read?.source === undefined ? undefined : model.variables[read.source];
			if (!read || !source?.changing) continue;
			const found = changeOf(model, source, seen);
			if (found) return { blocks: found.blocks, chain: [read.name, ...found.chain] };
		}
	}
	return undefined;
}

/** Conditions as a selector writes them, one after another. */
function textOf(conditions: Block["conditions"]): string {
	return conditions.map((condition) => condition.text).join("");
}

/** A block as a message names it: its conditions as written, in the queries around it. */
function placeText(block: Block): string {
	const conditions = textOf(block.conditions);
	const queries = block.queries.map((query) => `@${query.name}${query.params ? ` ${query.params}` : ""}`);
	if (conditions && queries.length > 0) return `"${conditions}" in "${queries.join(" ")}"`;
	if (conditions) return `"${conditions}"`;
	return `"${queries.join(" ")}"`;
}

/**
 * The variable a property binds to, and the element that declares it. A property reading its own element's private
 * binds its own state variable. A root's, a part's or a global element's pseudo-element reading its host's private
 * binds the host's part variable (`--p-after-opacity`); a part, or a part's pseudo-element, reading the root's binds the root's
 * (`--p-icon-color`, `--p-tab-after-opacity`). Anything else binds its own state variable.
 */
function bindingOf(
	model: Model,
	element: Element,
	owner: Id,
	property: string,
): { variable: string; owner: Id } {
	if (owner !== element.id) {
		const ownerElement = model.elements[owner];
		if (element.kind === "pseudo-element") {
			const host = model.elements[element.host];
			if ((host?.kind === "part" || host?.kind === "root" || host?.kind === "global") && host.id === owner)
				return { variable: `--p-${element.name}-${property}`, owner };
			if (
				host?.kind === "part" &&
				ownerElement?.kind === "root" &&
				model.components[host.component]?.root === owner
			)
				return { variable: `--p-${host.name}-${element.name}-${property}`, owner };
		}
		if (
			(element.kind === "part" || element.kind === "slot") &&
			ownerElement?.kind === "root" &&
			model.components[element.component]?.root === owner
		)
			return { variable: `--p-${element.name}-${property}`, owner };
	}
	return { variable: `--s-${property}`, owner: element.id };
}
