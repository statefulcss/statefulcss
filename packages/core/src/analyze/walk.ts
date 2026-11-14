// Pass 1. Walks the tree once and lists what the later passes read: every place declarations sit, with its selector
// resolved and what's around it; the scopes as written; doc comments; and what core can't read.
import type { AtRule, ChildNode, Comment, Container, Document, Node, Root, Rule } from "postcss";
import type parser from "postcss-selector-parser";

import type { OtherAtRule, ScopeRootForm, UnknownReason } from "../model.js";
import { type SheetKind, sheetKind } from "./files.js";
import { type Complex, type Compound, parseSelectorList, resolve, toCompounds } from "./selectors.js";

export interface Walked {
	/** One per stylesheet. Outside Vue there's one. */
	readonly sheets: readonly SheetKind[];
	/** In document order. */
	readonly blocks: readonly WalkedBlock[];
	readonly scopes: readonly WalkedScope[];
	readonly docComments: readonly WalkedDocComment[];
	/** `@property` rules, not read yet. */
	readonly registrations: readonly AtRule[];
	readonly atRules: readonly OtherAtRule[];
	readonly unknowns: readonly WalkedUnknown[];
}

/** One resolved selector of one rule that has declarations. */
export interface WalkedBlock {
	/** The rule, or the at-rule when declarations sit directly in a nested `@media` or in an `@scope`. */
	readonly node: Rule | AtRule;
	/** Resolved against its parent rules and its scope's root. */
	readonly selector: Complex;
	/** `@media`, `@container`, `@supports` and `@starting-style` around it, outermost first. */
	readonly atRules: readonly AtRule[];
	/** The `@layer` around it, dotted when nested; undefined when unlayered. */
	readonly layer: string | undefined;
	/** The scope it's in, as an index into `scopes`. */
	readonly scope: number | undefined;
	/** How it writes its scope's root, when it does: `:scope > …` or `& > …`. */
	readonly scopeRoot: ScopeRootForm | undefined;
	readonly sheet: number;
}

/** An `@scope`, as written. */
export interface WalkedScope {
	readonly node: AtRule;
	/** Its root, when it's one compound; undefined when core doesn't read the scope. */
	readonly root: Compound | undefined;
	readonly rootText: string | undefined;
	readonly limit: string | undefined;
	/** Written inside a rule. */
	readonly nested: boolean;
	readonly sheet: number;
}

/** A doc comment outside any rule or scope. */
export interface WalkedDocComment {
	readonly node: Comment;
	/** The node right after it, other comments aside. */
	readonly next: ChildNode | undefined;
	readonly sheet: number;
}

export interface WalkedUnknown {
	readonly node: Node;
	readonly reason: UnknownReason;
	readonly detail: string | undefined;
	/** The resolved selectors of the rule it sits in; empty at the top level. */
	readonly selectors: readonly Complex[];
	readonly scope: number | undefined;
	readonly sheet: number;
}

/** At-rules whose blocks are states or `@supports` of the element they're in. */
const conditionalAtRules = new Set(["media", "container", "supports", "starting-style"]);

/** At-rules that don't style elements. Recorded, not walked. */
const otherAtRules = new Set([
	"charset",
	"counter-style",
	"custom-media",
	"custom-selector",
	"font-face",
	"font-feature-values",
	"font-palette-values",
	"import",
	"keyframes",
	"-webkit-keyframes",
	"layer",
	"namespace",
	"page",
	"position-try",
	"view-transition",
]);

/** A selector that rules nested in it resolve against. */
interface Parent {
	readonly selector: Complex;
	readonly scopeRoot: ScopeRootForm | undefined;
}

interface Context {
	/** The selectors of the rule around, or the scope's root; undefined at the top level. */
	readonly parents: readonly Parent[] | undefined;
	/** Inside a rule, as opposed to directly in a scope or at the top level. */
	readonly inRule: boolean;
	readonly atRules: readonly AtRule[];
	readonly layers: readonly string[];
	readonly scope: number | undefined;
	/** Directly inside `@scope`: `:scope` and `&` stand for the scope's root. */
	readonly scopeTop: boolean;
	readonly sheet: number;
}

/** What one walk gathers. Local to `walk`: nothing outside it sees these arrays change. */
interface Found {
	readonly blocks: WalkedBlock[];
	readonly scopes: WalkedScope[];
	readonly docComments: WalkedDocComment[];
	readonly registrations: AtRule[];
	readonly atRules: OtherAtRule[];
	readonly unknowns: WalkedUnknown[];
}

/**
 * Walks one file. In a Vue file, plain `<style>` blocks are one sheet, scoped blocks another, and each `<style module>`
 * its own. Never throws on syntax it doesn't understand, and never changes the tree.
 */
export function walk(root: Root | Document): Walked {
	const path = root.source?.input.file;
	const roots = root.type === "document" ? root.nodes.filter((node) => node.type === "root") : [root];
	const sheets: SheetKind[] = [];
	const shared = new Map<SheetKind, number>();
	const found: Found = {
		blocks: [],
		scopes: [],
		docComments: [],
		registrations: [],
		atRules: [],
		unknowns: [],
	};

	for (const sheetRoot of roots) {
		const kind = sheetKind(sheetRoot, path);
		let sheet = kind === "module" ? undefined : shared.get(kind);
		if (sheet === undefined) {
			sheet = sheets.push(kind) - 1;
			if (kind !== "module") shared.set(kind, sheet);
		}
		walkContainer(
			sheetRoot,
			{
				parents: undefined,
				inRule: false,
				atRules: [],
				layers: [],
				scope: undefined,
				scopeTop: false,
				sheet,
			},
			found,
		);
	}
	return { sheets, ...found };
}

function walkContainer(container: Container, context: Context, found: Found): void {
	for (const node of container.nodes ?? []) {
		try {
			if (node.type === "rule") visitRule(node, context, found);
			else if (node.type === "atrule") visitAtRule(node, context, found);
			else if (node.type === "comment") visitComment(node, context, found);
		} catch (error) {
			unknown(found, context, node, "internal", error instanceof Error ? error.message : String(error));
		}
	}
}

function visitRule(rule: Rule, context: Context, found: Found): void {
	const parsed = parseSelectorList(rule.selector);
	if ("reason" in parsed) {
		unknown(found, context, rule, parsed.reason, parsed.detail);
		return;
	}
	const resolved: Parent[] = [];
	for (const selector of parsed.selectors) {
		const own = toCompounds(selector, rule, context.scopeTop);
		const written = context.scopeTop ? scopeRootForm(selector) : undefined;
		for (const parent of context.parents ?? [undefined]) {
			const complex = resolve(own, parent?.selector);
			if (!complex) {
				unknown(found, context, rule, "unparsable-selector", "& outside a rule");
				return;
			}
			resolved.push({ selector: complex, scopeRoot: written ?? parent?.scopeRoot });
		}
	}
	if (hasDeclarations(rule)) {
		for (const parent of resolved) found.blocks.push(blockOf(rule, parent, context));
	}
	walkContainer(rule, { ...context, parents: resolved, inRule: true, scopeTop: false }, found);
}

function visitAtRule(atRule: AtRule, context: Context, found: Found): void {
	const name = atRule.name.toLowerCase();
	if (conditionalAtRules.has(name)) {
		const inner = { ...context, atRules: [...context.atRules, atRule] };
		if (context.parents && hasDeclarations(atRule)) {
			for (const parent of context.parents) found.blocks.push(blockOf(atRule, parent, inner));
		}
		walkContainer(atRule, inner, found);
	} else if (name === "layer" && atRule.nodes) {
		walkContainer(atRule, { ...context, layers: [...context.layers, atRule.params.trim()] }, found);
	} else if (name === "scope") {
		visitScope(atRule, context, found);
	} else if (name === "property") {
		found.registrations.push(atRule);
	} else if (otherAtRules.has(name)) {
		found.atRules.push({ name, node: atRule });
	} else {
		unknown(found, context, atRule, "unknown-at-rule", `@${atRule.name}`);
	}
}

/**
 * `@scope (.card) to ([data-component])`: the rules inside it are under the scope's root, and `:scope` or `&` at their
 * start is the root itself. A scope with no root, a list of roots or a path as its root is recorded, and what's inside
 * it isn't read. A scope nested in a rule has that rule's element as its root only when it's written `@scope (&)`.
 */
function visitScope(atRule: AtRule, context: Context, found: Found): void {
	const prelude = scopePrelude(atRule.params);
	const root = scopeRoot(prelude, atRule, context);
	const index = found.scopes.length;
	found.scopes.push({
		node: atRule,
		root: "reason" in root ? undefined : root,
		rootText: prelude.root,
		limit: prelude.limit,
		nested: context.inRule,
		sheet: context.sheet,
	});
	if ("reason" in root) {
		unknown(found, context, atRule, root.reason, root.detail);
		return;
	}
	const parent: Parent = { selector: [root], scopeRoot: undefined };
	const inner = { ...context, parents: [parent], inRule: false, scope: index, scopeTop: true };
	if (hasDeclarations(atRule)) found.blocks.push(blockOf(atRule, parent, inner));
	walkContainer(atRule, inner, found);
}

/** A doc comment (`/** … *\/`) outside any rule or scope, with the node it's written above. */
function visitComment(comment: Comment, context: Context, found: Found): void {
	if (context.parents || !isDocComment(comment)) return;
	let next = comment.next();
	while (next?.type === "comment") next = next.next();
	found.docComments.push({ node: comment, next, sheet: context.sheet });
}

function blockOf(node: Rule | AtRule, parent: Parent, context: Context): WalkedBlock {
	return {
		node,
		selector: parent.selector,
		atRules: context.atRules,
		layer: context.layers.length > 0 ? context.layers.join(".") : undefined,
		scope: context.scope,
		scopeRoot: parent.scopeRoot,
		sheet: context.sheet,
	};
}

function unknown(
	found: Found,
	context: Context,
	node: Node,
	reason: UnknownReason,
	detail: string | undefined,
): void {
	found.unknowns.push({
		node,
		reason,
		detail,
		selectors: context.parents?.map((parent) => parent.selector) ?? [],
		scope: context.scope,
		sheet: context.sheet,
	});
}

function hasDeclarations(container: Container): boolean {
	// SCSS variables (`$gap: …`) aren't CSS declarations.
	return (container.nodes ?? []).some((node) => node.type === "decl" && !node.prop.startsWith("$"));
}

function isDocComment(comment: Comment): boolean {
	// PostCSS drops the delimiters, so `/** Card */` arrives as `* Card`. SCSS's `//` comments are never doc comments.
	const inline = (comment.raws as { inline?: boolean }).inline === true;
	return !inline && comment.text.startsWith("*");
}

/** How a selector written directly in a scope names the scope's root. */
function scopeRootForm(selector: parser.Selector): ScopeRootForm | undefined {
	if (selector.nodes.some((node) => node.type === "pseudo" && node.value.toLowerCase() === ":scope"))
		return ":scope";
	return selector.nodes.some((node) => node.type === "nesting") ? "&" : undefined;
}

interface ScopePrelude {
	readonly root: string | undefined;
	/** Where the root starts in the at-rule's parameters. */
	readonly rootIndex: number;
	readonly limit: string | undefined;
}

/** The root and the limit of `@scope (root) to (limit)`, each as written. */
function scopePrelude(params: string): ScopePrelude {
	const start = params.length - params.trimStart().length;
	let rest = params.slice(start);
	let root: string | undefined;
	let rootIndex = 0;
	if (rest.startsWith("(")) {
		const end = closingParenthesis(rest);
		if (end === -1) return { root: undefined, rootIndex, limit: undefined };
		const inside = rest.slice(1, end);
		root = inside.trim() || undefined;
		rootIndex = start + 1 + (inside.length - inside.trimStart().length);
		rest = rest.slice(end + 1).trim();
	}
	const to = /^to\s*(?=\()/i.exec(rest);
	if (!to) return { root, rootIndex, limit: undefined };
	const group = rest.slice(to[0].length);
	const end = closingParenthesis(group);
	return { root, rootIndex, limit: end === -1 ? undefined : group.slice(1, end).trim() || undefined };
}

/** The index of the parenthesis that closes the one a text starts with, or -1. */
function closingParenthesis(text: string): number {
	let depth = 0;
	for (let index = 0; index < text.length; index++) {
		if (text[index] === "(") depth++;
		else if (text[index] === ")" && --depth === 0) return index;
	}
	return -1;
}

/**
 * A scope's root as one compound, or why core doesn't read the scope. Inside a rule or another scope, the root is
 * relative to it, like a nested selector: `.card { @scope (.title) { … } }` scopes `.card .title`, which is a path.
 */
function scopeRoot(
	prelude: ScopePrelude,
	atRule: AtRule,
	context: Context,
): Compound | { reason: UnknownReason; detail: string } {
	if (prelude.root === undefined) return { reason: "scope-root", detail: "@scope without a root" };
	// Padded, so each part's offset is its place in the at-rule's parameters.
	const parsed = parseSelectorList(" ".repeat(prelude.rootIndex) + prelude.root);
	if ("reason" in parsed) return parsed;
	const [selector, ...others] = parsed.selectors;
	if (!selector || others.length > 0) return { reason: "scope-root", detail: "@scope with a list of roots" };
	if (context.parents && context.parents.length > 1)
		return { reason: "scope-root", detail: "@scope with a list of roots" };

	const complex = resolve(toCompounds(selector, atRule), context.parents?.[0]?.selector);
	if (!complex) return { reason: "unparsable-selector", detail: "& outside a rule" };
	const [compound, ...path] = complex;
	if (!compound || path.length > 0) return { reason: "scope-root", detail: "@scope with a path as its root" };
	return { ...compound, combinator: undefined };
}
