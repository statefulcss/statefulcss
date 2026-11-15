import { nonStatePseudoClasses } from "@statefulcss/config";
import type { AtRule, Rule } from "postcss";
import parser from "postcss-selector-parser";

import type { UnknownReason } from "../model.js";

/** A simple selector (`.button`, `:hover`, `[data-size="small"]`, `::after`) and the rule it was written in. */
export interface Part {
	node: parser.Node;
	source: Rule | AtRule;
	/** Written inside a `:where()` that holds one compound, so it adds no specificity. */
	inWhere?: boolean;
	/** The `:is()` or `:where()` it was written in, when that holds one compound and no `&`. */
	wrapper?: parser.Pseudo;
	/** Where it's written in `source`, when its node was made, not parsed: `&-icon` for SCSS's `.button-icon`. */
	written?: { readonly index: number; readonly endIndex: number };
}

/** A compound selector: the parts between two combinators. */
export interface Compound {
	/** The combinator before it (" ", ">", "+", "~"); undefined for the first compound. */
	combinator: string | undefined;
	parts: Part[];
	/** Written in the outermost rule, as opposed to added by a rule nested in it (`.dark` in `.card { .dark & { } }`). */
	outer?: boolean;
	/** The root of the `@scope` the rule is in, wherever nesting put it (`.dark &` puts it after `.dark`). */
	scopeRoot?: boolean;
}

/** A complex selector, resolved against its parents. */
export type Complex = Compound[];

export type Parsed = { selectors: parser.Selector[] } | { reason: UnknownReason; detail: string };

/** Parses a selector list, or says why it can't be read. Never throws. */
export function parseSelectorList(selector: string): Parsed {
	const unreadable = unreadableSelector(selector);
	if (unreadable) return unreadable;
	try {
		return { selectors: parser().astSync(selector).nodes };
	} catch (error) {
		return { reason: "unparsable-selector", detail: error instanceof Error ? error.message : String(error) };
	}
}

function unreadableSelector(selector: string): { reason: UnknownReason; detail: string } | undefined {
	const interpolation = /#\{[^}]*\}?|@\{[^}]*\}?/.exec(selector);
	if (interpolation) return { reason: "interpolation", detail: interpolation[0] };
	const placeholder = /\$\{[^}]*\}?|\{\{[^}]*(\}\})?|<%[^%]*(%>)?/.exec(selector);
	if (placeholder) return { reason: "template-placeholder", detail: placeholder[0] };
	if (/:\s*$/.test(selector)) return { reason: "nested-property", detail: selector.trim() };
	const scssPlaceholder = /(?:^|[\s,>+~(])(%[\w-]+)/.exec(selector);
	if (scssPlaceholder?.[1])
		return { reason: "unparsable-selector", detail: `SCSS placeholder ${scssPlaceholder[1]}` };
	return undefined;
}

/** Splits a selector into compounds. With `scopeIsNesting`, `:scope` stands for the `@scope` root, like `&`. */
export function toCompounds(
	selector: parser.Selector,
	source: Rule | AtRule,
	scopeIsNesting = false,
): Compound[] {
	const compounds: Compound[] = [];
	let current: Compound = { combinator: undefined, parts: [] };
	let pending: string | undefined;
	for (const node of selector.nodes) {
		if (node.type === "comment") continue;
		if (node.type === "combinator") {
			if (current.parts.length > 0) compounds.push(current);
			pending = node.value.trim() || " ";
			current = { combinator: pending, parts: [] };
			continue;
		}
		current.parts.push(...partsOf(node, source, scopeIsNesting));
	}
	if (current.parts.length > 0) compounds.push(current);
	return compounds;
}

/** `:is()` and `:where()` with one compound inside select what that compound selects. */
const transparent = new Set([":is", ":where", ":matches", ":-webkit-any", ":-moz-any"]);

/**
 * The parts one simple selector makes. `:is()` or `:where()` around one compound makes that compound's parts, so
 * `:where([data-part="icon"])` names the icon and `:is(&):hover` is the parent's hover. Around a list or a path, it
 * stays one part.
 */
function partsOf(node: parser.Node, source: Rule | AtRule, scopeIsNesting: boolean): Part[] {
	if (scopeIsNesting && node.type === "pseudo" && node.value.toLowerCase() === ":scope")
		return [{ node: parser.nesting({ value: "&" }), source }];
	if (node.type !== "pseudo" || !transparent.has(node.value.toLowerCase())) return [{ node, source }];
	const [only, ...others] = node.nodes;
	const inner = only?.nodes.filter((child) => child.type !== "comment") ?? [];
	const simple = inner.every((child) => child.type !== "combinator" && !isPseudoElement(child));
	if (!only || others.length > 0 || inner.length === 0 || !simple) return [{ node, source }];

	const inWhere = node.value.toLowerCase() === ":where";
	const parts = inner.flatMap((child) => partsOf(child, source, scopeIsNesting));
	// With `&` inside, the wrapper is gone once nesting is resolved, so its parts are written one by one.
	const keepsWrapper = !parts.some(isNesting);
	return parts.map((part) => ({
		...part,
		inWhere: part.inWhere || inWhere,
		wrapper: keepsWrapper ? node : undefined,
	}));
}

const isNesting = (part: Part): boolean => part.node.type === "nesting";

/**
 * A selector whose `:is()` or `:where()` lists parts, `:is([data-part="x"], [data-part="y"])`, as one selector for
 * each part, the way a selector list is: each part is written on. Two such lists make every pair. Any other list
 * stays one condition, so `:is(a, button)` is still a choice of element type.
 */
export function expandPartLists(compounds: Compound[], partAttribute: string): Compound[][] {
	if (!compounds.some((compound) => compound.parts.some((part) => listedParts(part, partAttribute))))
		return [compounds];
	let selectors: Compound[][] = [[]];
	for (const compound of compounds) {
		let alternatives: Part[][] = [[]];
		for (const part of compound.parts) {
			const listed = listedParts(part, partAttribute);
			alternatives = listed
				? alternatives.flatMap((before) => listed.map((one) => [...before, ...one]))
				: alternatives.map((before) => [...before, part]);
		}
		selectors = selectors.flatMap((before) =>
			alternatives.map((parts) => [...before, { ...compound, parts }]),
		);
	}
	return selectors;
}

/**
 * The parts each selector of an `:is()` or `:where()` list makes, when every one of them is a compound that names a
 * part. Each keeps its own `:is()` or `:where()`, written around it alone.
 */
function listedParts(part: Part, partAttribute: string): Part[][] | undefined {
	const { node } = part;
	if (node.type !== "pseudo" || !transparent.has(node.value.toLowerCase()) || node.nodes.length < 2)
		return undefined;
	const lists = node.nodes.map((selector) => selector.nodes.filter((child) => child.type !== "comment"));
	const namesParts = lists.every(
		(nodes) =>
			nodes.every(
				(child) => child.type !== "combinator" && child.type !== "nesting" && !isPseudoElement(child),
			) &&
			nodes.some(
				(child) =>
					child.type === "attribute" &&
					child.attribute.toLowerCase() === partAttribute &&
					child.operator === "=" &&
					Boolean(child.value),
			),
	);
	if (!namesParts) return undefined;
	const inWhere = part.inWhere === true || node.value.toLowerCase() === ":where";
	return node.nodes.map((selector, index) => {
		// Only written, never read: the selector's text shows the one alternative inside its function.
		const wrapper = parser.pseudo({ value: node.value });
		wrapper.append(selector.clone());
		return (lists[index] ?? []).map((child) => ({ node: child, source: part.source, inWhere, wrapper }));
	});
}

/** Whether `&` is written inside a selector function that isn't transparent: `:not(&)`, `:has(&)`, `:is(&, .x)`. */
export function nestingInsideFunction(compounds: readonly Compound[]): string | undefined {
	for (const compound of compounds)
		for (const { node } of compound.parts) {
			if (node.type !== "pseudo") continue;
			let found = false;
			node.walkNesting(() => {
				found = true;
			});
			if (found) return node.value.toLowerCase();
		}
	return undefined;
}

/**
 * Resolves a nested selector against one of its parent's selectors, the way CSS nesting does: `&` is the parent, and a
 * selector without `&` is a descendant of it. SCSS's `&-icon` appends to the parent's last class. Returns undefined for
 * a top-level selector that uses `&`, which has no parent to stand for.
 */
export function resolve(own: Compound[], parent: Complex | undefined): Complex | undefined {
	const hasNesting = own.some((compound) => compound.parts.some(isNesting));
	if (!parent) return hasNesting ? undefined : own;
	if (!hasNesting) {
		const [first, ...rest] = own;
		if (!first) return copy(parent);
		return [...copy(parent), { ...first, combinator: first.combinator ?? " " }, ...rest];
	}

	const result: Complex = [];
	for (const compound of own) {
		const nesting = compound.parts.findIndex(isNesting);
		if (nesting === -1) {
			result.push({ ...compound, parts: [...compound.parts] });
			continue;
		}
		const expanded = copy(parent);
		const head = expanded[0];
		const last = expanded.at(-1);
		if (!head || !last) continue;
		head.combinator = result.length > 0 ? (compound.combinator ?? " ") : head.combinator;

		const rest = compound.parts.filter((part) => !isNesting(part));
		const suffix = compound.parts[nesting + 1];
		if (suffix?.node.type === "tag") {
			appendSuffix(last, suffix, compound.parts[nesting]);
			rest.splice(rest.indexOf(suffix), 1);
		}
		last.parts.push(...rest);
		result.push(...expanded);
	}
	return result;
}

function copy(complex: Complex): Complex {
	return complex.map((compound) => ({ ...compound, parts: [...compound.parts] }));
}

/**
 * SCSS `&-icon`: the parent's last class (or tag) gets the suffix, which makes it a different element. The new name
 * is written as `&-icon`, so that's where it is.
 */
function appendSuffix(compound: Compound, suffix: Part, nesting: Part | undefined): void {
	const value = (suffix.node as parser.Tag).value;
	let index = compound.parts.length - 1;
	while (
		index >= 0 &&
		compound.parts[index]?.node.type !== "class" &&
		compound.parts[index]?.node.type !== "tag"
	)
		index--;
	const target = compound.parts[index];
	if (!target) {
		compound.parts.push(suffix);
		return;
	}
	const node =
		target.node.type === "class"
			? parser.className({ value: `${target.node.value}${value}` })
			: parser.tag({ value: `${(target.node as parser.Tag).value}${value}` });
	const end = (suffix.node.sourceIndex ?? 0) + String(suffix.node).trim().length;
	const start = nesting?.node.sourceIndex ?? suffix.node.sourceIndex ?? 0;
	compound.parts[index] = { node, source: suffix.source, written: { index: start, endIndex: end } };
}

export const isSibling = (combinator: string | undefined): boolean =>
	combinator === "+" || combinator === "~";

/** A resolved selector as text, on one line however it was written. */
export function complexToString(complex: Complex): string {
	return complex
		.map((compound, index) => {
			const written = new Set<parser.Pseudo>();
			const parts = compound.parts
				.map((part) => {
					if (!part.wrapper) return onOneLine(String(part.node));
					// A wrapper is written once, for all the parts it holds.
					if (written.has(part.wrapper)) return "";
					written.add(part.wrapper);
					return onOneLine(String(part.wrapper));
				})
				.join("");
			if (index === 0) return parts;
			return compound.combinator === " " ? ` ${parts}` : ` ${compound.combinator ?? ""} ${parts}`;
		})
		.join("");
}

const quotedOrSpace = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\(\s+|\s+\)|\s+/g;

/** Runs of whitespace become one space, and none is left inside parentheses; quoted strings stay as written. */
function onOneLine(text: string): string {
	return text
		.replace(quotedOrSpace, (match) => {
			if (match.startsWith('"') || match.startsWith("'")) return match;
			if (match.startsWith("(")) return "(";
			return match.endsWith(")") ? ")" : " ";
		})
		.trim();
}

// Config owns the pseudo-classes that are never a state, so what it refuses in a state list is what core never
// compares with one.

/** Pseudo-elements that can be written with one colon: `:before`. */
const legacyPseudoElements = new Set<string>(nonStatePseudoClasses.pseudoElements);

/** Pseudo-classes that wrap a selector: CSS Modules' `:global()`, Vue's `:deep()` and `:slotted()`, and their older spellings. */
const wrappers = new Set<string>([
	...nonStatePseudoClasses.wrappers,
	"::v-deep",
	"::v-slotted",
	"::v-global",
]);

/** `:deep()`, `:slotted()`, `:global()` and their older spellings: what they select belongs to another stylesheet. */
export function isWrapper(node: parser.Node): boolean {
	return node.type === "pseudo" && wrappers.has(node.value.toLowerCase());
}

export function isPseudoElement(node: parser.Node): boolean {
	if (node.type !== "pseudo") return false;
	const value = node.value.toLowerCase();
	return (value.startsWith("::") && !wrappers.has(value)) || legacyPseudoElements.has(value);
}

/** Whether every selector inside `:is()` or `:where()` only names elements (`:where(ul, ol)`), with no states. */
export function listsElements(node: parser.Pseudo): boolean {
	return node.nodes.every((selector) =>
		selector.nodes.every((child) =>
			["tag", "class", "universal", "id", "combinator", "comment"].includes(child.type),
		),
	);
}

/** The index of the parenthesis that closes the one at `open`, or -1. A parenthesis in a quoted string isn't one. */
export function closingParenthesis(text: string, open: number): number {
	let depth = 0;
	let quote: string | undefined;
	for (let index = open; index < text.length; index++) {
		const character = text[index];
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
		} else if (character === '"' || character === "'") quote = character;
		else if (character === "(") depth++;
		else if (character === ")" && --depth === 0) return index;
	}
	return -1;
}
