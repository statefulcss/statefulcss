// The model of one stylesheet, as Stateful CSS sees it. It describes; the rules judge.
//
// Facts point at each other by id, never by object. An id is the index into one of the model's arrays:
// `model.blocks[declaration.block]`. There are no cycles, so the model is JSON once its PostCSS nodes are dropped:
// every one sits in a field called `node`, plus the model's own `root`.
import type { Settings } from "@statefulcss/config";
import type { AtRule, Comment, Declaration as PostCSSDeclaration, Document, Node, Root, Rule } from "postcss";

/** An index into one of the model's arrays. */
export type Id = number;

/** One stylesheet. */
export interface Model {
	readonly root: Root | Document;
	readonly settings: Settings;
	readonly file: FileInfo;
	/** A Vue file's plain `<style>` blocks are one sheet, its scoped blocks another, and each module block its own. */
	readonly sheets: readonly Sheet[];
	readonly components: readonly Component[];
	readonly scopes: readonly Scope[];
	readonly elements: readonly Element[];
	/** In document order. */
	readonly blocks: readonly Block[];
	readonly guards: readonly Guard[];
	readonly declarations: readonly Declaration[];
	readonly variables: readonly Variable[];
	readonly reads: readonly Read[];
	readonly partReferences: readonly PartReference[];
	/** `@property` rules. */
	readonly registrations: readonly Registration[];
	readonly docComments: readonly DocComment[];
	/** At-rules that aren't about elements: `@import`, `@keyframes`, `@font-face`, `@layer` statements. */
	readonly atRules: readonly OtherAtRule[];
	/** Syntax core doesn't understand. Recorded, never thrown on, and never guessed at. */
	readonly unknowns: readonly Unknown[];
}

export interface FileInfo {
	/** The file the root was parsed from, if any. */
	readonly path: string | undefined;
	/** Whether any of its sheets is a CSS Module (`*.module.css`, or a Vue `<style module>`). */
	readonly cssModule: boolean;
}

export interface Sheet {
	readonly kind: "plain" | "scoped" | "module";
}

/** Where something was written: a rule or at-rule, and the offsets inside its selector or parameters. */
export interface Position {
	readonly node: Rule | AtRule;
	readonly index: number;
	readonly endIndex: number;
}

// Components and scopes

/** How a file names a component: by its class, or by `[data-component="name"]`. */
export type Identity =
	| { readonly kind: "class"; readonly className: string; readonly at: Position }
	| { readonly kind: "attribute"; readonly value: string; readonly at: Position };

export interface Component {
	readonly id: Id;
	readonly sheet: number;
	readonly identity: Identity;
	/** What its component variables start with: the `@component` tag, else the attribute's value, else the class in kebab-case. */
	readonly name: string;
	readonly nameFrom: "tag" | "attribute" | "class";
	readonly docComment: Id | undefined;
	/** Its root element. It exists even when the file has no root block. */
	readonly root: Id;
	/** False when the file only styles the parts of a component whose root block is in another file. */
	readonly hasRootBlock: boolean;
	readonly scopes: readonly Id[];
	/** The root first, then its parts, slots, pseudo-elements and content. */
	readonly elements: readonly Id[];
}

/** An `@scope`. */
export interface Scope {
	readonly id: Id;
	readonly node: AtRule;
	/** Undefined when the root isn't a class or a component attribute. */
	readonly component: Id | undefined;
	/** As written: `.card`, `[data-component="tabs"]`, `&`. */
	readonly root: string | undefined;
	/**
	 * How its root names the component. An attribute is how a file styles the parts of a component whose root block
	 * is in another file.
	 */
	readonly rootKind: "class" | "attribute" | undefined;
	/** As written: `[data-component]`. */
	readonly limit: string | undefined;
	/** The limit is exactly the component attribute. */
	readonly limitIsComponents: boolean;
	/** Written inside a rule. */
	readonly nested: boolean;
	/** Undefined when the file has no root block for its component. */
	readonly afterRootBlock: boolean | undefined;
}

// Elements

interface ElementBase {
	readonly id: Id;
	readonly sheet: number;
	/** For people: `.card`, `.card [data-part="title"]::after`. */
	readonly key: string;
	readonly blocks: readonly Id[];
	/** The variables its blocks write. */
	readonly variables: readonly Id[];
}

/**
 * Anything with its own declarations. An element belongs to at most one component: the one whose root block or scope
 * selects it.
 */
export type Element = ElementBase &
	(
		| { readonly kind: "root"; readonly component: Id }
		| { readonly kind: "part"; readonly component: Id; readonly name: string }
		| { readonly kind: "slot"; readonly component: Id; readonly name: string }
		/** `after` for `::after` and `:after`. Its host is a root, a part, content or a global element. */
		| {
				readonly kind: "pseudo-element";
				readonly component: Id | undefined;
				readonly name: string;
				readonly host: Id;
		  }
		/** Plain elements and other classes a component selects. `under` is the nearest part its selector names. */
		| {
				readonly kind: "content";
				readonly component: Id;
				readonly selector: string;
				readonly under: Id | undefined;
		  }
		/** No class and no component attribute, outside any scope: `a`, `:root`, `[data-theme="espresso"]`. */
		| {
				readonly kind: "global";
				readonly selector: string;
				readonly themeScope: ThemeScope | undefined;
				readonly colorScheme: boolean;
		  }
		/** A class block in the utilities layer. The component rules skip it. */
		| { readonly kind: "utility"; readonly selector: string }
		/** What `:deep()`, `:slotted()`, `::v-deep` or `:global()` selects. The rules skip it. */
		| { readonly kind: "foreign"; readonly selector: string }
	);

export type ElementKind = Element["kind"];

export interface ThemeScope {
	/** The theme's name; undefined for the unnamed `[data-theme]` scope. */
	readonly theme: string | undefined;
}

// Blocks, conditions and guards

interface BlockBase {
	readonly id: Id;
	/** The rule, or the at-rule when declarations sit directly in a nested `@media`, `@container` or `@supports`. */
	readonly node: Rule | AtRule;
	/** The resolved selector: `.card > [data-part="footer"] > [data-slot="action"]`. */
	readonly selector: string;
	readonly element: Id;
	/**
	 * How the selector reaches its element: it is the root compound itself; inside an `@scope`; or from the root
	 * compound, with a combinator, outside any scope.
	 */
	readonly reach: "direct" | "scope" | "descendant";
	readonly scope: Id | undefined;
	/** How a block inside a scope writes the scope's root, when it does. */
	readonly scopeRoot: ScopeRootForm | undefined;
	/** From the component root to the subject. Sibling context is a position variant, not a step. */
	readonly path: readonly Step[];
	/** From the selector. */
	readonly conditions: readonly Condition[];
	/** The at-rules around it, outermost first. */
	readonly queries: readonly Query[];
	/** The guard it sits inside. */
	readonly guard: Id | undefined;
	/** The `@layer` around it, dotted when nested (`components.forms`); undefined when unlayered. */
	readonly layer: string | undefined;
	readonly declarations: readonly Id[];
}

/** Where declarations sit: one resolved selector of one rule, inside its at-rules. */
export type Block = BlockBase &
	(
		| { readonly kind: "own" } // no condition and no query; `& { }` included
		| { readonly kind: "variant" } // only variants
		| { readonly kind: "state"; readonly groups: readonly StateGroup[] } // any state makes it a state
		| { readonly kind: "supports" } // only `@supports`
		| { readonly kind: "unknown" } // an extra class, or a condition core can't classify
	);

export type BlockKind = Block["kind"];

export type ScopeRootForm = ":scope" | "&";

export type StateGroup = "context" | "interaction" | "semantic" | "blocking" | "visited";

export interface Step {
	/** Undefined for the first step. */
	readonly combinator: " " | ">" | undefined;
	readonly names: "root" | "part" | "slot" | "other";
	/** The part's or slot's name. */
	readonly name: string | undefined;
	/** What names the element at this step: `.card`, `[data-part="title"]`, `p`, `*`. */
	readonly text: string;
	readonly at: Position;
}

export interface Condition {
	/** Normalized: `[data-size="small"]`, `:hover`, `:not(:disabled, [inert])`. */
	readonly text: string;
	readonly kind: "variant" | "state" | "guard" | "unknown";
	/** For a state. For `:is()`, `:not()` and `:has()`, the group of the first state inside. */
	readonly group: StateGroup | undefined;
	/** `:focus`, `:focus-visible`, `:focus-within`. */
	readonly focus: boolean;
	/**
	 * The compound it's written on: the subject; a pseudo-element's host; the component root, when the subject is
	 * something else; a step between them; or what comes before the root (`[dir="rtl"] &`).
	 */
	readonly on: "subject" | "host" | "root" | "path" | "context";
	readonly attribute: AttributeSelector | undefined;
	/** Inside `:where()`, so it adds no specificity. */
	readonly inWhere: boolean;
	/** What `:not()` and `:is()` hold. `:where()` is transparent. */
	readonly inner: readonly Condition[];
	/** For a `:has()` that holds one selector. With a list, what the selectors ask is in `inner`. */
	readonly has: Has | undefined;
	/** Set on the `:not()` that is a guard. */
	readonly guard: Id | undefined;
	readonly at: Position;
}

export interface AttributeSelector {
	readonly name: string;
	readonly operator: string | undefined;
	readonly value: string | undefined;
}

/** `:has(> :where([data-part="control"]) > :where([data-part="input"]):disabled)` */
export interface Has {
	readonly path: readonly HasStep[];
	/** What it asks of the elements on the path: `:disabled` on the input. */
	readonly conditions: readonly Condition[];
}

export interface HasStep {
	/** A space when none is written: `:has()` looks at descendants. */
	readonly combinator: " " | ">" | "+" | "~";
	/** The part this step names, if it names one. */
	readonly part: string | undefined;
	/** The part is named inside `:where()`, so it adds no specificity. */
	readonly inWhere: boolean;
	readonly at: Position;
}

/** `@media`, `@container`, `@supports` or `@starting-style` around a block. */
export interface Query {
	readonly node: AtRule;
	readonly name: "media" | "container" | "supports" | "starting-style";
	readonly params: string;
	/** `@container style(--q-tabs-blocked: false)`. Each one is also a read. */
	readonly styleQueries: readonly StyleQuery[];
}

export interface StyleQuery {
	readonly name: string;
	readonly value: string | undefined;
	readonly negated: boolean;
}

/** One `:not()` that lists at least one blocking state. An element can have several. */
export interface Guard {
	readonly id: Id;
	readonly element: Id;
	/** Its `inner` conditions are the list; a `:has()` state that joined it is one of them. */
	readonly condition: Condition;
	/** The settings' blocking states it lists. */
	readonly blocking: readonly string[];
	/** The blocks inside it. */
	readonly blocks: readonly Id[];
}

/** One place where a selector names a part. */
export interface PartReference {
	/** Undefined when the selector names no one part: `[data-part]`. */
	readonly name: string | undefined;
	readonly component: Id | undefined;
	readonly block: Id;
	/**
	 * Inside the component's scope; a step on the way to a slot, from the root block; inside `:has()` on the root
	 * compound, the guard's `:not()` included; or anywhere else, a root's own compound included
	 * (`.tab[data-part="tab"]`): an element is a component or a part, never both.
	 */
	readonly place: "scope" | "placement-path" | "has" | "outside";
	readonly at: Position;
}

// Declarations, variables and reads

/**
 * Who may write a custom property. `library` is an unprefixed name the component's doc comment lists in `@sets` or
 * `@reads`; `none` is any other unprefixed name.
 */
export type Role = "token" | "component" | "state" | "part" | "private" | "query" | "library" | "none";

export interface Declaration {
	readonly id: Id;
	readonly node: PostCSSDeclaration;
	readonly block: Id;
	/** Lowercased; a custom property keeps its case. */
	readonly property: string;
	/** For a custom property. */
	readonly role: Role | undefined;
	readonly value: string;
	/** A custom property set to `inherit`. */
	readonly inherits: boolean;
	/** The value holds syntax core can't read (SCSS interpolation, `v-bind()`), so `reads` is empty. */
	readonly valueUnread: boolean;
	readonly reads: readonly Id[];
}

/** One custom property on one element: `--s-color` on a Tabs root and on its tab are two variables. */
export interface Variable {
	readonly id: Id;
	readonly name: string;
	readonly role: Role;
	/** The element whose blocks write it. */
	readonly element: Id;
	/** Every declaration of it on that element, in order. */
	readonly writes: readonly Id[];
	/** Its first write in an `own` or `supports` block. */
	readonly default: Id | undefined;
	/** Its writes in variant and state blocks. */
	readonly changes: readonly Id[];
	/** A variant or a state writes it, or its value reads a variable that is changing. */
	readonly changing: boolean;
	/**
	 * For `--p-*` and `--_*`: the elements whose name starts the variable's name; the longest name wins. A component
	 * root names its parts, its slots and its own pseudo-elements (`--p-tab-*`, `--p-after-*`), and its parts'
	 * pseudo-elements as `{part}-{pseudo}` (`--p-tab-after-opacity`, read by `[data-part="tab"]::after`): the root
	 * declares a part's pseudo-element variable when its own states change it. A part names its own pseudo-elements
	 * (`--p-after-*` in the tab's block).
	 */
	readonly namedFor: readonly Id[];
	/** The reads that reach it. */
	readonly reads: readonly Id[];
}

export interface Read {
	readonly id: Id;
	readonly name: string;
	readonly role: Role;
	readonly element: Id;
	readonly block: Id;
	readonly via: "var" | "style-query";
	/** Undefined for a style query. */
	readonly declaration: Id | undefined;
	readonly hasFallback: boolean;
	/** It sits inside another `var()`'s fallback. */
	readonly inFallback: boolean;
	/** The whole value; one word of it (a shorthand's slot); or inside a function such as `calc()`. */
	readonly position: "whole" | "word" | "function";
	/**
	 * The variable it reaches inside its component: the element's own, else its host's or the part it's under, else
	 * the component root's. Undefined for tokens, component variables and anything the component doesn't declare.
	 */
	readonly source: Id | undefined;
}

/** An `@property` rule. */
export interface Registration {
	readonly node: AtRule;
	readonly name: string;
	readonly role: Role;
	readonly syntax: string | undefined;
	readonly inherits: string | undefined;
	readonly initialValue: string | undefined;
}

/** A doc comment above a component: its name, then its tags. */
export interface DocComment {
	readonly id: Id;
	readonly node: Comment;
	/** The component of the block right after it. */
	readonly component: Id | undefined;
	/** Its first line. */
	readonly title: string | undefined;
	/** Every tag, unknown ones included. */
	readonly tags: readonly DocTag[];
	/** `@component`. */
	readonly componentName: string | undefined;
	readonly sets: readonly string[];
	readonly reads: readonly string[];
	readonly queries: readonly string[];
}

export interface DocTag {
	readonly name: string;
	readonly value: string;
}

export interface OtherAtRule {
	/** Lowercased, without the `@`. */
	readonly name: string;
	readonly node: AtRule;
}

export type UnknownReason =
	| "interpolation"
	| "template-placeholder"
	| "unknown-at-rule"
	| "unparsable-selector"
	| "nested-property"
	/** An `@scope` core doesn't read: no root, a list of roots, or a path as its root. */
	| "scope-root"
	| "internal";

export interface Unknown {
	readonly node: Node;
	readonly reason: UnknownReason;
	/** What wasn't understood: `#{$size}`, `@include`, the parser's message. */
	readonly detail: string | undefined;
	/** The elements whose rule it sits in: an `@include` inside `.button` may declare anything. */
	readonly elements: readonly Id[];
}
