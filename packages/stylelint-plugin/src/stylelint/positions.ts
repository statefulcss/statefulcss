// Core's places, turned into what Stylelint reports with: a node, and an index and end index inside that node's
// source text.
import type { AtRule, Declaration, Node, Rule } from "postcss";

import type { Place } from "../rules/rule.js";

/** Where Stylelint reports: a node, and the offsets in its source text. Without offsets, the whole node. */
export interface Span {
	readonly node: Node;
	readonly index?: number;
	readonly endIndex?: number;
}

export function spanOf(place: Place): Span {
	const node: Node = place.node;
	if ("index" in place) {
		// A node the plugin has edited is still reported where the file wrote it.
		const { text, start } = originals.get(place.node) ?? writtenIn(place.node);
		const [index, endIndex] = writtenRange(text, place.index, place.endIndex);
		return { node, index: start + index, endIndex: start + endIndex };
	}
	if (!("part" in place) || place.part === undefined || node.type !== "decl") return { node };
	const declaration = node as Declaration;
	if (place.part === "property") return { node, index: 0, endIndex: declaration.prop.length };
	// The value starts after the property and what's written between them: `:` and its spaces.
	const start = declaration.prop.length + (declaration.raws.between ?? ":").length;
	const raw = declaration.raws.value;
	const value = raw && raw.value === declaration.value ? raw.raw : declaration.value;
	return { node, index: start, endIndex: start + value.length };
}

/** A selector or an at-rule's parameters: the text PostCSS reads, the text the file holds, and how they line up. */
export interface Written {
	/** As PostCSS gives it, with comments beside a space left out. Core's offsets count in this. */
	readonly value: string;
	/** As the file writes it. */
	readonly raw: string;
	/** An offset in `value`, as an offset in `raw`. */
	written(offset: number): number;
}

/** The text a position's offsets count in, and where that text starts in its node's source. */
export interface WrittenText {
	readonly text: Written;
	readonly start: number;
}

// Core's offsets, and Stylelint's, count in the file as it was read. A fix changes a node's text, so the text a
// node had is kept from just before its first edit.
const originals = new WeakMap<Rule | AtRule, WrittenText>();

/** Keeps a node's text as the file wrote it. Called before the node's first edit. */
export function keepOriginal(node: Rule | AtRule): void {
	if (!originals.has(node)) originals.set(node, writtenIn(node));
}

/** A range in the text PostCSS reads, as a range in the text the file holds. A comment after it stays outside. */
export function writtenRange(text: Written, index: number, endIndex: number): [number, number] {
	const start = text.written(index);
	return [start, endIndex > index ? text.written(endIndex - 1) + 1 : start];
}

export function writtenIn(node: Rule | AtRule): WrittenText {
	if (node.type === "rule") {
		const raw = node.raws.selector;
		return {
			text: align(node.selector, raw && raw.value === node.selector ? raw.raw : node.selector),
			start: 0,
		};
	}
	const raw = node.raws.params;
	return {
		text: align(node.params, raw && raw.value === node.params ? raw.raw : node.params),
		// `@`, the name, and the space after it.
		start: 1 + node.name.length + (node.raws.afterName ?? "").length,
	};
}

/**
 * Lines up the text PostCSS reads with the text the file holds. They differ only by what PostCSS leaves out: a
 * comment beside a space, and space at the end.
 */
function align(value: string, raw: string): Written {
	if (value === raw) return { value, raw, written: (offset) => offset };
	// For each offset in `value`, its offset in `raw`; one more entry for the end.
	const offsets: number[] = [];
	let at = 0;
	for (let index = 0; index < value.length;) {
		// A comment PostCSS kept is in both texts, and is walked through like any other text.
		const leftOut = raw.startsWith("/*", at) && !value.startsWith("/*", index);
		if (at < raw.length && (leftOut || raw[at] !== value[index])) {
			at = skip(raw, at);
			continue;
		}
		offsets.push(at);
		at++;
		index++;
	}
	offsets.push(Math.min(at, raw.length));
	return { value, raw, written: (offset) => offsets[Math.min(Math.max(offset, 0), value.length)] ?? offset };
}

/** The offset after what starts at `at`: a comment, an SCSS comment that runs to the end of its line, or one character. */
function skip(raw: string, at: number): number {
	if (raw.startsWith("/*", at)) {
		const end = raw.indexOf("*/", at + 2);
		return end === -1 ? raw.length : end + 2;
	}
	if (raw.startsWith("//", at)) {
		const end = raw.indexOf("\n", at);
		return end === -1 ? raw.length : end;
	}
	return at + 1;
}
