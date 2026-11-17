// Pass 2. Reads one resolved selector and the at-rules around it: the path from the component root to the subject,
// each condition with its kind, the guard, the queries, and the kind of the block. It needs no other block, so
// which element the block styles is left to the next pass.
import { nonStatePseudoClasses, type Settings } from "@statefulcss/config";
import type { AtRule, Rule } from "postcss";
import parser from "postcss-selector-parser";

import type {
	AttributeSelector,
	BlockKind,
	Condition,
	Has,
	HasStep,
	Identity,
	Position,
	Query,
	StateGroup,
	Step,
	StyleQuery,
	ThemeScope,
} from "../model.js";
import type { Names } from "./names.js";
import {
	closingParenthesis,
	type Complex,
	type Compound,
	isPseudoElement,
	isSibling,
	isWrapper,
	listsElements,
	type Part,
} from "./selectors.js";
import type { WalkedBlock } from "./walk.js";

/** What one resolved selector says, before it's given an element. */
export interface Classified {
	/** What names the component the selector starts from; undefined when nothing does. */
	readonly root: Identity | undefined;
	/**
	 * In an `@scope` whose root names the component. In a scope whose root names none (`@scope (main)`), a class
	 * starts the component the way it does outside any scope, with the scope's root as context.
	 */
	readonly scoped: boolean;
	/** From the root compound to the subject, or every compound when there's no root. */
	readonly path: readonly Step[];
	/** What comes before the root compound: `[dir="rtl"]` in `[dir="rtl"] .button`. */
	readonly context: readonly Step[];
	/** The subject's pseudo-element, without its colons: `after`. */
	readonly pseudoElement: string | undefined;
	/** `:deep()`, `:slotted()` or `:global()` is somewhere in it. */
	readonly foreign: boolean;
	/** For a selector with no root whose own element carries the theme attribute. */
	readonly themeScope: ThemeScope | undefined;
	/** For a selector with no root whose own element carries the color-scheme attribute. */
	readonly colorScheme: boolean;
	readonly conditions: readonly Condition[];
	readonly queries: readonly Query[];
	/** Every place the selector names a part. */
	readonly partMentions: readonly PartMention[];
	readonly kind: BlockKind;
	/** For a state: its groups, in the order states win. */
	readonly groups: readonly StateGroup[];
}

/** One place where a selector names a part. */
export interface PartMention {
	/** Undefined when it names no one part: `[data-part]`. */
	readonly name: string | undefined;
	/**
	 * Where it's written: on the subject; on a step before it; on the root compound itself, which makes one element
	 * both a component and a part; before the root; on a sibling before a compound; inside `:has()`; or inside
	 * another selector function, such as `:not()` or `:nth-child(… of …)`.
	 */
	readonly where: "subject" | "step" | "root" | "context" | "position" | "has" | "condition";
	/** For `position`, `has` and `condition`: the compound it's written on. */
	readonly on: Condition["on"] | undefined;
	readonly at: Position;
	readonly nameAt: Position | undefined;
}

/** The settings' lists, ready to compare a condition with. */
export interface Vocabulary {
	readonly names: Names;
	readonly blocking: ReadonlySet<string>;
	readonly interaction: ReadonlySet<string>;
	readonly stateAttributes: ReadonlySet<string>;
	/** Each entry of `blockingStates` as the settings write it, by the form a condition is compared in. */
	readonly blockingEntries: ReadonlyMap<string, readonly string[]>;
}

export function vocabularyFrom(settings: Settings, names: Names): Vocabulary {
	const blockingEntries = new Map<string, string[]>();
	for (const entry of settings.blockingStates) {
		const compared = normalize(entry);
		blockingEntries.set(compared, [...(blockingEntries.get(compared) ?? []), entry]);
	}
	return {
		names,
		blocking: new Set(blockingEntries.keys()),
		interaction: new Set(settings.interactionStates.map(normalize)),
		stateAttributes: new Set(settings.stateAttributes.map((name) => name.toLowerCase())),
		blockingEntries,
	};
}

/**
 * The entries of `blockingStates` a blocking state's condition matches, as the settings write them:
 * `.button:not(:nth-child(2n + 1))` matches the entry `:nth-child(2n+1)`.
 */
export function blockingEntriesOf(vocabulary: Vocabulary, condition: Condition): readonly string[] {
	return vocabulary.blockingEntries.get(normalize(condition.text)) ?? [];
}

/** ARIA attributes that say what's happening to an element. Every other ARIA attribute says what it is. */
const ariaStates = new Set([
	"aria-busy",
	"aria-checked",
	"aria-current",
	"aria-disabled",
	"aria-expanded",
	"aria-grabbed",
	"aria-hidden",
	"aria-invalid",
	"aria-pressed",
	"aria-selected",
]);

/** Pseudo-classes that say where an element is, or what it is: variants. */
const variantPseudoClasses = new Set([
	":first-child",
	":last-child",
	":only-child",
	":first-of-type",
	":last-of-type",
	":only-of-type",
	":nth-child",
	":nth-last-child",
	":nth-of-type",
	":nth-last-of-type",
	":empty",
	":dir",
	":lang",
]);

// These two lists are config's, with the wrappers and one-colon pseudo-elements in selectors.ts: config refuses
// them in a state list, because none is ever compared with one.

/** Pseudo-classes that name the element itself, so they're no condition. */
const identityPseudoClasses = new Set<string>(nonStatePseudoClasses.identity);

/** Pseudo-classes that match any one of the selectors they list. `:not()` and `:has()` have their own reading. */
const matchesAny = new Set<string>(nonStatePseudoClasses.matchesAny);

/** Pseudo-classes that take `An+B`, and some of them `of` and a selector list. */
const nthPseudoClasses = new Set([
	":nth-child",
	":nth-last-child",
	":nth-of-type",
	":nth-last-of-type",
	":nth-col",
	":nth-last-col",
]);

/** The order states win in, which is the order a block lists its groups in. */
const groupOrder: readonly StateGroup[] = ["context", "interaction", "semantic", "blocking", "visited"];

type On = Condition["on"];

/** What a condition is read with: the rule it's written in, the compound it's on, and the settings' lists. */
interface Reading {
	readonly source: Rule | AtRule;
	readonly on: On;
	/** The compound's place in the block's path; undefined for what comes before the root. */
	readonly step: number | undefined;
	readonly vocabulary: Vocabulary;
}

/** Reads one block's selector and at-rules. Pure: it reads nothing but its arguments. */
export function classify(
	block: Pick<WalkedBlock, "node" | "selector" | "atRules" | "scope">,
	vocabulary: Vocabulary,
): Classified {
	const { names } = vocabulary;
	const inScope = block.scope !== undefined;
	const chain = foldSiblings(block.selector);
	const scopeIndex = inScope ? chain.findIndex((link) => link.compound.scopeRoot === true) : -1;
	const scopeLink = chain[scopeIndex];
	const scoped = scopeLink !== undefined && identityOf(scopeLink.compound, names) !== undefined;
	const named = scoped ? scopeIndex : rootIndexOf(chain, names);
	// With no component named, a scope's rule keeps the scope's root as its root compound, as before.
	const rootIndex = named === -1 && inScope ? Math.max(scopeIndex, 0) : named;
	const subjectIndex = chain.length - 1;
	const rootCompound = chain[rootIndex]?.compound;
	const root = rootCompound ? identityOf(rootCompound, names) : undefined;
	// No compound names a component, or the rule is in a scope whose root names none (`@scope (main)`): either way
	// the rule styles a global element, whose theme and color-scheme attributes are its identity.
	const global = root === undefined;

	const context: Step[] = [];
	const path: Step[] = [];
	const conditions: Condition[] = [];
	const partMentions: PartMention[] = [];
	let pseudoElement: string | undefined;
	let themeScope: ThemeScope | undefined;
	let colorScheme = false;

	for (const [index, link] of chain.entries()) {
		const isSubject = index === subjectIndex;
		const isContext = index < rootIndex;
		const split = splitCompound(link.compound, names, { isRoot: index === rootIndex, isContext, global });
		const on: On = isContext ? "context" : isSubject ? "subject" : index === rootIndex ? "root" : "path";
		const before: On = isSubject && split.pseudoElement !== undefined ? "host" : on;
		const step = isContext ? undefined : path.length;
		const reading = (source: Rule | AtRule, where: On): Reading => ({ source, on: where, step, vocabulary });

		// The siblings before it say where it is. A part among them is named outside any placement path.
		for (const position of link.positions) {
			conditions.push(positionCondition(position, before, step, block.node));
			for (const part of position.compound.parts) {
				if (attributeName(part.node) === names.partAttribute)
					partMentions.push({
						name: namedValue(part.node),
						where: "position",
						on: before,
						at: positionOf(part),
						nameAt: nameAtOf(part),
					});
				partMentions.push(...mentionsWithin(part, before, names));
			}
		}

		const where = isContext ? "context" : index === rootIndex ? "root" : isSubject ? "subject" : "step";
		for (const part of split.partAttributes)
			partMentions.push({
				name: namedValue(part.node),
				where,
				on: undefined,
				at: positionOf(part),
				nameAt: nameAtOf(part),
			});

		for (const part of split.conditions) {
			conditions.push(...conditionsOf(part.node, reading(part.source, before), part.inWhere ?? false));
			partMentions.push(...mentionsWithin(part, before, names));
		}
		for (const part of split.after) {
			conditions.push(...conditionsOf(part.node, reading(part.source, on), part.inWhere ?? false));
			partMentions.push(...mentionsWithin(part, on, names));
		}

		const steps = isContext ? context : path;
		steps.push({
			combinator: steps.length === 0 ? undefined : link.combinator === ">" ? ">" : " ",
			names: split.names,
			name: split.name,
			text: split.text,
			inWhere: split.naming?.inWhere ?? false,
			at: split.naming ? positionOf(split.naming) : startOf(link.compound, block.node),
		});
		if (!isSubject) continue;
		if (split.pseudoElement) pseudoElement = pseudoElementName(split.pseudoElement.node);
		if (global) {
			const theme = split.identity.find((part) => attributeName(part.node) === names.themeAttribute);
			if (theme?.node.type === "attribute") themeScope = { theme: theme.node.value };
			colorScheme = split.identity.some((part) => attributeName(part.node) === names.colorSchemeAttribute);
		}
	}

	const queries = block.atRules.map(queryOf);
	return {
		root,
		scoped,
		context,
		path,
		pseudoElement,
		foreign: chain.some((link) => link.compound.parts.some((part) => selectsForeign(part.node))),
		themeScope,
		colorScheme,
		conditions,
		queries,
		partMentions,
		...kindOf(conditions, queries),
	};
}

/**
 * The compound that names the component. A rule is part of the component its outermost rule starts from, so what a
 * nested rule writes before `&` is context: `.dark` in `.card { .dark & { } }`. Written flat, `.dark .card` starts
 * from `.dark`.
 */
function rootIndexOf(chain: readonly Link[], names: Names): number {
	const named = (link: Link): boolean => identityOf(link.compound, names) !== undefined;
	const outer = chain.findIndex((link) => link.compound.outer === true && named(link));
	return outer === -1 ? chain.findIndex(named) : outer;
}

/**
 * Whether what a simple selector selects belongs to another stylesheet: it's `:deep()`, `:slotted()` or `:global()`,
 * or an `:is()` or `:where()` each of whose selectors goes through one. An escape inside `:has()`, `:not()` or another
 * test (`.card:has(:global(.flag))`) only tests something, so the element stays local; so does a list with a local
 * selector in it (`:is(.local, :global(.y))`), which keeps that selector's facts.
 */
function selectsForeign(node: parser.Node): boolean {
	if (isWrapper(node)) return true;
	if (node.type !== "pseudo" || !matchesAny.has(node.value.toLowerCase()) || node.nodes.length === 0)
		return false;
	return node.nodes.every((selector) => selector.nodes.some(selectsForeign));
}

/**
 * The parts named inside a selector function, at any depth: in a `:has()` path, in `:not()` or `:is()`, in
 * `:nth-child(… of …)`. Only `=` with a value names one part; any other part attribute is a reference with no name.
 */
function mentionsWithin(part: Part, on: On, names: Names): PartMention[] {
	const { node } = part;
	if (node.type !== "pseudo") return [];
	const found: PartMention[] = [];
	node.walkAttributes((attribute) => {
		if (attribute.attribute.toLowerCase() !== names.partAttribute) return;
		const inHas = isInsideHas(attribute, node);
		found.push({
			name: namedValue(attribute),
			where: inHas ? "has" : "condition",
			on,
			at: positionOf({ node: attribute, source: part.source }),
			nameAt: nameAtOf({ node: attribute, source: part.source }),
		});
	});
	return found;
}

/** Whether a node sits in a `:has()` somewhere between itself and the selector function it was found in. */
function isInsideHas(inner: parser.Node, top: parser.Node): boolean {
	for (let current = inner.parent as parser.Node | undefined; current;) {
		if (current.type === "pseudo" && current.value.toLowerCase() === ":has") return true;
		if (current === top) break;
		current = current.parent as parser.Node | undefined;
	}
	return false;
}

// The chain of compounds

/** A compound of the selector, with the siblings written before it: `[data-part="tab"] +`. */
interface Link {
	readonly compound: Compound;
	/** How it follows the compound before it, siblings aside. */
	readonly combinator: string | undefined;
	readonly positions: readonly SiblingPosition[];
}

interface SiblingPosition {
	readonly compound: Compound;
	readonly combinator: string;
}

/** A compound followed by `+` or `~` only says where the next one is: it's a position variant, not a step. */
function foldSiblings(complex: Complex): Link[] {
	const chain: Link[] = [];
	let positions: SiblingPosition[] = [];
	let combinator: string | undefined;
	for (const [index, compound] of complex.entries()) {
		const next = complex[index + 1];
		if (positions.length === 0) combinator = compound.combinator;
		// A scope's root is never only a position.
		if (next && isSibling(next.combinator) && compound.scopeRoot !== true) {
			positions.push({ compound, combinator: next.combinator ?? "+" });
			continue;
		}
		chain.push({ compound, combinator, positions });
		positions = [];
	}
	return chain;
}

function positionCondition(
	position: SiblingPosition,
	on: On,
	step: number | undefined,
	fallback: Rule | AtRule,
): Condition {
	const text = position.compound.parts.map((part) => textOf(part.node)).join("");
	return {
		...plain,
		text: `${text} ${position.combinator}`,
		kind: "variant",
		on,
		step,
		at: startOf(position.compound, fallback),
	};
}

/** Where a compound starts. A compound always has a part; the fallback keeps this total. */
function startOf(compound: Compound, fallback: Rule | AtRule): Position {
	const [first] = compound.parts;
	return first ? positionOf(first) : { node: fallback, index: 0, endIndex: 0 };
}

/** What names a component in a compound: its first class, else its component attribute's value. */
export function identityOf(compound: Compound, names: Names): Identity | undefined {
	let className: Part | undefined;
	let attribute: Part | undefined;
	for (const part of compound.parts) {
		const { node } = part;
		if (isPseudoElement(node)) break;
		if (node.type === "class") className ??= part;
		else if (
			node.type === "attribute" &&
			node.attribute.toLowerCase() === names.componentAttribute &&
			node.operator === "=" &&
			node.value
		)
			attribute ??= part;
	}
	if (className?.node.type === "class")
		return { kind: "class", className: className.node.value, at: positionOf(className) };
	if (attribute?.node.type === "attribute" && attribute.node.value)
		return { kind: "attribute", value: attribute.node.value, at: positionOf(attribute) };
	return undefined;
}

/** A compound split into what names the element and what narrows it. */
interface SplitCompound {
	/** Tag, id, `*`, the first class, `:root`, and the attribute that names a component, a part or a slot. */
	readonly identity: readonly Part[];
	/** The part that names it: a root's class or component attribute, a part's or a slot's attribute. */
	readonly naming: Part | undefined;
	readonly names: Step["names"];
	readonly name: string | undefined;
	readonly text: string;
	/** Everything else before a pseudo-element. */
	readonly conditions: readonly Part[];
	readonly pseudoElement: Part | undefined;
	/** What's written after the pseudo-element (`::after:hover`). */
	readonly after: readonly Part[];
	/** Every part attribute on it, named or not. */
	readonly partAttributes: readonly Part[];
}

function splitCompound(
	compound: Compound,
	names: Names,
	role: { readonly isRoot: boolean; readonly isContext: boolean; readonly global: boolean },
): SplitCompound {
	const identity: Part[] = [];
	const conditions: Part[] = [];
	const after: Part[] = [];
	const partAttributes: Part[] = [];
	let pseudoElement: Part | undefined;
	let className: Part | undefined;
	let component: Part | undefined;
	let part: Part | undefined;
	let slot: Part | undefined;
	// A tag inside `:is()` is a choice of element type: a variant of the component, part or slot the compound names,
	// wherever `:is()` stands in it. On an element nothing else names (`:where(ul, ol)`), it's what names it.
	const typeIsVariant =
		!role.isContext && compound.parts.some((current) => namesElement(current.node, names));

	for (const [index, current] of compound.parts.entries()) {
		const { node } = current;
		if (node.type === "nesting" || node.type === "comment") continue;
		if (pseudoElement) after.push(current);
		else if (isWrapper(node)) identity.push(current);
		else if (isPseudoElement(node)) pseudoElement = current;
		else if (node.type === "tag" && current.wrapper && typeIsVariant) conditions.push(current);
		else if (node.type === "tag" || node.type === "id" || node.type === "universal") identity.push(current);
		else if (node.type === "class") {
			// An extra class on the same element, or a class on what comes before the root, is a condition core
			// can't classify.
			if (className || role.isContext) conditions.push(current);
			else identity.push((className = current));
		} else if (node.type === "attribute") {
			const name = node.attribute.toLowerCase();
			if (name === names.componentAttribute) identity.push((component ??= current));
			else if (name === names.partAttribute) {
				partAttributes.push(current);
				// On a root's own compound it names nothing and is no variant: an element is a component or a part.
				if (!role.isRoot) identity.push((part ??= current));
			} else if (!role.isRoot && name === names.slotAttribute) identity.push((slot ??= current));
			else if (role.global && (name === names.themeAttribute || name === names.colorSchemeAttribute))
				identity.push(current);
			else conditions.push(current);
		} else if (node.type === "pseudo") {
			const value = node.value.toLowerCase();
			const listsOnly =
				(value === ":is" || value === ":where") && index === 0 && !typeIsVariant && listsElements(node);
			if (identityPseudoClasses.has(value) || listsOnly) identity.push(current);
			else conditions.push(current);
		} else conditions.push(current);
	}

	const partName = namedValue(part?.node);
	const slotName = namedValue(slot?.node);
	// Beside a class, the component attribute names nothing: the class is the identity.
	const shown = identity.filter((current) => !(className && current === component));
	return {
		identity,
		naming: role.isRoot ? (className ?? component) : partName !== undefined ? part : slot,
		names: role.isRoot ? "root" : partName !== undefined ? "part" : slotName !== undefined ? "slot" : "other",
		name: role.isRoot ? undefined : (partName ?? slotName),
		text: shown.map((current) => textOf(current.node)).join("") || "*",
		conditions,
		pseudoElement,
		after,
		partAttributes,
	};
}

/** Whether a simple selector names a component, a part or a slot: a class, or one of their attributes. */
function namesElement(node: parser.Node, names: Names): boolean {
	if (node.type === "class") return true;
	const name = attributeName(node);
	return name === names.componentAttribute || name === names.partAttribute || name === names.slotAttribute;
}

/** The value of `[data-part="title"]`: only `=` with a value names something. */
function namedValue(node: parser.Node | undefined): string | undefined {
	return node?.type === "attribute" && node.operator === "=" && node.value ? node.value : undefined;
}

function attributeName(node: parser.Node): string | undefined {
	return node.type === "attribute" ? node.attribute.toLowerCase() : undefined;
}

/** `after` for `::after` and for `:after`. */
function pseudoElementName(node: parser.Node): string {
	return String(node).trim().toLowerCase().replace(/^:+/, "");
}

// Conditions

/** The fields most conditions leave empty. */
const plain = {
	group: undefined,
	focus: false,
	attribute: undefined,
	inWhere: false,
	compound: false,
	inner: [],
	has: undefined,
	guard: undefined,
} satisfies Partial<Condition>;

/** The conditions one simple selector makes. An identity makes none. */
function conditionsOf(node: parser.Node, reading: Reading, inWhere: boolean): Condition[] {
	const base = { ...baseOf(node, reading, inWhere), text: textOf(node) };
	switch (node.type) {
		case "attribute":
			return [
				{ ...base, attribute: attributeOf(node), ...attributeKind(node, base.text, reading.vocabulary) },
			];
		case "pseudo":
			return pseudoConditions(node, reading, inWhere);
		// An extra class, wherever it's written, is a state or a variant core can't tell apart.
		case "class":
			return [{ ...base, kind: "unknown" }];
		// Reached only inside `:is()` or `:not()`: which element it is.
		case "tag":
		case "universal":
		case "id":
			return [{ ...base, kind: "variant" }];
		default:
			return [];
	}
}

function baseOf(node: parser.Node, reading: Reading, inWhere: boolean) {
	return {
		...plain,
		inWhere,
		on: reading.on,
		step: reading.step,
		at: positionOf({ node, source: reading.source }),
	};
}

function attributeOf(node: parser.Attribute): AttributeSelector {
	return { name: node.attribute.toLowerCase(), operator: node.operator, value: node.value };
}

type Kind = Pick<Condition, "kind" | "group">;

function attributeKind(node: parser.Attribute, text: string, vocabulary: Vocabulary): Kind {
	const name = node.attribute.toLowerCase();
	if (vocabulary.blocking.has(text)) return { kind: "state", group: "blocking" };
	if (vocabulary.interaction.has(text)) return { kind: "state", group: "interaction" };
	// A presence attribute is a state; so is an ARIA state, and an attribute the project lists as one.
	if (vocabulary.stateAttributes.has(name) || node.operator === undefined || ariaStates.has(name))
		return { kind: "state", group: "semantic" };
	return { kind: "variant", group: undefined };
}

function pseudoConditions(node: parser.Pseudo, reading: Reading, inWhere: boolean): Condition[] {
	const name = node.value.toLowerCase();
	const base = { ...baseOf(node, reading, inWhere), text: textOf(node) };

	// A pseudo-element can't be inside `:is()` or `:not()`; Stylelint reports it.
	if (isPseudoElement(node)) return [{ ...base, kind: "unknown" }];
	if (isWrapper(node) || identityPseudoClasses.has(name)) return [];
	if (name === ":not") {
		const inner = branchConditions(node.nodes, reading, inWhere);
		// A `:not()` that excludes a blocking state is a guard, even when it excludes it only with something else.
		return [{ ...base, ...(inner.some(holdsBlocking) ? { kind: "guard" } : summarize(inner)), inner }];
	}
	if (matchesAny.has(name)) {
		const zero = inWhere || name === ":where";
		// An alternative that only names the element (`:scope`, `:root`, `*`) can always match, so the list asks
		// nothing: what its other alternatives exclude isn't excluded.
		if (node.nodes.some(onlyNamesElement)) return [];
		const inner = branchConditions(node.nodes, reading, zero);
		const [only, ...others] = inner;
		// Around one alternative, `:is()` and `:where()` change nothing but specificity. Around several, any one
		// of them can match, so what one alternative excludes isn't excluded for the block.
		if (others.length === 0) return only ? (only.compound ? [...only.inner] : [only]) : [];
		return [{ ...base, inWhere: zero, ...summarize(inner), inner }];
	}
	if (name === ":has") {
		const read = node.nodes.map((selector) => ({ selector, has: readHas(selector, reading, inWhere) }));
		const [only, ...others] = read;
		if (only && others.length === 0) return [{ ...base, ...summarize(only.has.conditions), has: only.has }];
		// With a list, each selector is an alternative with its own path.
		const inner = read.map(({ selector, has }) => ({
			...baseOf(selector, reading, inWhere),
			text: String(selector).trim(),
			...summarize(has.conditions),
			has,
		}));
		return [{ ...base, ...summarize(inner), inner }];
	}

	const focus = name.startsWith(":focus");
	const { vocabulary } = reading;
	const compared = comparableOf(node);
	if (vocabulary.blocking.has(compared)) return [{ ...base, kind: "state", group: "blocking", focus }];
	if (vocabulary.interaction.has(compared)) return [{ ...base, kind: "state", group: "interaction", focus }];
	if (name === ":visited") return [{ ...base, kind: "state", group: "visited" }];
	if (variantPseudoClasses.has(name)) return [{ ...base, kind: "variant" }];
	// A state the settings don't list is semantic.
	return [{ ...base, kind: "state", group: "semantic", focus }];
}

/**
 * What `:is()`, `:not()` or `:where()` holds: one condition for each selector in its list. A selector that is one
 * simple selector is that condition; a compound is one condition whose `inner` must all hold together; a selector
 * with a combinator can't be classified.
 */
function branchConditions(
	selectors: readonly parser.Selector[],
	reading: Reading,
	inWhere: boolean,
): Condition[] {
	return selectors.flatMap((selector): Condition[] => {
		const nodes = selector.nodes.filter((node) => node.type !== "comment");
		const base = { ...baseOf(selector, reading, inWhere), text: String(selector).trim() };
		if (nodes.some((node) => node.type === "combinator")) return [{ ...base, kind: "unknown" }];
		const held = nodes.flatMap((node) => conditionsOf(node, reading, inWhere));
		const [only, ...others] = held;
		if (!only) return [];
		// A compound stays one even when what names the element in it makes no condition: `:root:disabled` holds
		// `:disabled` only together with `:root`.
		if (others.length === 0 && isOneSimpleSelector(nodes)) return [only];
		return [{ ...base, ...summarize(held), compound: true, inner: held }];
	});
}

/** One simple selector, or `:is()` or `:where()` around one. */
function isOneSimpleSelector(nodes: readonly parser.Node[]): boolean {
	const [only, ...others] = nodes;
	if (!only || others.length > 0) return false;
	if (only.type !== "pseudo" || !matchesAny.has(only.value.toLowerCase())) return true;
	const [selector, ...more] = only.nodes;
	if (!selector || more.length > 0) return true;
	return isOneSimpleSelector(selector.nodes.filter((node) => node.type !== "comment"));
}

/** A selector inside a selector function that only names the element: `:scope`, `:root`, `*`. */
function onlyNamesElement(selector: parser.Selector): boolean {
	const nodes = selector.nodes.filter((node) => node.type !== "comment");
	return (
		nodes.length > 0 &&
		nodes.every(
			(node) =>
				node.type === "universal" ||
				(node.type === "pseudo" && identityPseudoClasses.has(node.value.toLowerCase())),
		)
	);
}

/**
 * Whether excluding a condition excludes a blocking state: it is one, or it's a compound or an `:is()` list that holds
 * one. `:not(:is(:focus, :disabled))` excludes both, in either order; what a `:not()` or `:has()` inside holds isn't
 * excluded.
 */
function holdsBlocking(condition: Condition): boolean {
	if (condition.compound) return condition.inner.some(holdsBlocking);
	const list = condition.inner.length > 0 && !/^:(?:not|has)\(/.test(condition.text);
	if (list) return condition.inner.some(holdsBlocking);
	return condition.kind === "state" && condition.group === "blocking";
}

/** The kind of what's inside: unknown if anything is, a state if anything is, a variant otherwise. */
function summarize(inner: readonly Condition[]): Pick<Condition, "kind" | "group" | "focus"> {
	if (inner.some((one) => one.kind === "unknown")) return { kind: "unknown", group: undefined, focus: false };
	const states = inner.filter((one) => one.kind === "state");
	const [first] = states;
	if (first) return { kind: "state", group: first.group, focus: states.every((one) => one.focus) };
	// A guard inside `:is()` is still about a state.
	if (inner.some((one) => one.kind === "guard")) return { kind: "state", group: undefined, focus: false };
	return { kind: "variant", group: undefined, focus: false };
}

/** One selector of a `:has()`: the steps to the element it looks at, and what it asks of them. */
function readHas(selector: parser.Selector, reading: Reading, inWhere: boolean): Has {
	const { names } = reading.vocabulary;
	const path: HasStep[] = [];
	const conditions: Condition[] = [];
	let combinator: HasStep["combinator"] = " ";
	let compound: parser.Node[] = [];

	const close = (): void => {
		const [first] = compound;
		if (!first) return;
		let step: Omit<HasStep, "conditions"> = {
			combinator,
			part: undefined,
			inWhere: false,
			at: positionOf({ node: first, source: reading.source }),
		};
		const own: Condition[] = [];
		for (const node of compound) {
			const named = partNamedBy(node, names);
			if (named && step.part === undefined) {
				step = { ...step, ...named, at: positionOf({ node: named.node, source: reading.source }) };
				continue;
			}
			// What names an element inside `:has()` is no condition of the root.
			if (node.type === "tag" || node.type === "universal" || node.type === "class" || node.type === "id")
				continue;
			const name = attributeName(node);
			if (name === names.componentAttribute || name === names.partAttribute || name === names.slotAttribute)
				continue;
			own.push(...conditionsOf(node, reading, inWhere));
		}
		conditions.push(...own);
		path.push({
			combinator: step.combinator,
			part: step.part,
			inWhere: step.inWhere,
			conditions: own,
			at: step.at,
		});
		compound = [];
	};

	for (const node of selector.nodes) {
		if (node.type === "comment") continue;
		if (node.type === "combinator") {
			close();
			const value = node.value.trim();
			combinator = value === ">" || value === "+" || value === "~" ? value : " ";
		} else compound.push(node);
	}
	close();
	return { path, conditions };
}

/** The part a simple selector names: `[data-part="input"]`, or the same inside `:where()` or `:is()`. */
function partNamedBy(
	node: parser.Node,
	names: Names,
): { part: string; inWhere: boolean; node: parser.Node } | undefined {
	if (node.type === "attribute") {
		const named = attributeName(node) === names.partAttribute ? namedValue(node) : undefined;
		return named === undefined ? undefined : { part: named, inWhere: false, node };
	}
	if (node.type !== "pseudo") return undefined;
	const name = node.value.toLowerCase();
	if (name !== ":where" && name !== ":is") return undefined;
	const [selector, ...others] = node.nodes;
	const [only, ...rest] = selector?.nodes.filter((inner) => inner.type !== "comment") ?? [];
	if (!only || others.length > 0 || rest.length > 0) return undefined;
	const named = partNamedBy(only, names);
	return named && { ...named, inWhere: named.inWhere || name === ":where" };
}

// Queries

function queryOf(node: AtRule): Query {
	const name = node.name.toLowerCase() as Query["name"];
	return {
		node,
		name,
		params: node.params,
		styleQueries: name === "container" ? styleQueriesOf(node.params) : [],
	};
}

/**
 * Every style feature a container query asks about, with how it stands in the query's logic: turned around by a
 * `not`, and one side of an `or`.
 */
export function styleQueriesOf(params: string): StyleQuery[] {
	const found: StyleQuery[] = [];
	readQuery(params, { negated: false, optional: false, inStyle: false }, found);
	return found;
}

/** Where a part of a query stands: under an odd number of `not`s, on one side of an `or`, inside `style()`. */
interface Standing {
	readonly negated: boolean;
	readonly optional: boolean;
	readonly inStyle: boolean;
}

/** A query, or a group of one: a name, `not`, and groups joined by `and` or by `or`. */
function readQuery(text: string, standing: Standing, found: StyleQuery[]): void {
	const query = text.trim();
	if (standing.inStyle && query.startsWith("--")) {
		const feature = /^(--[^\s:()<>=]+)\s*(?::\s*([\s\S]*))?/.exec(query);
		if (feature?.[1]) {
			const value = feature[2]?.trim() || undefined;
			found.push({ name: feature[1], value, negated: standing.negated, optional: standing.optional });
		}
		return;
	}
	const items = queryItems(query);
	const groups = items.filter((item) => item.inner !== undefined);
	const joinedBy = (word: string): boolean =>
		items.some((item) => item.inner === undefined && item.text.toLowerCase() === word);
	// Under a `not`, `and` and `or` trade places: `not (a and b)` holds as soon as one of them doesn't.
	const alternatives = groups.length > 1 && joinedBy(standing.negated ? "and" : "or");

	let turned = false;
	for (const item of items) {
		if (item.inner === undefined) {
			turned = item.text.toLowerCase() === "not";
			continue;
		}
		const name = item.text.toLowerCase();
		if (name === "" || name === "style")
			readQuery(
				item.inner,
				{
					negated: standing.negated !== turned,
					optional: standing.optional || alternatives,
					inStyle: standing.inStyle || name === "style",
				},
				found,
			);
		turned = false;
	}
}

/** A word of a query (`not`, `and`, a container's name), or a group: `(…)` with no name, or `style(…)`. */
interface QueryItem {
	readonly text: string;
	/** What a group holds; undefined for a word. */
	readonly inner: string | undefined;
}

function queryItems(text: string): QueryItem[] {
	const items: QueryItem[] = [];
	let index = 0;
	while (index < text.length) {
		if (/\s/.test(text[index] ?? "")) {
			index++;
			continue;
		}
		let end = index;
		while (end < text.length && !/[\s(]/.test(text[end] ?? "")) end++;
		const word = text.slice(index, end);
		if (text[end] !== "(") {
			items.push({ text: word, inner: undefined });
			index = end;
			continue;
		}
		const close = closingParenthesis(text, end);
		if (close === -1) break;
		items.push({ text: word, inner: text.slice(end + 1, close) });
		index = close + 1;
	}
	return items;
}

// The block's kind

/**
 * Any state makes the block a state, and a variant combined with one is a state of that variant. A guard is no
 * state of its own, so a block with nothing but a guard is a state with no group. `@supports` can't change while
 * the page runs, so it leaves the kind as it was.
 */
function kindOf(
	conditions: readonly Condition[],
	queries: readonly Query[],
): { kind: BlockKind; groups: StateGroup[] } {
	if (conditions.some((condition) => condition.kind === "unknown")) return { kind: "unknown", groups: [] };
	const groups = new Set<StateGroup>();
	for (const condition of conditions) collectGroups(condition, groups);
	const context = queries.some((query) => query.name !== "supports");
	if (context) groups.add("context");

	const state =
		context || conditions.some((condition) => condition.kind === "state" || condition.kind === "guard");
	if (state) return { kind: "state", groups: groupOrder.filter((group) => groups.has(group)) };
	if (conditions.some((condition) => condition.kind === "variant")) return { kind: "variant", groups: [] };
	return { kind: queries.length > 0 ? "supports" : "own", groups: [] };
}

/** The groups of the states a condition holds. What a guard lists isn't a state of the block. */
function collectGroups(condition: Condition, groups: Set<StateGroup>): void {
	if (condition.kind !== "state") return;
	const held = condition.has?.conditions ?? condition.inner;
	if (held.length > 0) for (const inner of held) collectGroups(inner, groups);
	else if (condition.group) groups.add(condition.group);
}

// Text and positions

/** A simple selector as text, normalized: `[name="value"]`, a lowercase tag and pseudo-class name. */
function textOf(node: parser.Node): string {
	if (node.type === "attribute") {
		const name = node.attribute.toLowerCase();
		if (node.operator === undefined) return `[${name}]`;
		return `[${name}${node.operator}"${node.value ?? ""}"${node.insensitive ? " i" : ""}]`;
	}
	if (node.type === "tag") return node.value.toLowerCase();
	const text = String(node).trim();
	if (node.type !== "pseudo") return text;
	const name = node.value.toLowerCase();
	// `:not()` and `:is()` list what they hold, each as written.
	if (matchesAny.has(name) || name === ":has" || name === ":not")
		return `${name}(${node.nodes.map((selector) => String(selector).trim()).join(", ")})`;
	return name + text.slice(node.value.length);
}

/**
 * A simple selector as it's compared with a state list. An attribute selector is its text. A pseudo-class is its
 * name and its arguments without the spacing CSS ignores, so `:nth-child(2n+1)` is `:nth-child(2n + 1)`; a
 * condition's own `text` keeps the arguments as written.
 */
function comparableOf(node: parser.Node): string {
	if (node.type !== "pseudo" || node.nodes.length === 0) return textOf(node);
	const name = node.value.toLowerCase();
	if (!nthPseudoClasses.has(name)) return `${name}(${node.nodes.map(comparableSelector).join(", ")})`;

	// `An+B` allows space around its sign and is case-insensitive; what follows `of` is a selector list.
	const [formula = "", ...selectors] = node.nodes
		.map(String)
		.join(",")
		.split(/\s+of\s+/i);
	const of = selectors.length > 0 ? ` of ${comparableList(selectors.join(" of "))}` : "";
	return `${name}(${formula.replace(/\s+/g, "").toLowerCase()}${of})`;
}

/**
 * A selector inside a pseudo-class's arguments: bare combinators, each attribute selector and pseudo-class as it's
 * compared, and every name in its own case, since `:state(Loading)` isn't `:state(loading)`.
 */
function comparableSelector(selector: parser.Selector): string {
	return selector.nodes
		.map((node) => {
			if (node.type === "combinator") return node.value.trim() || " ";
			return node.type === "pseudo" || node.type === "attribute" ? comparableOf(node) : String(node).trim();
		})
		.join("")
		.trim();
}

function comparableList(selectors: string): string {
	try {
		return parser().astSync(selectors).nodes.map(comparableSelector).join(", ");
	} catch {
		return selectors.trim();
	}
}

/** A setting's selector, written the way `comparableOf` writes a condition, so the two compare. */
function normalize(selector: string): string {
	try {
		const [first] = parser().astSync(selector).nodes;
		const text = first?.nodes.map(comparableOf).join("");
		return text || selector.trim();
	} catch {
		return selector.trim();
	}
}

/**
 * Where the part's name is written inside `[data-part="…"]`: the value as written, escapes included, without its
 * quotes. Undefined when the attribute names no one part.
 */
function nameAtOf(part: { node: parser.Node; source: Rule | AtRule }): Position | undefined {
	const { node } = part;
	if (node.type !== "attribute" || namedValue(node) === undefined || node.sourceIndex === undefined)
		return undefined;
	const raw = node.raws.value ?? node.value ?? "";
	const quoted = node.quoteMark !== null && node.quoteMark !== undefined && /^["']/.test(raw);
	const index = node.sourceIndex + node.offsetOf("value") + (quoted ? 1 : 0);
	return { node: part.source, index, endIndex: index + raw.length - (quoted ? 2 : 0) };
}

function positionOf(part: { node: parser.Node; source: Rule | AtRule; written?: Part["written"] }): Position {
	if (part.written) return { node: part.source, ...part.written };
	// A class that SCSS's `&-suffix` made has no place of its own.
	const index = part.node.sourceIndex ?? 0;
	return { node: part.source, index, endIndex: index + String(part.node).trim().length };
}
