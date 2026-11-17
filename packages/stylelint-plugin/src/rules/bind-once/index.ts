// `bind-once` (rule 3): each property is declared once per element. If it needs to change, it's bound once to a state
// variable, and the variable changes. In strict mode, anything that varies a property changes a variable.
import {
	type Block,
	type Declaration,
	type Element,
	type Id,
	longhandsOf,
	type Model,
	overlaps,
} from "@statefulcss/core";

import { listOf, nameOf } from "../names.js";
import { defineRule, type Finding } from "../rule.js";

const messages = {
	again: (property: string, element: string, place: string, variable: string) =>
		`Unexpected "${property}" declared on ${element} and again in ${place}. Bind it once with "${property}: var(${variable})" and set "${variable}" in ${place}.`,
	changes: (property: string, element: string, place: string, others: string, variable: string) =>
		`Unexpected "${property}" declared on ${element} in ${place} and again in ${others}. Bind it once with "${property}: var(${variable})" in the block of ${element}, and set "${variable}" in each.`,
	variantAndState: (property: string, element: string, place: string, variable: string, own: string) =>
		`Unexpected "${property}" declared on ${element} in ${place}, and a state changes it too. Bind it once with "${property}: var(${variable})", give "${variable}" the default "var(${own})", and set "${own}" in ${place}.`,
	stateVariables: (property: string, element: string, place: string, variable: string) =>
		`Unexpected "${property}" declared on ${element} in ${place}, though ${element} changes through state variables. Bind it with "${property}: var(${variable})" in the block of ${element}, and set "${variable}" in ${place}.`,
	ownerAgain: (property: string, element: string, place: string, variable: string, owner: string) =>
		`Unexpected "${property}" declared on ${element} and again in ${place}. Bind it once with "${property}: var(${variable})", and let ${owner} declare "${variable}" and set it in ${place}.`,
	ownerChanges: (
		property: string,
		element: string,
		place: string,
		others: string,
		variable: string,
		owner: string,
	) =>
		`Unexpected "${property}" declared on ${element} in ${place} and again in ${others}. Bind it once with "${property}: var(${variable})", and let ${owner} declare "${variable}" and set it in each.`,
	strict: (property: string, element: string, place: string, variable: string) =>
		`Unexpected "${property}" declared on ${element} in ${place}. In strict mode every change goes through a state variable: bind it with "${property}: var(${variable})" in the block of ${element}, and set "${variable}" in ${place}.`,
	strictOwner: (property: string, element: string, place: string, variable: string, owner: string) =>
		`Unexpected "${property}" declared on ${element} in ${place}. In strict mode every change goes through a variable: bind it with "${property}: var(${variable})", and let ${owner} declare "${variable}" and set it in ${place}.`,
	overlap: (property: string, other: string, element: string, variable: string) =>
		`Unexpected "${property}" beside "${other}" on ${element}, which sets it too, while "${variable}" changes one of them. Bind each longhand once, so the change has one path.`,
	repeated: (name: string, form: string) =>
		`Unexpected "${name}" declared twice in one block. The second always wins, so the first is never a fallback: write "${form}" instead.`,
};

type Key = keyof typeof messages;

/** One written declaration of a property on one element: a selector list's branches on that element, together. */
interface Written {
	readonly declaration: Declaration;
	readonly blocks: readonly Block[];
	/** Where it sits, with `@supports` left out: a fallback sits where the value it falls back from does. */
	readonly place: string;
	/** In the element's own block, or only under `@supports` there: no change, in default mode. */
	readonly own: boolean;
}

/** What a finding says before its branches are joined. */
interface Said {
	readonly message: Key;
	readonly args: readonly string[];
	readonly at: Finding<Key>["at"];
}

export default defineRule<Record<never, never>, Key>({
	name: "bind-once",
	severity: "error",
	fixable: false,
	messages,
	check(model, { settings }) {
		const name = (id: Id): string => nameOf(model, settings, id);
		const ignoredLayer = (layer: string | undefined): boolean =>
			layer !== undefined &&
			settings.ignoreLayers.some((ignored) => layer === ignored || layer.startsWith(`${ignored}.`));

		// One finding for each written declaration and message: a selector list on two elements is reported once.
		const groups = new Map<string, Said[]>();
		const report = (declaration: Declaration, said: Said, extra = ""): void => {
			const key = `${declaration.written}\n${said.message}\n${extra}`;
			const group = groups.get(key);
			if (group) group.push(said);
			else groups.set(key, [said]);
		};

		for (const element of model.elements) {
			if (skipped(model, element)) continue;
			const byProperty = writtenOf(model, element);
			const stateVariables = element.variables.some((id) => model.variables[id]?.role === "state");

			for (const [property, written] of byProperty) {
				if (written === "unknown") continue;
				const places = new Set(written.map((one) => (one.own ? "" : one.place)));
				const changes = written.filter((one) => !one.own);
				const reported = new Set<Written>();
				const hasOwn = changes.length < written.length;
				const stateChanges = changes.some((one) => one.blocks.some((block) => block.kind === "state"));

				for (const one of changes) {
					const at = { node: one.declaration.node, part: "property" } as const;
					const place = placeOf(one);
					const binding = bindingOf(model, element, one, property);
					const owner = binding.owner === undefined ? undefined : name(binding.owner);
					if (places.size >= 2) {
						const others = listOf(
							changes.filter((other) => other.place !== one.place).map((other) => placeOf(other)),
						);
						if (owner !== undefined)
							report(one.declaration, {
								message: hasOwn ? "ownerAgain" : "ownerChanges",
								args: hasOwn
									? [property, name(element.id), place, binding.variable, owner]
									: [property, name(element.id), place, others, binding.variable, owner],
								at,
							});
						else if (stateChanges && one.blocks.every((block) => block.kind === "variant"))
							report(one.declaration, {
								message: "variantAndState",
								args: [property, name(element.id), place, binding.variable, `--_${property}`],
								at,
							});
						else
							report(one.declaration, {
								message: hasOwn ? "again" : "changes",
								args: hasOwn
									? [property, name(element.id), place, binding.variable]
									: [property, name(element.id), place, others, binding.variable],
								at,
							});
						reported.add(one);
					} else if (stateVariables && owner === undefined) {
						report(one.declaration, {
							message: "stateVariables",
							args: [property, name(element.id), place, binding.variable],
							at,
						});
						reported.add(one);
					}
				}

				// Strict mode: every declaration outside the element's own block is a change, `@supports` included,
				// except in a layer the settings leave alone.
				if (!settings.strict) continue;
				for (const one of written) {
					if (reported.has(one)) continue;
					const varied = one.blocks.filter((block) => block.kind !== "own" && !ignoredLayer(block.layer));
					if (varied.length === 0) continue;
					const at = { node: one.declaration.node, part: "property" } as const;
					const place = listOf(varied.map((block) => placeText(block)));
					const binding = bindingOf(model, element, one, property);
					report(
						one.declaration,
						binding.owner === undefined
							? {
									message: "strict",
									args: [property, name(element.id), place, binding.variable],
									at,
								}
							: {
									message: "strictOwner",
									args: [property, name(element.id), place, binding.variable, name(binding.owner)],
									at,
								},
					);
				}
			}

			overlapsOf(model, element, byProperty, (later, earlier, variable) =>
				report(
					later.declaration,
					{
						message: "overlap",
						args: [later.declaration.property, earlier.declaration.property, name(element.id), variable],
						at: { node: later.declaration.node, part: "property" },
					},
					earlier.declaration.property,
				),
			);
		}

		for (const [declaration, form] of repeatsOf(model)) {
			report(declaration, {
				message: "repeated",
				args: [declaration.property, form],
				at: { node: declaration.node, part: "property" },
			});
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
 * An element's native declarations, each written declaration once, by property. A property with a declaration in a
 * block of unknown kind is `unknown`: where it sits can't be told. A `:visited` block sets colors directly, since
 * `:visited` ignores custom properties, so it's left out.
 */
function writtenOf(model: Model, element: Element): Map<string, Written[] | "unknown"> {
	const byWritten = new Map<Id, { declaration: Declaration; blocks: Block[] }>();
	const unknown = new Set<string>();
	for (const blockId of element.blocks) {
		const block = model.blocks[blockId];
		if (!block) continue;
		if (block.kind === "state" && block.groups.includes("visited")) continue;
		for (const id of block.declarations) {
			const declaration = model.declarations[id];
			if (!declaration || declaration.role !== undefined || declaration.property.includes("#{")) continue;
			if (block.kind === "unknown") {
				unknown.add(declaration.property);
				continue;
			}
			const entry = byWritten.get(declaration.written);
			if (entry) entry.blocks.push(block);
			else byWritten.set(declaration.written, { declaration, blocks: [block] });
		}
	}
	const byProperty = new Map<string, Written[] | "unknown">();
	for (const property of unknown) byProperty.set(property, "unknown");
	for (const { declaration, blocks } of byWritten.values()) {
		const written = byProperty.get(declaration.property);
		if (written === "unknown") continue;
		const own = blocks.some((block) => block.kind === "own" || block.kind === "supports");
		const place = [...new Set(blocks.map((block) => placeKey(block)))].sort().join("\n");
		const one: Written = { declaration, blocks, place, own };
		if (written) written.push(one);
		else byProperty.set(declaration.property, [one]);
	}
	return byProperty;
}

/** Where a block sits, for comparing: its selector and the queries around it, `@supports` left out. */
function placeKey(block: Block): string {
	return [
		block.selector,
		...block.queries
			.filter((query) => query.name !== "supports")
			.map((query) => `@${query.name} ${query.params}`),
	].join("\n");
}

/** Where a written declaration sits, as a message names it: each of its blocks on this element. */
function placeOf(one: Written): string {
	return listOf(one.blocks.map((block) => placeText(block)));
}

/** A block as a message names it: its conditions as written, in the queries around it. */
function placeText(block: Block): string {
	const conditions = block.conditions.map((condition) => condition.text).join("");
	const queries = block.queries.map((query) => `@${query.name}${query.params ? ` ${query.params}` : ""}`);
	if (conditions && queries.length > 0) return `"${conditions}" in "${queries.join(" ")}"`;
	if (conditions) return `"${conditions}"`;
	return `"${queries.join(" ")}"`;
}

/**
 * The variable a property binds, and the element that declares it when that's not the element itself. A part's or a
 * root's pseudo-element binds the part variable its host declares (`--p-after-opacity`), or the root's for a part's
 * pseudo-element (`--p-tab-after-opacity`) when the root's conditions change it. A part changed by the root's
 * conditions binds the root's part variable (`--p-icon-color`). Anything else binds its own state variable.
 */
function bindingOf(
	model: Model,
	element: Element,
	one: Written,
	property: string,
): { variable: string; owner: Id | undefined } {
	const onRoot = one.blocks.some((block) => block.conditions.some((condition) => condition.on === "root"));
	if (element.kind === "pseudo-element") {
		const host = model.elements[element.host];
		if (host?.kind === "part" && onRoot) {
			const root = model.components[host.component]?.root;
			if (root !== undefined)
				return { variable: `--p-${host.name}-${element.name}-${property}`, owner: root };
		}
		if (host?.kind === "part" || host?.kind === "root")
			return { variable: `--p-${element.name}-${property}`, owner: host.id };
	}
	if (element.kind === "part" && onRoot) {
		const root = model.components[element.component]?.root;
		if (root !== undefined) return { variable: `--p-${element.name}-${property}`, owner: root };
	}
	return { variable: `--s-${property}`, owner: undefined };
}

/**
 * Overlaps involving a state variable: a shorthand and its longhand, or a logical and a physical property, in one
 * place, where either reads a state variable. A longhand followed by its shorthand in one block is Stylelint's
 * `declaration-block-no-shorthand-property-overrides`.
 */
function overlapsOf(
	model: Model,
	element: Element,
	byProperty: Map<string, Written[] | "unknown">,
	found: (later: Written, earlier: Written, variable: string) => void,
): void {
	const all = [...byProperty.values()]
		.filter((written): written is Written[] => written !== "unknown")
		.flat()
		.sort((a, b) => a.declaration.id - b.declaration.id);
	const placeOfOne = (one: Written): string => (one.own ? "" : one.place);
	for (const [index, later] of all.entries()) {
		for (const earlier of all.slice(0, index)) {
			if (placeOfOne(earlier) !== placeOfOne(later)) continue;
			const [a, b] = [earlier.declaration, later.declaration];
			if (a.property === b.property || !overlaps(a.property, b.property)) continue;
			const sameBlock = later.blocks.some((block) =>
				earlier.blocks.some((other) => other.node === block.node),
			);
			if (sameBlock && covers(b.property, a.property)) continue;
			const variable = stateReadOf(model, a) ?? stateReadOf(model, b);
			if (variable === undefined) continue;
			found(later, earlier, variable);
			break;
		}
	}
}

/**
 * Whether a shorthand sets everything another property sets, as Stylelint's override rule reads it: `padding` covers
 * `padding-left` and `padding-inline-start`.
 */
function covers(shorthand: string, property: string): boolean {
	const longhands = longhandsOf(shorthand);
	if (longhands.length === 0) return false;
	const leaves = longhandsOf(property).length > 0 ? longhandsOf(property) : [property];
	return leaves.every((leaf) => longhands.some((longhand) => overlaps(longhand, leaf)));
}

/** The first state variable a declaration's value reads with `var()`. */
function stateReadOf(model: Model, declaration: Declaration): string | undefined {
	for (const id of declaration.reads) {
		const read = model.reads[id];
		if (read?.role === "state" && read.via === "var") return read.name;
	}
	return undefined;
}

/**
 * Each custom property declared again in the block of one rule, after its first, with the `@supports` form its
 * message shows: the condition is a declaration on the same element that binds the variable, when there is one.
 */
function repeatsOf(model: Model): [Declaration, string][] {
	const seen = new Map<string, Declaration>();
	const nodes = new Map<object, number>();
	const repeats: [Declaration, string][] = [];
	for (const declaration of model.declarations) {
		if (declaration.role === undefined || declaration.written !== declaration.id) continue;
		const block = model.blocks[declaration.block];
		if (!block) continue;
		let node = nodes.get(block.node);
		if (node === undefined) {
			node = nodes.size;
			nodes.set(block.node, node);
		}
		const key = `${node}\n${declaration.property}`;
		if (!seen.has(key)) {
			seen.set(key, declaration);
			continue;
		}
		const binder = bindersOf(model, block, declaration.property);
		const condition = binder ? `${binder}: ${declaration.value}` : "…";
		repeats.push([
			declaration,
			`@supports (${condition}) { ${declaration.property}: ${declaration.value}; }`,
		]);
	}
	return repeats;
}

/** The native property on a block's element whose whole value is `var()` of this name. */
function bindersOf(model: Model, block: Block, name: string): string | undefined {
	for (const read of model.reads) {
		if (read.name !== name || read.element !== block.element || read.position !== "whole") continue;
		if (read.declaration === undefined) continue;
		const declaration = model.declarations[read.declaration];
		if (declaration && declaration.role === undefined) return declaration.property;
	}
	return undefined;
}
