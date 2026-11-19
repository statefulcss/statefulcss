// Pass 1. Walks the tree once and lists what the later passes read: every place declarations sit, with its selector
// resolved and what's around it; the scopes as written; doc comments; and what core can't read.
import { defaults } from "@statefulcss/config";
import type { AtRule, ChildNode, Comment, Container, Declaration, Document, Node, Root, Rule } from "postcss";
import type parser from "postcss-selector-parser";

import type { OtherAtRule, Position, ScopeRootForm, UnknownReason } from "../model.js";
import { type SheetKind, sheetKind } from "./files.js";
import {
	closingParenthesis,
	type Complex,
	type Compound,
	expandPartLists,
	nestingInsideFunction,
	parseSelectorList,
	resolve,
	toCompounds,
} from "./selectors.js";

export interface Walked {
	/** One per stylesheet. Outside Vue there's one. */
	readonly sheets: readonly SheetKind[];
	/** Every style rule, with or without declarations, in document order. */
	readonly rules: readonly WalkedRule[];
	/** In document order. */
	readonly blocks: readonly WalkedBlock[];
	readonly scopes: readonly WalkedScope[];
	readonly docComments: readonly WalkedDocComment[];
	/** `@property` rules, not read yet. */
	readonly registrations: readonly AtRule[];
	readonly atRules: readonly OtherAtRule[];
	readonly unknowns: readonly WalkedUnknown[];
}

/** A style rule. A root block with nothing in it but nested rules is still the component's root block. */
export interface WalkedRule {
	readonly node: Rule;
	/** Resolved against its parent rules and its scope's root. */
	readonly selectors: readonly Complex[];
	readonly layer: string | undefined;
	readonly scope: number | undefined;
	readonly sheet: number;
	/** Its place among the file's rules and scopes, for "written after". */
	readonly order: number;
}

/**
 * One resolved selector of one run of declarations. A rule's declarations are one run, unless a nested rule that
 * declares something is written among them: then each run is a block of its own, in the order they're written. A rule
 * with nothing in it, or a run with something core can't read (`@include`), is a block too, with what it can see.
 */
export interface WalkedBlock {
	/** The rule, or the at-rule when declarations sit directly in a nested `@media` or in an `@scope`. */
	readonly node: Rule | AtRule;
	/** The declarations of this run, as written; SCSS variables aside. */
	readonly declarations: readonly Declaration[];
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
	/** Where that `:scope` or `&` is written: in this rule, or in the rule around it that wrote it. */
	readonly scopeRootAt: Position | undefined;
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
	readonly layer: string | undefined;
	readonly sheet: number;
	/** Its place among the file's rules and scopes, for "written after". */
	readonly order: number;
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
	readonly layer: string | undefined;
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
	readonly scopeRoot: WrittenScopeRoot | undefined;
}

/** How a rule directly in a scope writes the scope's root, and where. */
interface WrittenScopeRoot {
	readonly form: ScopeRootForm;
	readonly at: Position;
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
	/** The settings' part attribute, lowercased: `data-part`. */
	readonly partAttribute: string;
}

/** What one walk gathers. Local to `walk`: nothing outside it sees these arrays change. */
interface Found {
	readonly rules: WalkedRule[];
	readonly blocks: WalkedBlock[];
	readonly scopes: WalkedScope[];
	readonly docComments: WalkedDocComment[];
	readonly registrations: AtRule[];
	readonly atRules: OtherAtRule[];
	readonly unknowns: WalkedUnknown[];
}

/**
 * Walks one file. In a Vue file, plain `<style>` blocks are one sheet, scoped blocks another, and each `<style module>`
 * its own. Never throws on syntax it doesn't understand, and never changes the tree. The part attribute, lowercased,
 * is the settings' (`data-part`).
 */
export function walk(root: Root | Document, partAttribute = defaults.partAttribute): Walked {
	const path = root.source?.input.file;
	const roots = root.type === "document" ? root.nodes.filter((node) => node.type === "root") : [root];
	const sheets: SheetKind[] = [];
	const shared = new Map<SheetKind, number>();
	const found: Found = {
		rules: [],
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
				partAttribute,
			},
			found,
		);
	}
	return { sheets, ...found };
}

/**
 * Walks what a sheet, a rule, a query, a layer or a scope holds. With `declares`, the declarations written directly
 * inside belong to the elements of `context.parents`. They become blocks in the order they're written: a nested rule
 * that declares something ends the run before it, so `.card { & { --s-v: 1 } --s-v: 2 }` writes 1 before 2.
 */
function walkContainer(container: Container, context: Context, found: Found, declares?: Rule | AtRule): void {
	let run: Declaration[] = [];
	// The run holds something core can't read, such as an `@include`, that may declare anything.
	let unread = false;
	const blocksOf = (declarations: readonly Declaration[], always: boolean): WalkedBlock[] =>
		declares && (declarations.length > 0 || always)
			? (context.parents ?? []).map((parent) => blockOf(declares, parent, context, declarations))
			: [];

	for (const node of container.nodes ?? []) {
		try {
			if (node.type === "decl") {
				// SCSS variables (`$gap: …`) aren't CSS declarations.
				if (!node.prop.startsWith("$")) run.push(node);
			} else if (node.type === "comment") visitComment(node, context, found);
			else {
				const before = found.blocks.length;
				const unknownsBefore = found.unknowns.length;
				if (node.type === "rule") visitRule(node, context, found);
				else visitAtRule(node, context, found);
				if (
					node.type === "atrule" &&
					found.unknowns
						.slice(unknownsBefore)
						.some((one) => one.node === node && one.reason === "unknown-at-rule")
				)
					unread = true;
				// Only what declares something splits a run: the run goes before the blocks it made. A block with no
				// declarations splits nothing, so the run's block comes after it.
				const declared = found.blocks.slice(before).some((block) => block.declarations.length > 0);
				if (declared && (run.length > 0 || unread)) {
					found.blocks.splice(before, 0, ...blocksOf(run, unread));
					run = [];
					unread = false;
				}
			}
		} catch (error) {
			unknown(found, context, node, "internal", error instanceof Error ? error.message : String(error));
		}
	}
	// A rule with nothing in it, or only what core can't read, is still a block: its selector is written, with no
	// declarations core can see.
	const empty = (container.nodes ?? []).every((node) => node.type === "comment");
	found.blocks.push(...blocksOf(run, unread || (empty && container.type === "rule")));
}

function visitRule(rule: Rule, context: Context, found: Found): void {
	const parsed = parseSelectorList(rule.selector);
	if ("reason" in parsed) {
		unknown(found, context, rule, parsed.reason, parsed.detail);
		return;
	}
	const resolved: Parent[] = [];
	// A selector core can't read is unknown on its own: the others in the list are still read.
	for (const selector of parsed.selectors) {
		// What the outermost rule writes is where its component is named; a nested rule only adds to it. A rule at the
		// top of a scope is outermost too: in `@scope (main)`, `.card` names its component.
		const outer = context.parents === undefined || context.scopeTop;
		const own = toCompounds(selector, rule, context.scopeTop).map((compound) => ({ ...compound, outer }));
		const inside = nestingInsideFunction(own);
		if (inside) {
			unknown(found, context, rule, "unparsable-selector", `& inside ${inside}()`);
			continue;
		}
		if (
			!context.parents &&
			own.some((compound) => compound.parts.some((part) => part.node.type === "nesting"))
		) {
			unknown(found, context, rule, "unparsable-selector", "& outside a rule");
			continue;
		}
		const written = context.scopeTop ? scopeRootOf(selector, rule) : undefined;
		for (const alternative of expandPartLists(own, context.partAttribute))
			for (const parent of context.parents ?? [undefined]) {
				const complex = resolve(alternative, parent?.selector);
				if (complex) resolved.push({ selector: complex, scopeRoot: written ?? parent?.scopeRoot });
			}
	}
	if (resolved.length === 0) return;
	found.rules.push({
		node: rule,
		selectors: resolved.map((parent) => parent.selector),
		layer: layerOf(context),
		scope: context.scope,
		sheet: context.sheet,
		order: found.rules.length + found.scopes.length,
	});
	walkContainer(rule, { ...context, parents: resolved, inRule: true, scopeTop: false }, found, rule);
}

function visitAtRule(atRule: AtRule, context: Context, found: Found): void {
	const name = atRule.name.toLowerCase();
	if (conditionalAtRules.has(name)) {
		const inner = { ...context, atRules: [...context.atRules, atRule] };
		walkContainer(atRule, inner, found, atRule);
	} else if (name === "layer" && atRule.nodes) {
		// Inside a rule, a layer's own declarations are that rule's element's, in that layer.
		const inner = { ...context, layers: [...context.layers, atRule.params.trim()] };
		walkContainer(atRule, inner, found, atRule);
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
		layer: layerOf(context),
		sheet: context.sheet,
		order: found.rules.length + found.scopes.length,
	});
	if ("reason" in root) {
		unknown(found, context, atRule, root.reason, root.detail);
		return;
	}
	const parent: Parent = { selector: [root], scopeRoot: undefined };
	const inner = { ...context, parents: [parent], inRule: false, scope: index, scopeTop: true };
	walkContainer(atRule, inner, found, atRule);
}

/** A doc comment (`/** … *\/`) outside any rule or scope, with the node it's written above. */
function visitComment(comment: Comment, context: Context, found: Found): void {
	if (context.parents || !isDocComment(comment)) return;
	let next = comment.next();
	while (next?.type === "comment") next = next.next();
	found.docComments.push({ node: comment, next, sheet: context.sheet });
}

function blockOf(
	node: Rule | AtRule,
	parent: Parent,
	context: Context,
	declarations: readonly Declaration[],
): WalkedBlock {
	return {
		node,
		declarations,
		selector: parent.selector,
		atRules: context.atRules,
		layer: layerOf(context),
		scope: context.scope,
		scopeRoot: parent.scopeRoot?.form,
		scopeRootAt: parent.scopeRoot?.at,
		sheet: context.sheet,
	};
}

function layerOf(context: Context): string | undefined {
	return context.layers.length > 0 ? context.layers.join(".") : undefined;
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
		layer: layerOf(context),
		scope: context.scope,
		sheet: context.sheet,
	});
}

function isDocComment(comment: Comment): boolean {
	// PostCSS drops the delimiters, so `/** Card */` arrives as `* Card`. SCSS's `//` comments are never doc comments.
	const inline = (comment.raws as { inline?: boolean }).inline === true;
	return !inline && comment.text.startsWith("*");
}

/** How a selector written directly in a scope names the scope's root, and where in the rule's selector. */
function scopeRootOf(selector: parser.Selector, rule: Rule): WrittenScopeRoot | undefined {
	const scope = selector.nodes.find(
		(node) => node.type === "pseudo" && node.value.toLowerCase() === ":scope",
	);
	const nesting = selector.nodes.find((node) => node.type === "nesting");
	const written = scope ?? nesting;
	if (!written) return undefined;
	const index = written.sourceIndex ?? 0;
	return {
		form: scope ? ":scope" : "&",
		at: { node: rule, index, endIndex: index + String(written).trim().length },
	};
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
		const end = closingParenthesis(rest, 0);
		if (end === -1) return { root: undefined, rootIndex, limit: undefined };
		const inside = rest.slice(1, end);
		root = inside.trim() || undefined;
		rootIndex = start + 1 + (inside.length - inside.trimStart().length);
		rest = rest.slice(end + 1).trim();
	}
	const to = /^to\s*(?=\()/i.exec(rest);
	if (!to) return { root, rootIndex, limit: undefined };
	const group = rest.slice(to[0].length);
	const end = closingParenthesis(group, 0);
	return { root, rootIndex, limit: end === -1 ? undefined : group.slice(1, end).trim() || undefined };
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
	return { ...compound, combinator: undefined, scopeRoot: true };
}
