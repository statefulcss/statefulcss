// Pass 2. Reads one resolved selector and the at-rules around it: the path from the component root to the subject,
// each condition with its kind, the guard, the queries, and the kind of the block. It needs no other block, so
// which element the block styles is left to the next pass.
import type { Settings } from "@statefulcss/config";
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
	readonly kind: BlockKind;
	/** For a state: its groups, in the order states win. */
	readonly groups: readonly StateGroup[];
}

/** The settings' lists, ready to compare a condition with. */
export interface Vocabulary {
	readonly names: Names;
	readonly blocking: ReadonlySet<string>;
	readonly interaction: ReadonlySet<string>;
	readonly stateAttributes: ReadonlySet<string>;
}

export function vocabularyFrom(settings: Settings, names: Names): Vocabulary {
	return {
		names,
		blocking: new Set(settings.blockingStates.map(normalize)),
		interaction: new Set(settings.interactionStates.map(normalize)),
		stateAttributes: new Set(settings.stateAttributes.map((name) => name.toLowerCase())),
	};
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

/** Pseudo-classes that name the element itself, so they're no condition. */
const identityPseudoClasses = new Set([":root", ":scope", ":host", ":local"]);

/** Pseudo-classes that take the kind of what's inside them. `:where()` is transparent and `:has()` has its own reading. */
const matchesAny = new Set([":is", ":matches", ":-webkit-any", ":-moz-any", ":not"]);

/** The order states win in, which is the order a block lists its groups in. */
const groupOrder: readonly StateGroup[] = ["context", "interaction", "semantic", "blocking", "visited"];

type On = Condition["on"];

/** What a condition is read with: the rule it's written in, the compound it's on, and the settings' lists. */
interface Reading {
	readonly source: Rule | AtRule;
	readonly on: On;
	readonly vocabulary: Vocabulary;
}

/** Reads one block's selector and at-rules. Pure: it reads nothing but its arguments. */
export function classify(block: WalkedBlock, vocabulary: Vocabulary): Classified {
	const { names } = vocabulary;
	const inScope = block.scope !== undefined;
	const chain = foldSiblings(block.selector, inScope);
	const rootIndex = inScope ? 0 : chain.findIndex((link) => rootOf(link.compound, names) !== undefined);
	const subjectIndex = chain.length - 1;
	const global = rootIndex === -1;
	const rootCompound = chain[rootIndex]?.compound;

	const context: Step[] = [];
	const path: Step[] = [];
	const conditions: Condition[] = [];
	let pseudoElement: string | undefined;
	let themeScope: ThemeScope | undefined;
	let colorScheme = false;

	for (const [index, link] of chain.entries()) {
		const isSubject = index === subjectIndex;
		const split = splitCompound(link.compound, names, { isRoot: index === rootIndex, global });
		const on: On =
			index < rootIndex ? "context" : isSubject ? "subject" : index === rootIndex ? "root" : "path";
		const hasPseudoElement = isSubject && split.pseudoElement !== undefined;
		const before: On = hasPseudoElement ? "host" : on;

		for (const position of link.positions) conditions.push(positionCondition(position, before, block.node));
		for (const part of split.conditions)
			conditions.push(...conditionsOf(part.node, { source: part.source, on: before, vocabulary }, false));
		for (const part of split.after)
			conditions.push(...conditionsOf(part.node, { source: part.source, on, vocabulary }, false));

		const steps = index < rootIndex ? context : path;
		steps.push({
			combinator: steps.length === 0 ? undefined : link.combinator === ">" ? ">" : " ",
			names: split.names,
			name: split.name,
			text: split.text,
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
		root: rootCompound ? rootOf(rootCompound, names) : undefined,
		context,
		path,
		pseudoElement,
		foreign: chain.some((link) => link.compound.parts.some((part) => isWrapper(part.node))),
		themeScope,
		colorScheme,
		conditions,
		queries,
		...kindOf(conditions, queries),
	};
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
function foldSiblings(complex: Complex, inScope: boolean): Link[] {
	const chain: Link[] = [];
	let positions: SiblingPosition[] = [];
	let combinator: string | undefined;
	for (const [index, compound] of complex.entries()) {
		const next = complex[index + 1];
		if (positions.length === 0) combinator = compound.combinator;
		// A scope's root is never only a position.
		if (next && isSibling(next.combinator) && !(inScope && index === 0)) {
			positions.push({ compound, combinator: next.combinator ?? "+" });
			continue;
		}
		chain.push({ compound, combinator, positions });
		positions = [];
	}
	return chain;
}

function positionCondition(position: SiblingPosition, on: On, fallback: Rule | AtRule): Condition {
	const text = position.compound.parts.map((part) => textOf(part.node)).join("");
	return {
		...plain,
		text: `${text} ${position.combinator}`,
		kind: "variant",
		on,
		at: startOf(position.compound, fallback),
	};
}

/** Where a compound starts. A compound always has a part; the fallback keeps this total. */
function startOf(compound: Compound, fallback: Rule | AtRule): Position {
	const [first] = compound.parts;
	return first ? positionOf(first) : { node: fallback, index: 0, endIndex: 0 };
}

/** What names a component in a compound: its first class, else its component attribute's value. */
function rootOf(compound: Compound, names: Names): Identity | undefined {
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
}

function splitCompound(
	compound: Compound,
	names: Names,
	role: { readonly isRoot: boolean; readonly global: boolean },
): SplitCompound {
	const identity: Part[] = [];
	const conditions: Part[] = [];
	const after: Part[] = [];
	let pseudoElement: Part | undefined;
	let className: Part | undefined;
	let component: Part | undefined;
	let part: Part | undefined;
	let slot: Part | undefined;

	for (const [index, current] of compound.parts.entries()) {
		const { node } = current;
		if (node.type === "nesting" || node.type === "comment") continue;
		if (pseudoElement) after.push(current);
		else if (isWrapper(node)) identity.push(current);
		else if (isPseudoElement(node)) pseudoElement = current;
		else if (node.type === "tag" || node.type === "id" || node.type === "universal") identity.push(current);
		else if (node.type === "class") {
			// An extra class on the same element is a condition core can't classify.
			if (className) conditions.push(current);
			else identity.push((className = current));
		} else if (node.type === "attribute") {
			const name = node.attribute.toLowerCase();
			if (name === names.componentAttribute) identity.push((component ??= current));
			else if (!role.isRoot && name === names.partAttribute) identity.push((part ??= current));
			else if (!role.isRoot && name === names.slotAttribute) identity.push((slot ??= current));
			else if (role.global && (name === names.themeAttribute || name === names.colorSchemeAttribute))
				identity.push(current);
			else conditions.push(current);
		} else if (node.type === "pseudo") {
			const value = node.value.toLowerCase();
			const listsOnly = (value === ":is" || value === ":where") && index === 0 && listsElements(node);
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
	};
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
	inner: [],
	has: undefined,
	guard: undefined,
} satisfies Partial<Condition>;

/** The conditions one simple selector makes. `:where()` makes those of what it holds; an identity makes none. */
function conditionsOf(node: parser.Node, reading: Reading, inWhere: boolean): Condition[] {
	const base = { ...plain, inWhere, on: reading.on, at: positionOf({ node, source: reading.source }) };
	const text = textOf(node);
	switch (node.type) {
		case "attribute":
			return [
				{ ...base, text, attribute: attributeOf(node), ...attributeKind(node, text, reading.vocabulary) },
			];
		case "pseudo":
			return pseudoConditions(node, reading, inWhere);
		// An extra class, wherever it's written, is a state or a variant core can't tell apart.
		case "class":
			return [{ ...base, text, kind: "unknown" }];
		// Reached only inside `:is()` or `:not()`: which element it is.
		case "tag":
		case "universal":
		case "id":
			return [{ ...base, text, kind: "variant" }];
		default:
			return [];
	}
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
	const text = textOf(node);
	const base = { ...plain, inWhere, on: reading.on, at: positionOf({ node, source: reading.source }), text };

	// A pseudo-element can't be inside `:is()` or `:not()`; Stylelint reports it.
	if (isPseudoElement(node)) return [{ ...base, kind: "unknown" }];
	if (isWrapper(node) || identityPseudoClasses.has(name)) return [];
	if (name === ":where") return innerConditions(node.nodes, reading, true);
	if (matchesAny.has(name)) {
		const inner = innerConditions(node.nodes, reading, inWhere);
		const guards = name === ":not" && inner.some((one) => one.kind === "state" && one.group === "blocking");
		return [{ ...base, ...(guards ? { kind: "guard" } : summarize(inner)), inner }];
	}
	if (name === ":has") {
		const read = node.nodes.map((selector) => readHas(selector, reading, inWhere));
		const asked = read.flatMap((has) => has.conditions);
		const [only, ...others] = read;
		const single = others.length === 0 ? only : undefined;
		return [{ ...base, ...summarize(asked), inner: single ? [] : asked, has: single }];
	}

	const focus = name.startsWith(":focus");
	const { vocabulary } = reading;
	if (vocabulary.blocking.has(text)) return [{ ...base, kind: "state", group: "blocking", focus }];
	if (vocabulary.interaction.has(text)) return [{ ...base, kind: "state", group: "interaction", focus }];
	if (name === ":visited") return [{ ...base, kind: "state", group: "visited" }];
	if (variantPseudoClasses.has(name)) return [{ ...base, kind: "variant" }];
	// A state the settings don't list is semantic.
	return [{ ...base, kind: "state", group: "semantic", focus }];
}

/** The conditions inside `:is()`, `:not()` or `:where()`. A selector with a combinator there can't be classified. */
function innerConditions(
	selectors: readonly parser.Selector[],
	reading: Reading,
	inWhere: boolean,
): Condition[] {
	return selectors.flatMap((selector) => {
		const nodes = selector.nodes.filter((node) => node.type !== "comment");
		if (nodes.some((node) => node.type === "combinator")) {
			const at = positionOf({ node: selector, source: reading.source });
			return [{ ...plain, inWhere, on: reading.on, at, text: String(selector).trim(), kind: "unknown" }];
		}
		return nodes.flatMap((node) => conditionsOf(node, reading, inWhere));
	});
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
		let step: HasStep = {
			combinator,
			part: undefined,
			inWhere: false,
			at: positionOf({ node: first, source: reading.source }),
		};
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
			conditions.push(...conditionsOf(node, reading, inWhere));
		}
		path.push({ combinator: step.combinator, part: step.part, inWhere: step.inWhere, at: step.at });
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

/** Every `style(--name: value)` in a container query, with whether a `not` turns it around. */
export function styleQueriesOf(params: string): StyleQuery[] {
	const found: StyleQuery[] = [];
	const pattern = /\bstyle\(/gi;
	for (let match = pattern.exec(params); match; match = pattern.exec(params)) {
		const open = match.index + match[0].length - 1;
		const end = closingParenthesis(params, open);
		if (end === -1) break;
		const negated = /\bnot\s*$/i.test(params.slice(0, match.index));
		readStyleCondition(params.slice(open + 1, end), negated, found);
		pattern.lastIndex = end + 1;
	}
	return found;
}

/** `--q-a: 1`, or groups joined by `and` and `or`, each of which a `not` may turn around. */
function readStyleCondition(text: string, negated: boolean, found: StyleQuery[]): void {
	const rest = text.trim();
	if (!rest.startsWith("(") && !/^not\b/i.test(rest)) {
		const feature = /^(--[^\s:()<>=]+)\s*(?::\s*([\s\S]*))?/.exec(rest);
		if (feature?.[1]) found.push({ name: feature[1], value: feature[2]?.trim() || undefined, negated });
		return;
	}
	let index = 0;
	while (index < rest.length) {
		const lead = /^\s*(?:(?:and|or)\b\s*)?(not\b\s*)?/i.exec(rest.slice(index));
		index += lead?.[0].length ?? 0;
		if (rest[index] !== "(") return;
		const end = closingParenthesis(rest, index);
		if (end === -1) return;
		readStyleCondition(rest.slice(index + 1, end), negated !== (lead?.[1] !== undefined), found);
		index = end + 1;
	}
}

/** The index of the parenthesis that closes the one at `open`, or -1. */
function closingParenthesis(text: string, open: number): number {
	let depth = 0;
	for (let index = open; index < text.length; index++) {
		if (text[index] === "(") depth++;
		else if (text[index] === ")" && --depth === 0) return index;
	}
	return -1;
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
	if (matchesAny.has(name) || name === ":has" || name === ":where")
		return `${name}(${node.nodes.map((selector) => String(selector).trim()).join(", ")})`;
	return name + text.slice(node.value.length);
}

/** A setting's selector, written the way `textOf` writes a condition, so the two compare. */
function normalize(selector: string): string {
	try {
		const [first] = parser().astSync(selector).nodes;
		const text = first?.nodes.map(textOf).join("");
		return text || selector.trim();
	} catch {
		return selector.trim();
	}
}

function positionOf(part: { node: parser.Node; source: Rule | AtRule }): Position {
	// A class that SCSS's `&-suffix` made has no place of its own.
	const index = part.node.sourceIndex ?? 0;
	return { node: part.source, index, endIndex: index + String(part.node).trim().length };
}
