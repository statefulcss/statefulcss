// A finding's fix, applied to the tree Stylelint writes out. An edit's offsets come from the copy core read. By the
// time a fix is applied, other fixes may have changed the node, so an edit is applied only to a node whose text is
// the text the edit was computed from, or that text with the plugin's own earlier edits.
import type { AtRule, Rule } from "postcss";

import type { Edit } from "../rules/rule.js";
import { liveOf } from "./load.js";
import { lineUp, rangeIn } from "./positions.js";

type Edited = Rule | AtRule;

// For each node the plugin has edited: its text after the plugin's last edit, and where each edit ended in the text
// as it was read, with how far the text after it moved.
const known = new WeakMap<Edited, string>();
const shifts = new WeakMap<Edited, { readonly after: number; readonly by: number }[]>();

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

function place(edit: Edit): Placed | undefined {
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

/** Whether two edits of one fix change the same text. Such a fix is a fault of its rule, and is never applied. */
export function overlap(edits: readonly Edit[]): boolean {
	return edits.some((one, index) =>
		edits.slice(index + 1).some((other) => {
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
	return edits.every((edit) => place(edit) !== undefined);
}

/** Applies a fix. Call it only when `canApply` says the fix still fits. */
export function apply(edits: readonly Edit[]): void {
	for (const edit of edits) {
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
