// Core's places, turned into what Stylelint reports with: a node, and an index and end index inside that node's
// source text. The node is one of the copy core read, which is the code Stylelint parsed for this run of the rules.
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
		const text = writtenIn(place.node);
		const range = text && rangeIn(text.lined, place.index, place.endIndex);
		// A place the file's own text can't confirm is reported on its whole node.
		return range ? { node, index: text.start + range[0], endIndex: text.start + range[1] } : { node };
	}
	if (!("part" in place) || place.part === undefined || node.type !== "decl") return { node };
	const declaration = node as Declaration;
	if (!writtenAt(declaration, 0, declaration.prop)) return { node };
	if (place.part === "property") return { node, index: 0, endIndex: declaration.prop.length };
	// The value starts after the property and what's written between them: `:` and its spaces.
	const start = declaration.prop.length + (declaration.raws.between ?? ":").length;
	const value = writtenForm(declaration.raws.value, declaration.value);
	return writtenAt(declaration, start, value)
		? { node, index: start, endIndex: start + value.length }
		: { node };
}

/** What PostCSS keeps beside a selector, a parameter list or a value whose written form it cleaned up. */
interface Raws {
	readonly value: string;
	readonly raw: string;
	/** From postcss-scss: the text with its `//` comments, where `raw` has them as CSS comments. */
	readonly scss?: string;
}

/** The text as the file writes it: with the comments PostCSS left out, and an SCSS line comment as `//`. */
function writtenForm(raws: unknown, value: string): string {
	const kept = raws as Raws | undefined;
	return kept && kept.value === value ? (kept.scss ?? kept.raw) : value;
}

/** Whether a node's source holds `text` at an offset from the node's start. */
function writtenAt(node: Node, offset: number, text: string): boolean {
	const input = node.source?.input;
	const start = node.source?.start?.offset;
	if (!input || start === undefined) return false;
	// A `.vue` file's offsets count in the whole file.
	const source = "document" in input && typeof input.document === "string" ? input.document : input.css;
	return source.startsWith(text, start + offset);
}

/** A selector or an at-rule's parameters, lined up with the text the file holds, and where that text starts. */
interface WrittenText {
	readonly lined: Lined;
	readonly start: number;
}

/**
 * The text a position's offsets count in, lined up with the file. Undefined when the file doesn't hold that text
 * where the node says, as when another tool changed the tree before the plugin saw it.
 */
function writtenIn(node: Rule | AtRule): WrittenText | undefined {
	const value = node.type === "rule" ? node.selector : node.params;
	const raws = node.type === "rule" ? node.raws.selector : node.raws.params;
	// An at-rule's parameters come after `@`, its name, and the space after it.
	const start = node.type === "rule" ? 0 : 1 + node.name.length + (node.raws.afterName ?? "").length;
	const written = writtenForm(raws, value);
	if (!writtenAt(node, start, written)) return undefined;
	const lined = lineUp(value, written);
	return lined && { lined, start };
}

/** The text PostCSS reads, and for each of its offsets the offset in a written form of it; one more for its end. */
export interface Lined {
	readonly value: string;
	readonly written: string;
	readonly offsets: readonly number[];
}

/** A range in the text PostCSS reads, as a range in the written text. A comment after it stays outside. */
export function rangeIn(lined: Lined, index: number, endIndex: number): [number, number] | undefined {
	const start = lined.offsets[index];
	const last = lined.offsets[endIndex > index ? endIndex - 1 : index];
	if (start === undefined || last === undefined) return undefined;
	return [start, endIndex > index ? last + 1 : start];
}

/**
 * Lines up the text PostCSS reads with a written form of it. They differ by what PostCSS leaves out or rewrites: a
 * comment beside a space is left out, space at the end is left out, and postcss-scss turns a `//` comment it keeps
 * into a CSS comment. Each comment is tried both ways, so two comments side by side are told apart. Undefined when
 * the two texts can't be lined up.
 */
export function lineUp(value: string, written: string): Lined | undefined {
	if (value === written)
		return { value, written, offsets: Array.from({ length: value.length + 1 }, (_, at) => at) };
	const pieces = piecesOf(written);
	if (pieces.filter((piece) => piece.comment).length > 12) return undefined;
	const offsets: number[] = [];

	const match = (piece: number, at: number): boolean => {
		const one = pieces[piece];
		if (!one) return at === value.length;
		const text = written.slice(one.start, one.end);
		const mark = offsets.length;
		const take = (length: number, offsetOf: (index: number) => number): boolean => {
			for (let index = 0; index < length; index++) offsets.push(offsetOf(index));
			if (match(piece + 1, at + length)) return true;
			offsets.length = mark;
			return false;
		};
		if (!one.comment) {
			if (value.startsWith(text, at)) return take(text.length, (index) => one.start + index);
			// Space at the end of the written text is left out.
			const rest = value.slice(at);
			return text.startsWith(rest) && text.slice(rest.length).trim() === "" && piece === pieces.length - 1
				? take(rest.length, (index) => one.start + index)
				: false;
		}
		// Kept as written; kept as a CSS comment, for an SCSS line comment; or left out.
		if (value.startsWith(text, at) && take(text.length, (index) => one.start + index)) return true;
		const converted = text.startsWith("//") ? `/*${text.slice(2)}*/` : undefined;
		if (converted && value.startsWith(converted, at)) {
			if (take(converted.length, (index) => one.start + Math.min(index, text.length - 1))) return true;
		}
		return match(piece + 1, at);
	};

	if (!match(0, 0)) return undefined;
	offsets.push(written.length);
	// The end of the text PostCSS reads is the end of what was matched, not of the space after it.
	const last = offsets[value.length - 1];
	if (last !== undefined) offsets[value.length] = last + 1;
	return { value, written, offsets };
}

interface Piece {
	readonly start: number;
	readonly end: number;
	readonly comment: boolean;
}

/** A written text as runs of plain text and comments. A quoted string is plain text, whatever it holds. */
function piecesOf(written: string): Piece[] {
	const pieces: Piece[] = [];
	let start = 0;
	let at = 0;
	const plain = (end: number): void => {
		if (end > start) pieces.push({ start, end, comment: false });
	};
	while (at < written.length) {
		const character = written[at];
		if (character === '"' || character === "'") {
			at++;
			while (at < written.length && written[at] !== character) at += written[at] === "\\" ? 2 : 1;
			at++;
		} else if (written.startsWith("/*", at) || written.startsWith("//", at)) {
			const block = written.startsWith("/*", at);
			const found = block ? written.indexOf("*/", at + 2) : written.indexOf("\n", at);
			const end = found === -1 ? written.length : block ? found + 2 : found;
			plain(at);
			pieces.push({ start: at, end, comment: true });
			start = at = end;
		} else at++;
	}
	plain(written.length);
	return pieces;
}
