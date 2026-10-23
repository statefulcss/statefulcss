// The model of one stylesheet, as Stateful CSS sees it. Stubs: the shapes fill in as the analysis is built.
import type { AtRule, Declaration as CSSDeclaration, Root, Rule } from "postcss";

/** One stylesheet: its components and every variable it declares or reads. */
export interface Model {
	root: Root;
	components: Component[];
	variables: Variable[];
}

/** A top-level component block, with its `@component` name and its elements. */
export interface Component {
	name: string;
	node: Rule;
	elements: Element[];
}

/** The component's root, a child element or a pseudo-element. */
export interface Element {
	selector: string;
	blocks: Block[];
}

/** Where a declaration sits: the element's own block, a variant, a state, or `@supports`. */
export type BlockKind = "element" | "variant" | "state" | "supports";

/** The group a state belongs to. */
export type StateGroup = "context" | "interaction" | "semantic" | "blocking";

export interface Block {
	kind: BlockKind;
	/** Set for states only. */
	stateGroup?: StateGroup;
	node: Rule | AtRule;
	declarations: Declaration[];
}

export interface Declaration {
	node: CSSDeclaration;
	/** The variables its value reads. */
	reads: Variable[];
}

/** Who may write a variable, from its prefix. */
export type VariableRole = "token" | "component" | "state" | "private" | "library";

export interface Variable {
	name: string;
	role: VariableRole;
	writers: Declaration[];
	readers: Declaration[];
}
