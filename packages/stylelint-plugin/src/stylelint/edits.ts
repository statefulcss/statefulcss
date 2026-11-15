// A finding's fix, applied to the tree. Stylelint applies a fix as soon as its problem is reported, while other
// findings still hold offsets from before it, so every edit is placed by the text it expects.
import type { AtRule, Rule } from "postcss";

import type { Edit } from "../rules/rule.js";
import { keepOriginal, writtenIn, writtenRange } from "./positions.js";

// For each node the plugin has edited: where each edit ended in the text as it was read, and by how much the text
// after it moved.
const shifts = new WeakMap<Rule | AtRule, { readonly after: number; readonly by: number }[]>();

/** An offset from when the file was read, as an offset in the node's text now. */
function shifted(node: Rule | AtRule, offset: number): number {
	let moved = offset;
	for (const shift of shifts.get(node) ?? []) if (shift.after <= offset) moved += shift.by;
	return moved;
}

/** The node's text now, as PostCSS reads it. */
function valueOf(node: Rule | AtRule): string {
	return node.type === "rule" ? node.selector : node.params;
}

/** Whether every edit still finds the text it expects, so the fix can be applied whole. */
export function canApply(edits: readonly Edit[]): boolean {
	return edits.every((edit) => {
		const start = shifted(edit.at.node, edit.at.index);
		const end = shifted(edit.at.node, edit.at.endIndex);
		return valueOf(edit.at.node).slice(start, end) === edit.expects;
	});
}

/** Applies a fix. Call it only when `canApply` says the fix still fits. */
export function apply(edits: readonly Edit[]): void {
	for (const edit of edits) replace(edit);
}

function replace(edit: Edit): void {
	const node = edit.at.node;
	keepOriginal(node);
	const { text } = writtenIn(node);
	const start = shifted(node, edit.at.index);
	const end = shifted(node, edit.at.endIndex);
	const value = text.value.slice(0, start) + edit.text + text.value.slice(end);

	// The file's own text, with its comments, gets the same change.
	const [rawStart, rawEnd] = writtenRange(text, start, end);
	const raw = text.raw.slice(0, rawStart) + edit.text + text.raw.slice(rawEnd);
	const raws = text.raw === text.value ? undefined : { value, raw };

	if (node.type === "rule") {
		node.selector = value;
		if (raws) node.raws.selector = raws;
	} else {
		node.params = value;
		if (raws) node.raws.params = raws;
	}

	const moved = shifts.get(node) ?? [];
	moved.push({ after: edit.at.endIndex, by: edit.text.length - (edit.at.endIndex - edit.at.index) });
	shifts.set(node, moved);
}
