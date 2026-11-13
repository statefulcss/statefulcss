// The model of one stylesheet, as Stateful CSS sees it. It describes; the rules judge.
import type { Settings } from "@statefulcss/config";
import type { AtRule, Document, Node, Root, Rule } from "postcss";

/** One stylesheet: its elements and blocks, and what core couldn't read. */
export interface Model {
	root: Root | Document;
	settings: Settings;
	file: FileInfo;
	/** Every element, in the order the stylesheet first names it. */
	elements: Element[];
	/** Every block, in document order (`block.index`). */
	blocks: Block[];
	/** At-rules that aren't about elements: `@keyframes`, `@font-face`, `@import`, `@property`, `@layer` statements. */
	atRules: OtherAtRule[];
	/** Syntax core doesn't understand. Recorded, never thrown on, and its contents aren't attributed to any element. */
	unknowns: Unknown[];
}

export interface FileInfo {
	/** The file the root was parsed from, if any. */
	path: string | undefined;
	/** Whether any of its stylesheets is a CSS Module (`*.module.css`, or a Vue `<style module>`). */
	cssModule: boolean;
}

/**
 * How an element is known:
 * - `component`: by its own class (`.button`, `.icon`). Everything with a class is a component; one that belongs to
 *   another is a child element, which its `parents` show.
 * - `descendant`: a tag or other selector with no class of its own, under a component (`.prose a`).
 * - `pseudo-element`: a pseudo-element on another element (`.tab::after`).
 * - `global`: a selector with no class at all (`a`, `:root`, `[data-theme="espresso"]`).
 */
export type ElementKind = "component" | "descendant" | "pseudo-element" | "global";

/** Anything with its own declarations. One element however its selectors reach it: `.icon`, `.button .icon` and `.button[data-intent] .icon` are one. */
export interface Element {
	/** `.button`, `.icon`, `.prose a`, `.tab::after`, `a`, `[data-theme="espresso"]`. */
	key: string;
	kind: ElementKind;
	/** A component's class, as written. */
	className: string | undefined;
	/** The name a component's variables start with: its class in kebab-case. */
	name: string | undefined;
	/** A pseudo-element's element. */
	host: Element | undefined;
	pseudoElement: string | undefined;
	/** Its parent components: the components its blocks' selectors name before it (`.button` in `.button .icon`). */
	parents: Element[];
	/** Its child elements: the elements whose blocks name it as a parent component. */
	children: Element[];
	/** Set when a global element carries the theme attribute itself: `[data-theme="espresso"]`, `html[data-theme]`. */
	themeScope: ThemeScope | undefined;
	/** Whether a global element carries `data-color-scheme` itself. */
	colorScheme: boolean;
	blocks: Block[];
}

export interface ThemeScope {
	/** The theme's name; undefined for the unnamed `[data-theme]` scope. */
	theme: string | undefined;
}

/** Where declarations sit: one resolved selector of one rule, inside its at-rules. */
export interface Block {
	/** Its place in the document, for "comes after". */
	index: number;
	/** The rule, or the at-rule when declarations sit directly in a nested `@media`, `@container` or `@supports`. */
	node: Rule | AtRule;
	/** The resolved selector: `.button[data-emphasis="primary"] .icon`. */
	selector: string;
	element: Element;
	/** The parent components its selector names before its element, outermost first (`.button` in `.button .icon`). */
	parents: Element[];
	/** `@media`, `@container`, `@supports` and `@starting-style` around it, outermost first. */
	atRules: AtRule[];
	/** The `@layer` around it, dotted when nested (`components.forms`); undefined when unlayered. */
	layer: string | undefined;
}

export interface OtherAtRule {
	/** Lowercased, without the `@`. */
	name: string;
	node: AtRule;
}

export type UnknownReason =
	| "interpolation"
	| "template-placeholder"
	| "unknown-at-rule"
	| "unparsable-selector"
	| "nested-property"
	| "internal";

export interface Unknown {
	node: Node;
	reason: UnknownReason;
	/** What wasn't understood: `#{$size}`, `@include`, the parser's message. */
	detail: string | undefined;
}
