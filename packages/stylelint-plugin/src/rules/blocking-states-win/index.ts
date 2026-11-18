// `blocking-states-win` (rule 7): interaction states never apply to a blocked element. They sit inside a guard that
// lists every blocking state, focus stays outside it, and blocking states set only their own look. A part whose
// component has blocking states also waits for the component's query variable.
import type {
	Block,
	Condition,
	Element,
	Guard,
	Id,
	Model,
	Position,
	Read,
	StyleQuery,
} from "@statefulcss/core";
import type { ChildNode, Rule } from "postcss";

import { listOf, nameOf } from "../names.js";
import { ownershipOf } from "../ownership.js";
import { defineRule, type Edit, type Finding } from "../rule.js";

const messages = {
	unguarded: (condition: string, element: string, guard: string) =>
		`Unexpected "${condition}" on ${element} outside a guard, so a blocked element still reacts to it. Write it inside "${guard}".`,
	split: (condition: string, element: string, interaction: string, rest: string, guard: string) =>
		`Unexpected "${condition}" on ${element} outside a guard, so a blocked element still reacts to ${interaction}. Split it: write ${interaction} inside "${guard}", and ${rest} outside it.`,
	incomplete: (element: string, missing: string, count: string) =>
		`Unexpected guard on ${element} leaving out ${missing}, so interaction states still apply while ${count === "1" ? "it holds. Add it" : "they hold. Add them"} to its ":not()".`,
	incompleteShared: (element: string, missing: string, count: string) =>
		`Unexpected guard on ${element} leaving out ${missing}, so interaction states still apply while ${count === "1" ? "it holds" : "they hold"}. The elements sharing it have different blocking states: write a guard for each, listing its own.`,
	incompleteMixed: (element: string, missing: string, count: string) =>
		`Unexpected guard on ${element} leaving out ${missing}, so interaction states still apply while ${count === "1" ? "it holds" : "they hold"}. The guard also holds other styles, which adding ${count === "1" ? "it" : "them"} would change: give the interaction states their own guard, listing every blocking state.`,
	focusInGuard: (condition: string, element: string) =>
		`Unexpected "${condition}" inside a guard on ${element}: a blocked element that stays focusable loses its focus style. Write it outside the guard.`,
	focusSplit: (condition: string, element: string, focus: string, interaction: string) =>
		`Unexpected "${condition}" inside a guard on ${element}: a blocked element that stays focusable loses its ${focus} style. Split it: keep ${interaction} inside the guard, and write ${focus} outside it.`,
	setBack: (variable: string, blocking: string, states: string, count: string) =>
		`Unexpected "${variable}" set back to its default in ${blocking}, which ${states} also ${count === "1" ? "writes" : "write"}. Remove it: the guard keeps interaction states off, and a blocking state sets only its own look.`,
	partUnqueried: (condition: string, element: string, root: string, variables: string, query: string) =>
		`Unexpected "${condition}" on ${element} outside a style query on ${variables}, so it applies while ${root} is blocked. Write it inside "${query}".`,
	partWrongQuery: (condition: string, element: string, written: string, root: string, query: string) =>
		`Unexpected "${condition}" on ${element} inside "${written}", which doesn't keep it off while ${root} is blocked. Write it inside "${query}".`,
	partNoQueryVariable: (condition: string, element: string, root: string, variable: string) =>
		`Unexpected "${condition}" on ${element}, which applies while ${root} is blocked: its blocking states set no query variable. Set "${variable}" in them, and write "${condition}" inside a style query on it.`,
	partNoSharedFlag: (condition: string, element: string, root: string, variable: string) =>
		`Unexpected "${condition}" on ${element}, which applies while ${root} is blocked: no query variable is set by every one of its blocking states. Set one, such as "${variable}", in each of them, and write "${condition}" inside a style query on its default.`,
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
	/**
	 * A list the sentence agrees with in number: its items are gathered from every branch, written quoted at `index`,
	 * and counted in one more argument at the end.
	 */
	readonly list?: { readonly index: number; readonly items: readonly string[] };
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
		// Reads with `var()` by name, gathered once.
		const varReads = new Map<string, Read[]>();
		for (const read of model.reads) {
			if (read.via !== "var") continue;
			const list = varReads.get(read.name);
			if (list) list.push(read);
			else varReads.set(read.name, [read]);
		}

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
		// For each guard as written, what it leaves out for each element it guards. A selector list writes one guard for
		// several elements, so a completion is offered only when it's right for every one of them.
		const completions = new Map<string, Completion>();
		for (const element of elements) {
			const guarded = guardedOf(element);
			const needed = required(guarded);
			// With no blocking state to keep out, there's nothing to guard against.
			const checked = needed.length > 0 && (settings.strict || (blocked.get(element.id)?.length ?? 0) > 0);
			for (const block of blocksOf(model, element)) {
				const found = interactions(block);
				const pointer = found.filter((one) => one.pointer.length > 0);
				const guards = guardsOf(model, block, guarded);
				const [first] = pointer;

				// Focus inside the guard: a blocked element that stays focusable must still show focus.
				if (guards.length > 0) {
					const [focused] = found.filter((one) => one.focus.length > 0);
					if (!first && focused)
						report(placeKey(focused.condition.at), {
							message: "focusInGuard",
							args: [focused.condition.text, name(element.id)],
							at: focused.condition.at,
						});
					for (const one of pointer.filter((each) => each.focus.length > 0))
						report(placeKey(one.condition.at), {
							message: "focusSplit",
							args: [
								one.condition.text,
								name(element.id),
								quoted(one.focus.map((way) => way.text)),
								quoted(one.pointer.map((way) => way.text)),
							],
							at: one.condition.at,
						});
				}

				if (!first) continue;
				if (guards.length === 0) {
					if (!checked) continue;
					// A list that holds other states too: only its interaction states belong in the guard.
					const mixed = pointer.find((one) => one.focus.length > 0 || one.other.length > 0);
					if (!mixed) {
						unguarded.push({ block, condition: first.condition, element });
						continue;
					}
					report(placeKey(mixed.condition.at), {
						message: "split",
						args: [
							mixed.condition.text,
							name(element.id),
							quoted(mixed.pointer.map((way) => way.text)),
							quoted([...mixed.focus, ...mixed.other].map((way) => way.text)),
							guardText(guarded),
						],
						at: mixed.condition.at,
					});
					continue;
				}

				// A guard that leaves a blocking state out. Every element under it is counted, checked or not, so a
				// completion never adds one element's states to another's guard.
				const covered = new Set(guards.flatMap((guard) => coverage(guard)));
				const [guard] = guards;
				if (!guard) continue;
				const key = placeKey(guard.condition.at);
				const completing: Completion = completions.get(key) ?? {
					at: guard.condition.at,
					guards: [],
					missing: new Map(),
					checked: new Set(),
				};
				completions.set(key, completing);
				completing.guards.push(...guards);
				completing.missing.set(
					guarded,
					needed.filter((text) => !covered.has(compact(text))),
				);
				if (checked) completing.checked.add(guarded);
			}
		}

		// Every guard written at each place, an element's outside a component included: `.button, a` writes one for each.
		const guardsAt = new Map<string, Guard[]>();
		for (const guard of model.guards) {
			const key = placeKey(guard.condition.at);
			const list = guardsAt.get(key);
			if (list) list.push(guard);
			else guardsAt.set(key, [guard]);
		}

		for (const [key, { at, guards, missing, checked }] of completions) {
			const lists = [...missing.values()].map((list) => list.map(compact).sort().join("\n"));
			const shared = lists.every((list) => list === lists[0]);
			// Completing a guard that holds a focus state would hide its focus on a blocked element that stays focusable.
			const focus = guards.some((guard) =>
				guard.blocks.some((id) => model.blocks[id]?.conditions.some(holdsFocus)),
			);
			// Completing a guard keeps everything inside it off while the added states hold. That's right only for
			// interaction states of the elements it was counted for: a semantic state's look (`&[aria-pressed="true"]`),
			// a plain declaration, or another element's branch (`.button, a`) would change too.
			const all = guardsAt.get(key) ?? guards;
			const mixed = all.some(
				(guard) =>
					guard.element === undefined ||
					!missing.has(guard.element) ||
					guard.blocks.some((id) => {
						const block = model.blocks[id];
						// A focus state inside the guard has its own finding, and stops the completion above.
						return (
							block !== undefined &&
							block.declarations.length > 0 &&
							!onlyInteraction(block) &&
							!block.conditions.some(holdsFocus)
						);
					}),
			);
			for (const id of checked) {
				const left = missing.get(id) ?? [];
				if (left.length === 0) continue;
				const edit = shared && !focus && !mixed ? completion(at, left) : undefined;
				report(key, {
					message: !shared ? "incompleteShared" : mixed ? "incompleteMixed" : "incomplete",
					args: [name(id), ""],
					at,
					...(edit ? { edits: [edit] } : {}),
					list: { index: 1, items: left },
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
						return text ? [text] : [];
					});
					if (states.length === 0) continue;
					report(`${declaration.written}`, {
						message: "setBack",
						args: [declaration.property, `"${blocking}"`, ""],
						at: { node: declaration.node },
						list: { index: 2, items: states },
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
			const flags = flagsOf(model, root, rootBlocking);
			// A flag the query can rely on: one every blocking state changes away from its default, or one whose values
			// this file can't judge (a computed default, a value read from elsewhere).
			const usable = [
				...flags.filter((flag) => flag.judged === "every"),
				...flags.filter((flag) => flag.judged === "unjudged"),
			];
			const suggestion = (flag: Flag): string => `@container style(${flag.name}: ${flag.default ?? "…"})`;
			for (const block of blocksOf(model, element)) {
				const [first] = interactions(block)
					.filter((one) => one.pointer.length > 0)
					.map((one) => one.condition);
				if (!first) continue;
				const queries = block.queries.flatMap((query) =>
					query.styleQueries.flatMap((style) => {
						const flag = flags.find((one) => one.name === style.name);
						return flag && !style.optional ? [{ query, style, flag }] : [];
					}),
				);
				if (queries.some(({ style, flag }) => keepsOff(style, flag))) continue;
				const [best] = usable;
				if (flags.length === 0)
					report(placeKey(first.at), {
						message: "partNoQueryVariable",
						args: [first.text, name(element.id), name(root.id), `--q-${component.name}-blocked`],
						at: first.at,
					});
				else if (!best)
					report(placeKey(first.at), {
						message: "partNoSharedFlag",
						args: [first.text, name(element.id), name(root.id), `--q-${component.name}-blocked`],
						at: first.at,
					});
				else if (queries.length === 0)
					report(placeKey(first.at), {
						message: "partUnqueried",
						args: [
							first.text,
							name(element.id),
							name(root.id),
							quoted(flags.map((flag) => flag.name)),
							suggestion(best),
						],
						at: first.at,
					});
				else {
					const [{ query, flag } = { query: undefined, flag: best }] = queries;
					report(placeKey(first.at), {
						message: "partWrongQuery",
						args: [
							first.text,
							name(element.id),
							query ? `@${query.name} ${spaced(query.params)}` : "",
							name(root.id),
							suggestion(usable.includes(flag) ? flag : best),
						],
						at: first.at,
					});
				}
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
				for (const read of varReads.get(variable) ?? []) {
					const declaration =
						read.declaration === undefined ? undefined : model.declarations[read.declaration];
					// Only this component's own elements: a third party's, or another component's, isn't judged here.
					if (!declaration || componentOf(model.elements[read.element]) !== component.id) continue;
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
			if (first.list) {
				const items = [...new Set(group.flatMap((one) => one.list?.items ?? []))];
				args[first.list.index] = quoted(items);
				args.push(String(items.length));
			}
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

/** The component an element belongs to: a root, part, slot or content, or a pseudo-element of one. */
function componentOf(element: Element | undefined): Id | undefined {
	if (!element) return undefined;
	return element.kind === "root" ||
		element.kind === "part" ||
		element.kind === "slot" ||
		element.kind === "content" ||
		element.kind === "pseudo-element"
		? element.component
		: undefined;
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

/** A guard as written, and what it leaves out for each element it guards. */
interface Completion {
	readonly at: Position;
	readonly guards: Guard[];
	readonly missing: Map<Id, readonly string[]>;
	/** The elements the rule checks, which are reported. */
	readonly checked: Set<Id>;
}

/**
 * A condition holding an interaction state, sorted by the ways it can match: `:is(:hover, :focus-visible)` matches
 * by pointer or by focus, `:is(:hover, [aria-pressed="true"])` by pointer or by a semantic state.
 */
interface Interaction {
	readonly condition: Condition;
	readonly pointer: readonly Condition[];
	readonly focus: readonly Condition[];
	readonly other: readonly Condition[];
}

/**
 * A state block's interaction states on the element itself, in any order inside a list. `:not(:hover)` is the look
 * at rest, not an interaction state.
 */
function interactions(block: Block): Interaction[] {
	if (block.kind !== "state") return [];
	return own(block).flatMap((condition) => {
		if (condition.kind === "guard" || /^:not\(/i.test(condition.text)) return [];
		const ways = waysOf(condition);
		const pointer = ways.filter((way) => sortOf(way) === "pointer");
		const focus = ways.filter((way) => sortOf(way) === "focus");
		const other = ways.filter((way) => sortOf(way) === "other");
		return pointer.length + focus.length > 0 ? [{ condition, pointer, focus, other }] : [];
	});
}

/** The ways a condition can match: each selector an `:is()` or `:where()` lists, or the condition itself. */
function waysOf(condition: Condition): Condition[] {
	return /^:(?:is|where)\(/i.test(condition.text) && !condition.compound && condition.inner.length > 0
		? condition.inner.flatMap(waysOf)
		: [condition];
}

/**
 * A block that applies only through an interaction state of its element: one of its own conditions matches by pointer
 * alone, so a blocked element losing it loses nothing else. `&[aria-pressed="true"]:hover` is one;
 * `&[aria-pressed="true"]` and `&:is(:hover, [aria-pressed="true"])` aren't.
 */
function onlyInteraction(block: Block): boolean {
	return interactions(block).some(
		({ pointer, focus, other }) => pointer.length > 0 && focus.length + other.length === 0,
	);
}

/** One way to match: by pointer (`:hover`, `:active`), by focus, or by anything else. */
function sortOf(way: Condition): "pointer" | "focus" | "other" {
	if (holdsFocus(way)) return "focus";
	if (way.compound) return way.inner.some((one) => sortOf(one) === "pointer") ? "pointer" : "other";
	return way.kind === "state" && way.group === "interaction" && !/^:not\(/i.test(way.text)
		? "pointer"
		: "other";
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

/**
 * A `--q-*` a component's blocking states set, as this file writes it: its default on the root, and how the blocking
 * states treat it. `every`: each sets it, to a value other than its default. `some`: one doesn't set it, or sets it to
 * its default. `unjudged`: a value is computed or comes from elsewhere, or the root declares no default, so the rule
 * has no opinion.
 */
interface Flag {
	readonly name: string;
	readonly default: string | undefined;
	/** The values the blocking states set it to, each once. */
	readonly blocked: readonly string[];
	readonly judged: "every" | "some" | "unjudged";
}

/** The `--q-*` a component's blocking states set, each judged by the values the file writes. */
function flagsOf(model: Model, root: Element, blocking: readonly Block[]): Flag[] {
	const ownership = ownershipOf(model);
	return queryVariablesOf(model, blocking).map((name): Flag => {
		const defaultId = ownership.variable(root.id, name)?.default;
		const fallback = defaultId === undefined ? undefined : model.declarations[defaultId];
		const value = fallback && !computed(fallback) ? spaced(fallback.value) : undefined;
		// A blocking state that leaves it alone, or sets it to its default, isn't kept out by a query on it.
		let some = false;
		let unjudged = value === undefined;
		const blocked = new Set<string>();
		for (const blocks of statesOf(blocking)) {
			// A state written in several rules is one state: its writes compete by the cascade. Writes inside an at-rule
			// the state's own rules don't have (a nested `@media`) apply only sometimes, so they don't count.
			const fewest = Math.min(...blocks.map((block) => block.queries.length));
			const writes = blocks
				.filter((block) => block.queries.length === fewest)
				.flatMap((block) => block.declarations)
				.sort((one, other) => one - other)
				.flatMap((id) => model.declarations[id] ?? [])
				.filter((declaration) => declaration.property === name);
			// An `!important` write wins over a later ordinary one; otherwise the last write wins.
			const write = writes.filter((one) => one.node.important).at(-1) ?? writes.at(-1);
			if (!write) some = true;
			else if (computed(write)) unjudged = true;
			else if (spaced(write.value) === value) some = true;
			else blocked.add(spaced(write.value));
		}
		return {
			name,
			default: value ?? (fallback ? spaced(fallback.value) : undefined),
			blocked: [...blocked],
			judged: some ? "some" : unjudged ? "unjudged" : "every",
		};
	});
}

/**
 * Blocking state blocks grouped by the blocking states they're written for: two `.tabs:disabled` rules, and a
 * `@media` nested in one, are one state. A block that adds a variant or a semantic state is the same state's.
 */
function statesOf(blocks: readonly Block[]): Block[][] {
	const states = new Map<string, Block[]>();
	for (const block of blocks) {
		const key = `${block.element}\n${own(block)
			.filter((condition) => condition.kind === "state" && condition.group === "blocking")
			.map((condition) => compact(condition.text))
			.sort()
			.join("\n")}`;
		const list = states.get(key);
		if (list) list.push(block);
		else states.set(key, [block]);
	}
	return [...states.values()];
}

/** A value read from elsewhere, or computed where it's used: `var()`, `env()`, `attr()`, `if()`. */
function computed(declaration: { readonly reads: readonly Id[]; readonly value: string }): boolean {
	return declaration.reads.length > 0 || /\b(?:env|attr|if)\(/i.test(declaration.value);
}

/**
 * Whether a style query on a flag keeps a part's interaction state off while its component is blocked: it holds only
 * for the flag's default (`style(--q-tabs-blocked: false)`), or it's the one value every blocking state sets, turned
 * around (`not style(--q-tabs-blocked: true)`). A flag the rule can't judge gets no opinion.
 */
function keepsOff(style: StyleQuery, flag: Flag): boolean {
	if (flag.judged === "unjudged") return true;
	if (flag.judged === "some" || style.value === undefined) return false;
	const value = spaced(style.value);
	if (!style.negated) return value === flag.default;
	return flag.blocked.length === 1 && flag.blocked[0] === value;
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
 * (`&:hover`, `&[data-hovered]`), every block it makes is an unguarded interaction state reached only by pointer, and
 * no disable comment applies to it. A run shares one guard.
 */
function wrapsOf(
	model: Model,
	unguarded: readonly { block: Block }[],
	guardFor: (block: Block) => string,
): Map<Block["node"], Edit> {
	const flagged = new Set(unguarded.map(({ block }) => block));
	// The blocks each source rule makes, gathered once.
	const byNode = new Map<Block["node"], Block[]>();
	for (const block of model.blocks) {
		const list = byNode.get(block.node);
		if (list) list.push(block);
		else byNode.set(block.node, [block]);
	}
	const movable = new Map<Rule, string>();
	for (const { block } of unguarded) {
		const rule = block.node;
		if (rule.type !== "rule" || movable.has(rule)) continue;
		const parent = rule.parent;
		if (!parent || (parent.type !== "rule" && parent.type !== "atrule")) continue;
		if (!branchesOf(rule.selector).every((branch) => /^&[:[]/.test(branch) && !hasCombinator(branch)))
			continue;
		// The author may have kept this one on purpose, and a moved rule leaves its comment's line behind.
		if (underDirective(rule)) continue;
		const made = byNode.get(rule) ?? [];
		// A focus state moved into the guard would stop showing on a blocked element.
		if (made.some((other) => own(other).some(holdsFocus))) continue;
		// The guard goes where the rule's `&` stands: on the element, or a pseudo-element's host. A state on a
		// pseudo-element itself (`&::file-selector-button { &:hover { } }`) needs its guard on a host it can't name.
		const onGuarded = (other: Block): boolean =>
			interactions(other).every(
				({ condition }) =>
					condition.on === (elementOf(model, other).kind === "pseudo-element" ? "host" : "subject"),
			);
		if (!made.every(onGuarded)) continue;
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

/**
 * Whether a Stylelint disable comment may apply to a rule, for this rule or any other: one just before it, one on its
 * lines (before it, inside it, after it, or in its selector's text, behind another comment or not), or a `-next-line`
 * one on the line before. A wrap would move the rule to another line, away from the comment or under another one.
 */
function underDirective(rule: Rule): boolean {
	if (isDirective(rule.prev())) return true;
	const raws = rule.raws as { selector?: { raw?: string }; between?: string };
	if (directive.test(`${raws.selector?.raw ?? rule.selector}${raws.between ?? ""}`)) return true;
	const first = rule.source?.start?.line;
	const last = rule.source?.end?.line;
	// With no lines to compare, the rule may be under any comment.
	if (first === undefined || last === undefined) return true;
	let governed = false;
	rule.root().walkComments((comment) => {
		if (!isDirective(comment)) return;
		const from = comment.source?.start?.line;
		const to = comment.source?.end?.line ?? from;
		if (from === undefined || to === undefined) {
			governed = true;
			return;
		}
		const nextLine = /^\s*stylelint-(?:disable|enable)-next-line\b/.test(comment.text);
		if (from <= last && (nextLine ? to + 1 : to) >= first) governed = true;
	});
	return governed;
}

/** `stylelint-disable`, `stylelint-enable`, and their `-line` and `-next-line` forms, for any rule. */
const directive = /stylelint-(?:disable|enable)/;

function isDirective(node: ChildNode | undefined): boolean {
	return node?.type === "comment" && /^\s*stylelint-(?:disable|enable)/.test(node.text);
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
