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
	changingTaken: (property: string, name: string, place: string, variable: string, element: string) =>
		`Unexpected "${property}" reading "${name}", which changes in ${place}. Take it with "${name}: inherit" on ${element}, move this value into the default of "${variable}" there, and read "var(${variable})" instead.`,
	changingTakenChain: (
		property: string,
		name: string,
		chain: string,
		place: string,
		variable: string,
		element: string,
	) =>
		`Unexpected "${property}" reading "${name}", which reads ${chain}, which changes in ${place}. Take it with "${name}: inherit" on ${element}, move this value into the default of "${variable}" there, and read "var(${variable})" instead.`,
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
				const change = changeOf(model, source);
				if (!change) continue;
				// The element binds the property through its own state variable, whose default reads the private. A
				// private of its owner's (a part, a slot or a pseudo-element reading its component's) is taken with
				// `inherit` first. A part variable would change only if the owner's variants and states wrote it.
				const variable = `--s-${declaration.property}`;
				const taken = source.element !== element.id;
				const place = listOf(change.blocks.map((one) => placeText(one)));
				const chain = change.chain.map((one) => `"${one}"`).join(", which reads ");
				const at = { node: declaration.node, part: "value" } as const;
				const args =
					change.chain.length === 0
						? [declaration.property, read.name, place, variable, name(element.id)]
						: [declaration.property, read.name, chain, place, variable, name(element.id)];
				const message = taken
					? change.chain.length === 0
						? "changingTaken"
						: "changingTakenChain"
					: change.chain.length === 0
						? "changingPrivate"
						: "changingChain";
				report(declaration, `${read.name}\n${variable}`, { message, args, at });
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
				if (visited(block)) continue;
				if (block.kind === "variant" || block.conditions.some(outranks)) variants.push([declaration, block]);
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
 * (a loop of reads). A write in `:visited` changes nothing: the browser ignores custom properties there, and
 * `visited-colors-only` reports it.
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
		return block && !visited(block) ? [block] : [];
	});
	if (blocks.length > 0) return { blocks, chain: [] };
	const ownership = ownershipOf(model);
	for (const id of variable.writes) {
		const declaration = model.declarations[id];
		if (!declaration || visited(model.blocks[declaration.block])) continue;
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

/**
 * Whether a condition makes its block a variant combined with a state, which outranks a plain state: a variant
 * written outside `:where()`. Inside it, the variant adds no specificity.
 */
function outranks(condition: Block["conditions"][number]): boolean {
	return condition.kind === "variant" && !condition.inWhere;
}

/** Whether a block is in `:visited`, where the browser ignores what a variable is set to. */
function visited(block: Block | undefined): boolean {
	return block?.kind === "state" && block.groups.includes("visited");
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
