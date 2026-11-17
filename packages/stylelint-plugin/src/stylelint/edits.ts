// A finding's fix, applied to the tree Stylelint writes out. An edit's offsets come from the copy core read. By the
// time a fix is applied, other fixes may have changed the node, so an edit is applied only to a node whose text is
// the text the edit was computed from, or that text with the plugin's own earlier edits.
import type { AtRule, Container, Node, Rule } from "postcss";

import type { Edit, ReplaceEdit, WrapEdit } from "../rules/rule.js";
import { liveOf } from "./load.js";
import { lineUp, rangeIn } from "./positions.js";

type Edited = Rule | AtRule;

// For each node the plugin has edited: its text after the plugin's last edit, and where each edit ended in the text
// as it was read, with how far the text after it moved.
const known = new WeakMap<Edited, string>();
const shifts = new WeakMap<Edited, { readonly after: number; readonly by: number }[]>();
// For each rule a wrap has moved: the rule it moved it into.
const wrappers = new WeakMap<Rule, Rule>();

function valueOf(node: Edited): string {
	return node.type === "rule" ? node.selector : node.params;
}

/** One edit, placed in the node Stylelint writes out; undefined when it no longer fits there. */
interface Placed {
	readonly live: Edited;
	readonly start: number;
	readonly end: number;
	readonly text: string;
	/** The node's written forms with the same change made in them. */
	readonly raws: Record<string, string> | undefined;
}

function place(edit: ReplaceEdit): Placed | undefined {
	const copy = edit.at.node;
	const live = liveOf(copy);
	if (!live) return undefined;
	// Anything else that rewrote the node moved its text in ways these offsets don't know.
	const value = valueOf(live);
	if (value !== (known.get(live) ?? valueOf(copy))) return undefined;

	const moved = (offset: number): number =>
		(shifts.get(live) ?? []).reduce((at, shift) => (shift.after <= offset ? at + shift.by : at), offset);
	const start = moved(edit.at.index);
	const end = moved(edit.at.endIndex);
	if (value.slice(start, end) !== edit.expects) return undefined;

	// The written forms PostCSS keeps, comments included, get the same change, each where it lines up.
	const kept = (live.type === "rule" ? live.raws.selector : live.raws.params) as
		{ value: string; raw: string; scss?: string } | undefined;
	if (!kept || kept.value !== value) return { live, start, end, text: edit.text, raws: undefined };
	const raws: Record<string, string> = { value: value.slice(0, start) + edit.text + value.slice(end) };
	for (const [form, written] of Object.entries({ raw: kept.raw, scss: kept.scss })) {
		if (written === undefined) continue;
		const lined = lineUp(value, written);
		const range = lined && rangeIn(lined, start, end);
		if (!range) return undefined;
		// An edit never removes what the author wrote between its ends, such as a comment.
		if (written.slice(range[0], range[1]) !== value.slice(start, end)) return undefined;
		raws[form] = written.slice(0, range[0]) + edit.text + written.slice(range[1]);
	}
	return { live, start, end, text: edit.text, raws };
}

/** A wrap, placed in the tree Stylelint writes out: the rules it moves, or `done` when another fix made it already. */
type PlacedWrap = { readonly live: readonly Rule[]; readonly done: boolean };

function placeWrap(edit: WrapEdit): PlacedWrap | undefined {
	const live = edit.rules.flatMap((rule) => liveOf(rule) ?? []);
	if (live.length === 0 || live.length !== edit.rules.length) return undefined;
	// Two findings may carry the same wrap: once one has made it, the other has nothing left to do.
	const moved = live.map((rule) => wrappers.get(rule));
	const [into] = moved;
	if (
		into &&
		moved.every((wrapper) => wrapper === into) &&
		into.selector === edit.selector &&
		into.nodes.length === live.length
	)
		return { live, done: true };
	if (moved.some((wrapper) => wrapper !== undefined)) return undefined;

	// The rules still follow each other in one parent, with the selectors they were read with.
	const [first] = live;
	const parent = first?.parent;
	if (!first || !parent) return undefined;
	const start = parent.index(first);
	const inOrder = live.every((rule, index) => parent.nodes?.[start + index] === rule);
	const unchanged = edit.rules.every((copy, index) => {
		const rule = live[index];
		return rule !== undefined && rule.selector === (known.get(rule) ?? copy.selector);
	});
	return inOrder && unchanged ? { live, done: false } : undefined;
}

/** Whether two edits of one fix change the same text. Such a fix is a fault of its rule, and is never applied. */
export function overlap(edits: readonly Edit[]): boolean {
	return edits.some((one, index) =>
		edits.slice(index + 1).some((other) => {
			if (one.kind === "wrap" || other.kind === "wrap")
				return (
					one.kind === "wrap" && other.kind === "wrap" && one.rules.some((rule) => other.rules.includes(rule))
				);
			if (one.at.node !== other.at.node) return false;
			// Two insertions at one place have no order either.
			return one.at.index < other.at.endIndex && other.at.index < one.at.endIndex
				? true
				: one.at.index === other.at.index && one.at.endIndex === other.at.endIndex;
		}),
	);
}

/** Whether every edit still fits the tree, so the fix can be applied whole. */
export function canApply(edits: readonly Edit[]): boolean {
	return edits.every((edit) => (edit.kind === "wrap" ? placeWrap(edit) : place(edit)) !== undefined);
}

/** Applies a fix. Call it only when `canApply` says the fix still fits. */
export function apply(edits: readonly Edit[]): void {
	for (const edit of edits) {
		if (edit.kind === "wrap") {
			const placed = placeWrap(edit);
			if (placed && !placed.done) wrap(placed.live, edit.selector);
			continue;
		}
		const placed = place(edit);
		if (!placed) continue;
		const { live, start, end, text, raws } = placed;
		const value = valueOf(live);
		const changed = value.slice(0, start) + text + value.slice(end);
		if (live.type === "rule") {
			live.selector = changed;
			if (raws) live.raws.selector = raws as { value: string; raw: string };
		} else {
			live.params = changed;
			if (raws) live.raws.params = raws as { value: string; raw: string };
		}
		known.set(live, changed);
		const moved = shifts.get(live) ?? [];
		moved.push({ after: edit.at.endIndex, by: text.length - (edit.at.endIndex - edit.at.index) });
		shifts.set(live, moved);
	}
}

/**
 * Moves rules into a new rule written where the first stood. The new rule is a clone of the first, emptied, so no
 * PostCSS of the plugin's own is needed. Rules written on lines of their own move one level deeper, by the step
 * between the first rule's indentation and its parent's; rules written on one line stay on it.
 */
function wrap(rules: readonly Rule[], selector: string): void {
	const [first] = rules;
	const parent = first?.parent;
	if (!first || !parent) return;
	const before = first.raws.before ?? "";
	const wrapper = first.clone({ selector });
	wrapper.removeAll();
	delete wrapper.raws.selector;
	parent.insertBefore(first, wrapper);

	const newline = before.lastIndexOf("\n");
	if (newline === -1) {
		wrapper.raws.after = " ";
		wrapper.append(...rules);
		first.raws.before = " ";
	} else {
		const indent = before.slice(newline + 1);
		const outer = indentOf(parent);
		const step = indent.startsWith(outer) && indent.length > outer.length ? indent.slice(outer.length) : "\t";
		wrapper.raws.after = `\n${indent}`;
		for (const rule of rules) deepen(rule, step);
		wrapper.append(...rules);
		first.raws.before = `\n${indent}${step}`;
	}
	for (const rule of rules) wrappers.set(rule, wrapper);
}

/** The indentation a container's own line starts with; none for the root. */
function indentOf(container: Container): string {
	if (container.type === "root" || container.type === "document") return "";
	const before = container.raws.before ?? "";
	const newline = before.lastIndexOf("\n");
	return newline === -1 ? "" : before.slice(newline + 1);
}

/** Indents a node and everything in it by one more step: each line break that starts a written line. */
function deepen(node: Node, step: string): void {
	const raws = node.raws as { before?: string; after?: string };
	for (const field of ["before", "after"] as const) {
		const raw = raws[field];
		if (raw !== undefined) raws[field] = raw.replace(/\n(?!\n)/g, `\n${step}`);
	}
	if ("nodes" in node && Array.isArray(node.nodes))
		for (const child of node.nodes as Node[]) deepen(child, step);
}

/**
 * The node an editor's fix for one problem is given: the smallest one holding everything the fix changes, so the
 * text it writes out holds every edit. Undefined when no node with a place in the source holds them all; the problem
 * then gets no editor fix, and `--fix` still makes it.
 */
export function enclosing(edits: readonly Edit[]): Node | undefined {
	const touched = edits.flatMap((edit): Node[] => {
		if (edit.kind === "replace") {
			const live = liveOf(edit.at.node);
			return live ? [live] : [];
		}
		const [rule] = edit.rules;
		const parent = rule && liveOf(rule)?.parent;
		return parent ? [parent] : [];
	});
	const [first] = touched;
	if (!first || touched.length !== edits.length) return undefined;
	for (let at: Node | undefined = first; at; at = at.parent as Node | undefined) {
		const candidate = at;
		if (!touched.every((node) => within(node, candidate))) continue;
		const placed =
			typeof candidate.source?.start?.offset === "number" && typeof candidate.source.end?.offset === "number";
		return placed ? candidate : undefined;
	}
	return undefined;
}

function within(node: Node, container: Node): boolean {
	for (let at: Node | undefined = node; at; at = at.parent as Node | undefined)
		if (at === container) return true;
	return false;
}
