import type { Settings } from "@statefulcss/config";
import type { AtRule, ChildNode, Container, Document, Node, Root, Rule } from "postcss";

import type { Block, Element, ElementKind, Model, UnknownReason } from "../model.js";
import { kebabCase, type SheetKind, sheetKind } from "./files.js";
import {
	classOf,
	type Complex,
	type Compound,
	complexToString,
	isSibling,
	parseSelectorList,
	partText,
	resolve,
	splitCompound,
	toCompounds,
} from "./selectors.js";

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
	"property",
	"view-transition",
]);

const colorSchemeAttribute = "data-color-scheme";

interface Context {
	/** The parent rule's resolved selectors; undefined at the top level. */
	parents: Complex[] | undefined;
	atRules: AtRule[];
	layers: string[];
	/** Inside `@scope`, directly: `:scope` stands for the scope's root. */
	scopeTop: boolean;
	sheet: Sheet;
}

/**
 * One stylesheet. In a Vue file, all plain `<style>` blocks are one stylesheet and all scoped blocks another; each
 * `<style module>` is one on its own. Only blocks of the same kind are read together.
 */
interface Sheet {
	/** The sheet's elements, by key. */
	elements: Map<string, Element>;
}

class ModelBuilder {
	readonly model: Model;

	constructor(root: Root | Document, settings: Settings) {
		this.model = {
			root,
			settings,
			file: { path: root.source?.input.file, cssModule: false },
			elements: [],
			blocks: [],
			atRules: [],
			unknowns: [],
		};
	}

	newSheet(kind: SheetKind): Sheet {
		if (kind === "module") this.model.file.cssModule = true;
		return { elements: new Map() };
	}

	read(root: Root, sheet: Sheet): void {
		this.walk(root, { parents: undefined, atRules: [], layers: [], scopeTop: false, sheet });
	}

	private walk(container: Container, context: Context): void {
		for (const node of container.nodes ?? []) {
			try {
				this.visit(node, context);
			} catch (error) {
				this.unknown(node, "internal", error instanceof Error ? error.message : String(error));
			}
		}
	}

	private visit(node: ChildNode, context: Context): void {
		if (node.type === "rule") this.rule(node, context);
		else if (node.type === "atrule") this.atRule(node, context);
	}

	private rule(rule: Rule, context: Context): void {
		const parsed = parseSelectorList(rule.selector);
		if ("reason" in parsed) {
			this.unknown(rule, parsed.reason, parsed.detail);
			return;
		}
		const resolved: Complex[] = [];
		for (const selector of parsed.selectors) {
			const own = toCompounds(selector, rule, context.scopeTop);
			for (const parent of context.parents ?? [undefined]) {
				const complex = resolve(own, parent);
				if (!complex) {
					this.unknown(rule, "unparsable-selector", "& outside a rule");
					return;
				}
				resolved.push(complex);
			}
		}
		if (hasDeclarations(rule)) {
			for (const complex of resolved) this.block(rule, complex, context);
		}
		this.walk(rule, { ...context, parents: resolved, scopeTop: false });
	}

	private atRule(atRule: AtRule, context: Context): void {
		const name = atRule.name.toLowerCase();
		if (conditionalAtRules.has(name)) {
			const inner = { ...context, atRules: [...context.atRules, atRule] };
			if (context.parents && hasDeclarations(atRule)) {
				for (const complex of context.parents) this.block(atRule, complex, inner);
			}
			this.walk(atRule, inner);
			return;
		}
		if (name === "layer" && atRule.nodes) {
			this.walk(atRule, { ...context, layers: [...context.layers, atRule.params.trim()] });
			return;
		}
		if (name === "scope") {
			this.scope(atRule, context);
			return;
		}
		if (otherAtRules.has(name)) {
			this.model.atRules.push({ name, node: atRule });
			return;
		}
		this.unknown(atRule, "unknown-at-rule", `@${atRule.name}`);
	}

	/** `@scope (.card) to (…)`: rules inside it are under the scope's root, and `:scope` is the root itself. */
	private scope(atRule: AtRule, context: Context): void {
		if (context.parents) {
			this.unknown(atRule, "unknown-at-rule", "@scope inside a rule");
			return;
		}
		const prelude = scopeRoot(atRule.params);
		if (prelude === undefined) {
			this.unknown(atRule, "unparsable-selector", "@scope without a root selector");
			return;
		}
		const parsed = parseSelectorList(prelude);
		if ("reason" in parsed) {
			this.unknown(atRule, parsed.reason, parsed.detail);
			return;
		}
		const roots = parsed.selectors.map((selector) => toCompounds(selector, atRule));
		this.walk(atRule, { ...context, parents: roots, scopeTop: true });
	}

	private block(node: Rule | AtRule, complex: Complex, context: Context): void {
		const { element, parents } = this.elementOf(complex, context.sheet);
		const block: Block = {
			index: this.model.blocks.length,
			node,
			selector: complexToString(complex),
			element,
			parents,
			atRules: context.atRules,
			layer: context.layers.length > 0 ? context.layers.join(".") : undefined,
		};
		element.blocks.push(block);
		for (const parent of parents) {
			if (!element.parents.includes(parent)) element.parents.push(parent);
			if (!parent.children.includes(element)) parent.children.push(element);
		}
		this.model.blocks.push(block);
	}

	/**
	 * The element a resolved selector styles, and the parent components it names before it. A component is known by
	 * its own class wherever it's selected; a descendant with no class by the nearest component above it and the path
	 * from there; a selector with no class at all is a global element.
	 */
	private elementOf(complex: Complex, sheet: Sheet): { element: Element; parents: Element[] } {
		const chain = withoutSiblingContext(complex);
		const subjectIndex = chain.length - 1;
		const subject = chain[subjectIndex];
		if (!subject) return { element: this.element(sheet, { key: "*", kind: "global" }), parents: [] };

		const classIndexes = chain.flatMap((compound, index) => (classOf(compound) === undefined ? [] : [index]));
		const parents = classIndexes
			.filter((index) => index < subjectIndex)
			.map((index) => this.component(sheet, classOf(chain[index] as Compound) as string));

		let host: Element;
		const ownClass = classOf(subject);
		const nearest = classIndexes.at(-1);
		if (ownClass !== undefined) {
			host = this.component(sheet, ownClass);
		} else if (nearest !== undefined) {
			const path = chain.slice(nearest + 1).map((compound) => identityText(splitCompound(compound).identity));
			const key = [`.${classOf(chain[nearest] as Compound) ?? ""}`, ...path].join(" ");
			host = this.element(sheet, { key, kind: "descendant" });
		} else {
			host = this.globalElement(chain, sheet);
		}

		const pseudoElement = splitCompound(subject).pseudoElement;
		if (!pseudoElement) return { element: host, parents };
		const pseudo = String(pseudoElement.node).trim().toLowerCase();
		const element = this.element(sheet, {
			key: `${host.key}${pseudo}`,
			kind: "pseudo-element",
			host,
			pseudoElement: pseudo,
		});
		return { element, parents };
	}

	private component(sheet: Sheet, className: string): Element {
		return this.element(sheet, {
			key: `.${className}`,
			kind: "component",
			className,
			name: kebabCase(className),
		});
	}

	private globalElement(chain: Complex, sheet: Sheet): Element {
		const keep = new Set([this.model.settings.themeAttribute.toLowerCase(), colorSchemeAttribute]);
		const compounds = chain.map((compound) => splitCompound(compound, keep));
		const key = compounds.map((parts) => identityText(parts.identity)).join(" ");
		const identity = compounds.at(-1)?.identity ?? [];
		return this.element(sheet, {
			key,
			kind: "global",
			themeScope: this.themeScope(identity),
			colorScheme: identity.some((part) => attributeName(part) === colorSchemeAttribute),
		});
	}

	private themeScope(identity: Compound["parts"]): Element["themeScope"] {
		const attribute = this.model.settings.themeAttribute.toLowerCase();
		const part = identity.find((candidate) => attributeName(candidate) === attribute);
		if (!part || part.node.type !== "attribute") return undefined;
		return { theme: part.node.value };
	}

	private element(sheet: Sheet, fields: Partial<Element> & { key: string; kind: ElementKind }): Element {
		const existing = sheet.elements.get(fields.key);
		if (existing) return existing;
		const element: Element = {
			className: undefined,
			name: undefined,
			host: undefined,
			pseudoElement: undefined,
			themeScope: undefined,
			colorScheme: false,
			...fields,
			parents: [],
			children: [],
			blocks: [],
		};
		sheet.elements.set(fields.key, element);
		this.model.elements.push(element);
		return element;
	}

	private unknown(node: Node, reason: UnknownReason, detail: string | undefined): void {
		this.model.unknowns.push({ node, reason, detail });
	}
}

/**
 * Reads one file into the model. In a Vue file, plain `<style>` blocks are read together as one stylesheet (`.button`
 * in one and `.button:hover` in another are one element), scoped blocks as another, and each `<style module>` on its
 * own. Never throws on syntax it doesn't understand.
 */
export function buildModel(root: Root | Document, settings: Settings): Model {
	const builder = new ModelBuilder(root, settings);
	const path = root.source?.input.file;
	const roots =
		root.type === "document" ? root.nodes.filter((node): node is Root => node.type === "root") : [root];
	const shared = new Map<SheetKind, Sheet>();
	for (const sheet of roots) {
		const kind = sheetKind(sheet, path);
		let target = kind === "module" ? undefined : shared.get(kind);
		if (!target) {
			target = builder.newSheet(kind);
			if (kind !== "module") shared.set(kind, target);
		}
		builder.read(sheet, target);
	}
	return builder.model;
}

/** A compound followed by `+` or `~` only says what comes before the element: it's a position variant, not an element. */
function withoutSiblingContext(chain: Complex): Complex {
	return chain.filter((_, index) => !isSibling(chain[index + 1]?.combinator));
}

function identityText(identity: Compound["parts"]): string {
	return identity.map(partText).join("") || "*";
}

function attributeName(part: Compound["parts"][number]): string | undefined {
	return part.node.type === "attribute" ? part.node.attribute.toLowerCase() : undefined;
}

function hasDeclarations(container: Container): boolean {
	// SCSS variables (`$gap: …`) aren't CSS declarations.
	return (container.nodes ?? []).some((node) => node.type === "decl" && !node.prop.startsWith("$"));
}

/** The root selector of `@scope (root) to (limit)`, or undefined when there's none. */
function scopeRoot(params: string): string | undefined {
	const text = params.trimStart();
	if (!text.startsWith("(")) return undefined;
	let depth = 0;
	for (const [index, character] of [...text].entries()) {
		if (character === "(") depth++;
		else if (character === ")" && --depth === 0) return text.slice(1, index).trim() || undefined;
	}
	return undefined;
}
