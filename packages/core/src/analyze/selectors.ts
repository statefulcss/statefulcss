import type { AtRule, Rule } from "postcss";
import parser from "postcss-selector-parser";

import type { UnknownReason } from "../model.js";

/** A simple selector (`.button`, `:hover`, `[data-size="small"]`, `::after`) and the rule it was written in. */
export interface Part {
	node: parser.Node;
	source: Rule | AtRule;
}

/** A compound selector: the parts between two combinators. */
export interface Compound {
	/** The combinator before it (" ", ">", "+", "~"); undefined for the first compound. */
	combinator: string | undefined;
	parts: Part[];
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
		const isScope = scopeIsNesting && node.type === "pseudo" && node.value.toLowerCase() === ":scope";
		current.parts.push({ node: isScope ? parser.nesting({ value: "&" }) : node, source });
	}
	if (current.parts.length > 0) compounds.push(current);
	return compounds;
}

const isNesting = (part: Part): boolean => part.node.type === "nesting";

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
			appendSuffix(last, suffix);
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

/** SCSS `&-icon`: the parent's last class (or tag) gets the suffix, which makes it a different element. */
function appendSuffix(compound: Compound, suffix: Part): void {
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
	compound.parts[index] = { node, source: suffix.source };
}

export const isSibling = (combinator: string | undefined): boolean =>
	combinator === "+" || combinator === "~";

export function complexToString(complex: Complex): string {
	return complex
		.map((compound, index) => {
			const parts = compound.parts.map((part) => String(part.node).trim()).join("");
			if (index === 0) return parts;
			return compound.combinator === " " ? ` ${parts}` : ` ${compound.combinator ?? ""} ${parts}`;
		})
		.join("");
}

const legacyPseudoElements = new Set([":before", ":after", ":first-line", ":first-letter"]);

/** Pseudo-classes that wrap a selector: CSS Modules' `:global()`, Vue's `:deep()` and `:slotted()`. */
const wrappers = new Set([":global", ":deep", ":slotted", "::v-deep", "::v-slotted", "::v-global"]);

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
