// `blocking-states-win` (rule 7): interaction states never apply to a blocked element. They sit inside a guard that
// lists every blocking state, focus stays outside it, and blocking states set only their own look. A part whose
// component has blocking states also waits for the component's query variable.
import type { Block, Condition, Element, Guard, Id, Model, Position } from "@statefulcss/core";
import type { Rule } from "postcss";

import { listOf, nameOf } from "../names.js";
import { ownershipOf } from "../ownership.js";
import { defineRule, type Edit, type Finding } from "../rule.js";

const messages = {
	unguarded: (condition: string, element: string, guard: string) =>
		`Unexpected "${condition}" on ${element} outside a guard, so a blocked element still reacts to it. Write it inside "${guard}".`,
	incomplete: (element: string, missing: string) =>
		`Unexpected guard on ${element} leaving out ${missing}, so interaction states still apply while they hold. Add them to its ":not()".`,
	focusInGuard: (condition: string, element: string) =>
		`Unexpected "${condition}" inside a guard on ${element}: a blocked element that stays focusable loses its focus style. Write it outside the guard.`,
	setBack: (variable: string, blocking: string, states: string) =>
		`Unexpected "${variable}" set back to its default in ${blocking}, which ${states} also write. Remove it: the guard keeps interaction states off, and a blocking state sets only its own look.`,
	partUnqueried: (condition: string, element: string, root: string, variables: string, query: string) =>
		`Unexpected "${condition}" on ${element} outside a style query on ${variables}, so it applies while ${root} is blocked. Write it inside "${query}".`,
	partNoQueryVariable: (condition: string, element: string, root: string, variable: string) =>
		`Unexpected "${condition}" on ${element}, which applies while ${root} is blocked: its blocking states set no query variable. Set "${variable}" in them, and write "${condition}" inside a style query on it.`,
	queryRead: (variable: string) =>
		`Unexpected "${variable}" read with "var()". A query variable that blocking states set is only queried, with "@container style()".`,
	queryNoDefault: (variable: string, root: string, blocking: string) =>
		`Unexpected "${variable}" set in ${blocking} with no default on ${root}. Declare its default in the block of ${root}, so a nested component never inherits an outer one's value.`,
};

type Key = keyof typeof messages;

/** What a finding says before its branches are joined. */
interface Said {
	readonly message: Key;
	readonly args: readonly string[];
	readonly at: Finding<Key>["at"];
	readonly edits?: readonly Edit[];
}

export default defineRule<Record<never, never>, Key>({
	name: "blocking-states-win",
	severity: "warning",
	fixable: true,
	messages,
	check(model, { settings }) {
		const name = (id: Id): string => nameOf(model, settings, id);
		const ownership = ownershipOf(model);
		const quoted = (texts: readonly string[]): string => listOf(texts.map((text) => `"${text}"`));

		// One finding for each written thing and message: a selector list is reported once, naming every element.
		const groups = new Map<string, Said[]>();
		const report = (key: string, said: Said): void => {
			const group = groups.get(`${key}\n${said.message}`);
			if (group) group.push(said);
			else groups.set(`${key}\n${said.message}`, [said]);
		};

		const elements = model.elements.filter((element) => inComponent(model, element));
		const blocked = blockedBy(model);

		/** The blocking states a guard on this element must list: the settings', and the root's `:has()` ones. */
		const required = (guarded: Id): readonly string[] => [
			...settings.blockingStates,
			...hasStatesOf(model, guarded).filter(
				(text) => !settings.blockingStates.some((entry) => compact(entry) === compact(text)),
			),
		];
		const guardText = (guarded: Id): string => `&:where(:not(${required(guarded).join(", ")}))`;

		// Interaction states with no guard, wrapped where every block of their rule is one
		const unguarded: { block: Block; condition: Condition; element: Element }[] = [];
		for (const element of elements) {
			const guarded = guardedOf(element);
			const checked = settings.strict || (blocked.get(element.id)?.length ?? 0) > 0;
			for (const block of blocksOf(model, element)) {
				const pointer = interactions(block).filter((condition) => !condition.focus);
				const focus = interactions(block).filter((condition) => condition.focus);
				const guards = guardsOf(model, block, guarded);
				const [first] = pointer;

				// Focus inside the guard: a blocked element that stays focusable must still show focus.
				const [focused] = focus;
				if (!first && focused && guards.length > 0)
					report(placeKey(focused.at), {
						message: "focusInGuard",
						args: [focused.text, name(element.id)],
						at: focused.at,
					});

				if (!first || !checked) continue;
				if (guards.length === 0) {
					unguarded.push({ block, condition: first, element });
					continue;
				}

				// A guard that leaves a blocking state out.
				const covered = new Set(guards.flatMap((guard) => coverage(guard)));
				const missing = required(guarded).filter((text) => !covered.has(compact(text)));
				const [guard] = guards;
				if (!guard || missing.length === 0) continue;
				const edit = completion(guard.condition.at, missing);
				report(placeKey(guard.condition.at), {
					message: "incomplete",
					args: [name(guarded), quoted(missing)],
					at: guard.condition.at,
					...(edit ? { edits: [edit] } : {}),
				});
			}
		}

		const wraps = wrapsOf(model, unguarded, (block) => guardText(guardedOf(elementOf(model, block))));
		for (const { block, condition, element } of unguarded) {
			const wrap = wraps.get(block.node);
			report(placeKey(condition.at), {
				message: "unguarded",
				args: [condition.text, name(element.id), guardText(guardedOf(element))],
				at: condition.at,
				...(wrap ? { edits: [wrap] } : {}),
			});
		}

		// A blocking state setting back what an interaction or a semantic state changes.
		for (const element of elements) {
			for (const block of blocksOf(model, element)) {
				if (!isBlocking(block)) continue;
				const blocking = statesText(block, ["blocking"]);
				for (const id of block.declarations) {
					const declaration = model.declarations[id];
					if (!declaration?.role) continue;
					const variable = ownership.variable(element.id, declaration.property);
					const fallback = variable?.default === undefined ? undefined : model.declarations[variable.default];
					if (!variable || !fallback || fallback.id === id) continue;
					if (spaced(fallback.value) !== spaced(declaration.value)) continue;
					const states = variable.writes.flatMap((write) => {
						const other = write === id ? undefined : model.declarations[write];
						const where = other && model.blocks[other.block];
						if (!where || where.kind !== "state" || isBlocking(where)) return [];
						const text = statesText(where, ["interaction", "semantic"]);
						return text ? [`"${text}"`] : [];
					});
					if (states.length === 0) continue;
					report(`${declaration.written}`, {
						message: "setBack",
						args: [declaration.property, `"${blocking}"`, listOf(states)],
						at: { node: declaration.node },
					});
				}
			}
		}

		// A part whose component has blocking states waits for the component's query variable.
		for (const element of elements) {
			const part = element.kind === "pseudo-element" ? model.elements[element.host] : element;
			if (part?.kind !== "part") continue;
			const component = model.components[part.component];
			const root = component && model.elements[component.root];
			const rootBlocking = root ? (blocked.get(root.id) ?? []) : [];
			if (!component || !root || rootBlocking.length === 0) continue;
			const variables = queryVariablesOf(model, rootBlocking);
			for (const block of blocksOf(model, element)) {
				const [first] = interactions(block).filter((condition) => !condition.focus);
				if (!first) continue;
				const queried = block.queries.some((query) =>
					query.styleQueries.some((style) => !style.optional && variables.includes(style.name)),
				);
				if (queried) continue;
				const [variable] = variables;
				if (variable === undefined) {
					report(placeKey(first.at), {
						message: "partNoQueryVariable",
						args: [first.text, name(element.id), name(root.id), `--q-${component.name}-blocked`],
						at: first.at,
					});
					continue;
				}
				const fallback = ownership.variable(root.id, variable)?.default;
				const value = fallback === undefined ? "…" : spaced(model.declarations[fallback]?.value ?? "…");
				report(placeKey(first.at), {
					message: "partUnqueried",
					args: [
						first.text,
						name(element.id),
						name(root.id),
						quoted(variables),
						`@container style(${variable}: ${value})`,
					],
					at: first.at,
				});
			}
		}

		// The query variables a component's blocking states set: only queried, and declared on its root.
		for (const component of model.components) {
			const root = model.elements[component.root];
			const rootBlocking = root ? (blocked.get(root.id) ?? []) : [];
			if (!root || !inComponent(model, root)) continue;
			for (const block of rootBlocking) {
				for (const id of block.declarations) {
					const declaration = model.declarations[id];
					if (declaration?.role !== "query") continue;
					if (ownership.variable(root.id, declaration.property)?.default !== undefined) continue;
					report(`${declaration.written}`, {
						message: "queryNoDefault",
						args: [declaration.property, name(root.id), `"${statesText(block, ["blocking"])}"`],
						at: { node: declaration.node, part: "property" },
					});
				}
			}
			for (const variable of queryVariablesOf(model, rootBlocking)) {
				for (const read of model.reads) {
					const declaration =
						read.declaration === undefined ? undefined : model.declarations[read.declaration];
					if (read.name !== variable || read.via !== "var" || !declaration) continue;
					report(`${declaration.written}\n${variable}`, {
						message: "queryRead",
						args: [variable],
						at: { node: declaration.node, part: "value" },
					});
				}
			}
		}

		return [...groups.values()].flatMap((group): Finding<Key>[] => {
			const [first] = group;
			if (!first) return [];
			const args = first.args.map((_, index) => listOf(group.map((one) => one.args[index] ?? "")));
			return [{ message: first.message, args, at: first.at, ...(first.edits ? { edits: first.edits } : {}) }];
		});
	},
});

/**
 * Elements in a component: a root, a part, a slot, content, and their pseudo-elements. A utility, what `:deep()` or
 * `:global()` selects, and a global element are left alone.
 */
function inComponent(model: Model, element: Element): boolean {
	if (element.kind === "pseudo-element") {
		const host = model.elements[element.host];
		return host !== undefined && inComponent(model, host);
	}
	return (
		element.kind === "root" ||
		element.kind === "part" ||
		element.kind === "slot" ||
		element.kind === "content"
	);
}

/** The element a guard on this element's blocks is written on: its own, or its host's for a pseudo-element. */
function guardedOf(element: Element): Id {
	return element.kind === "pseudo-element" ? element.host : element.id;
}

function elementOf(model: Model, block: Block): Element {
	const element = model.elements[block.element];
	if (!element) throw new Error(`block ${block.id} has no element`);
	return element;
}

function blocksOf(model: Model, element: Element): Block[] {
	return element.blocks.flatMap((id) => model.blocks[id] ?? []);
}

/** The conditions written on the element itself, or on its host for a pseudo-element. */
function own(block: Block): Condition[] {
	return block.conditions.filter((condition) => condition.on === "subject" || condition.on === "host");
}

/**
 * A state block's interaction states on the element itself. `:not(:hover)` is the look at rest, not an interaction
 * state.
 */
function interactions(block: Block): Condition[] {
	if (block.kind !== "state") return [];
	return own(block).filter(
		(condition) =>
			condition.kind === "state" && condition.group === "interaction" && !/^:not\(/i.test(condition.text),
	);
}

/** A state block that writes something, with a blocking state on the element itself, a `:has()` one included. */
function isBlocking(block: Block): boolean {
	return (
		block.kind === "state" &&
		block.declarations.length > 0 &&
		own(block).some((condition) => condition.kind === "state" && condition.group === "blocking")
	);
}

/**
 * For each element in a component, the blocking state blocks that block it: its own, its host's for a pseudo-element,
 * and for a part, its component root's.
 */
function blockedBy(model: Model): Map<Id, readonly Block[]> {
	const owned = new Map<Id, Block[]>();
	for (const element of model.elements) owned.set(element.id, blocksOf(model, element).filter(isBlocking));
	const result = new Map<Id, readonly Block[]>();
	const of = (element: Element | undefined): readonly Block[] => {
		if (!element) return [];
		const cached = result.get(element.id);
		if (cached) return cached;
		const blocks = [...(owned.get(element.id) ?? [])];
		if (element.kind === "pseudo-element") blocks.push(...of(model.elements[element.host]));
		if (element.kind === "part") {
			const root = model.components[element.component]?.root;
			blocks.push(...(root === undefined ? [] : (owned.get(root) ?? [])));
		}
		result.set(element.id, blocks);
		return blocks;
	};
	for (const element of model.elements) of(element);
	return result;
}

/** The guards on the element a block's guard must be written on. */
function guardsOf(model: Model, block: Block, guarded: Id): Guard[] {
	return block.conditions.flatMap((condition) => {
		const guard = condition.guard === undefined ? undefined : model.guards[condition.guard];
		return guard?.element === guarded ? [guard] : [];
	});
}

/** What a guard keeps out, compared without spaces: the settings' entries it lists, and its `:has()` states. */
function coverage(guard: Guard): string[] {
	return [
		...guard.blocking.map(compact),
		...guard.condition.inner.filter((inner) => inner.has).map((inner) => compact(inner.text)),
	];
}

/** A root's blocking states reached through `:has()`, as written: the root's guard lists them too. */
function hasStatesOf(model: Model, id: Id): string[] {
	const element = model.elements[id];
	if (element?.kind !== "root") return [];
	const texts = blocksOf(model, element)
		.filter(isBlocking)
		.flatMap((block) =>
			own(block)
				.filter((condition) => condition.has && condition.group === "blocking")
				.map((one) => one.text),
		);
	return [...new Map(texts.map((text) => [compact(text), text])).values()];
}

/** The `--q-*` a component's blocking states set. */
function queryVariablesOf(model: Model, blocks: readonly Block[]): string[] {
	const names = blocks.flatMap((block) =>
		block.declarations.flatMap((id) => {
			const declaration = model.declarations[id];
			return declaration?.role === "query" ? [declaration.property] : [];
		}),
	);
	return [...new Set(names)];
}

/** The states of a block in some groups, as written one after another: `:hover`, `[aria-pressed="true"]`. */
function statesText(block: Block, groups: readonly Condition["group"][]): string {
	return own(block)
		.filter((condition) => condition.kind === "state" && groups.includes(condition.group))
		.map((condition) => condition.text)
		.join("");
}

/** The edit that adds the missing states at the end of a guard's `:not()`, when its written text is that. */
function completion(at: Position, missing: readonly string[]): Edit | undefined {
	const written = (at.node.type === "rule" ? at.node.selector : at.node.params).slice(at.index, at.endIndex);
	if (!/^:not\(/i.test(written) || !written.endsWith(")")) return undefined;
	return { kind: "replace", at, expects: written, text: `${written.slice(0, -1)}, ${missing.join(", ")})` };
}

/**
 * The wraps that fix unguarded interaction states: for each rule that can move, the run of such rules it follows
 * each other in. A rule can move when it's nested, every branch of its selector is `&` with the state on it
 * (`&:hover`, `&[data-hovered]`), and every block it makes is an unguarded interaction state. A run shares one guard.
 */
function wrapsOf(
	model: Model,
	unguarded: readonly { block: Block }[],
	guardFor: (block: Block) => string,
): Map<Block["node"], Edit> {
	const flagged = new Set(unguarded.map(({ block }) => block));
	const movable = new Map<Rule, string>();
	for (const { block } of unguarded) {
		const rule = block.node;
		if (rule.type !== "rule" || movable.has(rule)) continue;
		const parent = rule.parent;
		if (!parent || (parent.type !== "rule" && parent.type !== "atrule")) continue;
		if (!branchesOf(rule.selector).every((branch) => /^&[:[]/.test(branch) && !hasCombinator(branch)))
			continue;
		const made = model.blocks.filter((other) => other.node === rule);
		// A focus state moved into the guard would stop showing on a blocked element.
		if (made.some((other) => own(other).some(holdsFocus))) continue;
		const guards = new Set(made.map(guardFor));
		const [selector] = guards;
		if (!selector || guards.size > 1 || !made.every((other) => flagged.has(other))) continue;
		movable.set(rule, selector);
	}

	const wraps = new Map<Block["node"], Edit>();
	for (const [rule, selector] of movable) {
		if (wraps.has(rule)) continue;
		const siblings = rule.parent?.nodes ?? [];
		let start = siblings.indexOf(rule);
		const joins = (node: unknown): boolean => node !== undefined && movable.get(node as Rule) === selector;
		while (joins(siblings[start - 1])) start -= 1;
		let end = start;
		while (joins(siblings[end + 1])) end += 1;
		const rules = siblings.slice(start, end + 1) as Rule[];
		const edit: Edit = { kind: "wrap", rules, selector };
		for (const one of rules) wraps.set(one, edit);
	}
	return wraps;
}

/** A focus state, or a list that holds one: `:is(:hover, :focus-visible)`. */
function holdsFocus(condition: Condition): boolean {
	return condition.focus || condition.inner.some(holdsFocus);
}

/** A selector's branches, split at the commas outside brackets and strings. */
function branchesOf(selector: string): string[] {
	const branches: string[] = [];
	let depth = 0;
	let quote: string | undefined;
	let start = 0;
	for (let index = 0; index < selector.length; index += 1) {
		const char = selector[index];
		if (char === "\\") index += 1;
		else if (quote) quote = char === quote ? undefined : quote;
		else if (char === '"' || char === "'") quote = char;
		else if (char === "(" || char === "[") depth += 1;
		else if (char === ")" || char === "]") depth -= 1;
		else if (char === "," && depth === 0) {
			branches.push(selector.slice(start, index).trim());
			start = index + 1;
		}
	}
	branches.push(selector.slice(start).trim());
	return branches;
}

/** Whether a branch has a combinator, or a space, outside brackets and strings. */
function hasCombinator(branch: string): boolean {
	let depth = 0;
	let quote: string | undefined;
	for (let index = 0; index < branch.length; index += 1) {
		const char = branch[index];
		if (char === "\\") index += 1;
		else if (quote) quote = char === quote ? undefined : quote;
		else if (char === '"' || char === "'") quote = char;
		else if (char === "(" || char === "[") depth += 1;
		else if (char === ")" || char === "]") depth -= 1;
		else if (depth === 0 && /[\s>+~]/.test(char ?? "")) return true;
	}
	return false;
}

/** Where something is written, as a key: one finding for each. */
function placeKey(at: Position): string {
	return `${at.node.source?.start?.offset ?? ""} ${at.index}`;
}

/** A selector to compare, without spaces and quotes: `[data-part=input]` is `[data-part="input"]`. */
function compact(text: string): string {
	return text.replace(/[\s"']+/g, "");
}

function spaced(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}
