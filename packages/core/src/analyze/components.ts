// Pass 3. Gives every block its element: finds the components, links their scopes and doc comments, and makes the
// elements each component selects. Also gathers the guards and every place a selector names a part.
import type { AtRule, ChildNode, Rule } from "postcss";

import type {
	Component,
	Condition,
	DocComment,
	Element,
	Guard,
	Id,
	Identity,
	PartReference,
	Scope,
} from "../model.js";
import { type Classified, classify, identityOf, type PartMention, type Vocabulary } from "./classify.js";
import { readDocComment } from "./doc-comment.js";
import { kebabCase } from "./files.js";
import type { Names } from "./names.js";
import { type Complex, parseSelectorList } from "./selectors.js";
import type { Walked } from "./walk.js";

export interface Placed {
	readonly components: readonly Component[];
	readonly scopes: readonly Scope[];
	/** With their blocks; their variables come from a later pass. */
	readonly elements: readonly Element[];
	/** One per block, in the blocks' order. */
	readonly blocks: readonly PlacedBlock[];
	readonly guards: readonly Guard[];
	readonly partReferences: readonly PartReference[];
	readonly docComments: readonly DocComment[];
	/** One list per unknown, in the unknowns' order: the elements whose rule it sits in. */
	readonly unknownElements: readonly (readonly Id[])[];
}

/** What this pass adds to a block. */
export interface PlacedBlock {
	readonly element: Id;
	readonly reach: "direct" | "scope" | "descendant";
	/** The block's conditions, each guard among them now with its id. */
	readonly conditions: readonly Condition[];
	readonly guard: Id | undefined;
}

/** Who a selector's element belongs to. */
type Owner =
	| { readonly kind: "component"; readonly identity: Identity }
	| { readonly kind: "global" }
	| { readonly kind: "utility" }
	| { readonly kind: "foreign" };

/** What an element is made from, and the element while its blocks are still being gathered. Local to `components`. */
type ElementSeed = { readonly sheet: number; readonly key: string } & ElementFields;
type ElementDraft = ElementSeed & { readonly blocks: Id[] };

type ElementFields = Element extends infer One
	? One extends Element
		? Omit<One, "id" | "sheet" | "key" | "blocks" | "variables">
		: never
	: never;

/** A component while it's being put together. */
interface ComponentDraft {
	readonly sheet: number;
	readonly identity: Identity;
	/** The place of the first rule or scope that names it. */
	readonly order: number;
	readonly docComments: number[];
}

/**
 * `classified[i]` is what pass 2 read from `walked.blocks[i]`. Pure: it returns new data and changes nothing it's
 * given.
 */
export function components(
	walked: Walked,
	classified: readonly Classified[],
	vocabulary: Vocabulary,
): Placed {
	const { names } = vocabulary;
	const classifySelector = (selector: Complex, scope: number | undefined): Classified | undefined => {
		const node = selector[0]?.parts[0]?.source;
		return node && classify({ node, selector, atRules: [], scope }, vocabulary);
	};

	// Who each rule and each scope belongs to
	const rules = walked.rules.map((rule) => ({
		rule,
		selectors: rule.selectors.flatMap((selector) => {
			const read = classifySelector(selector, rule.scope);
			return read ? [{ read, owner: ownerOf(read, rule.layer, names) }] : [];
		}),
	}));
	const scopeOwners = walked.scopes.map((scope): Owner | undefined => {
		const identity = scope.root && identityOf(scope.root, names);
		if (!scope.root) return undefined;
		if (!identity) return { kind: "global" };
		return isUtility(identity, scope.layer, names) ? { kind: "utility" } : { kind: "component", identity };
	});

	// Components: every identity a rule or a scope names, in the order the file first names it
	const drafts = new Map<string, ComponentDraft>();
	const named: { sheet: number; owner: Owner | undefined; order: number }[] = [
		...rules.flatMap(({ rule, selectors }) =>
			selectors.map(({ owner }) => ({ sheet: rule.sheet, owner, order: rule.order })),
		),
		...walked.scopes.map((scope, index) => ({
			sheet: scope.sheet,
			owner: scopeOwners[index],
			order: scope.order,
		})),
	].sort((a, b) => a.order - b.order);
	for (const { sheet, owner, order } of named) {
		if (owner?.kind !== "component") continue;
		const key = draftKey(sheet, owner.identity);
		if (!drafts.has(key)) drafts.set(key, { sheet, identity: owner.identity, order, docComments: [] });
	}

	// Doc comments: each belongs to the component of the rule or the scope right after it
	const ruleIndex = new Map<ChildNode, number>(walked.rules.map((rule, index) => [rule.node, index]));
	const scopeIndex = new Map<ChildNode, number>(walked.scopes.map((scope, index) => [scope.node, index]));
	const comments = walked.docComments.map((comment, index) => {
		const next = comment.next;
		const rule = next === undefined ? undefined : ruleIndex.get(next);
		const scope = next === undefined ? undefined : scopeIndex.get(next);
		const owner =
			rule !== undefined
				? rules[rule]?.selectors[0]?.owner
				: scope !== undefined
					? scopeOwners[scope]
					: undefined;
		const key = owner?.kind === "component" ? draftKey(comment.sheet, owner.identity) : undefined;
		if (key) drafts.get(key)?.docComments.push(index);
		return { comment, key, read: readDocComment(comment.node.text) };
	});

	// Names, and a class root joined with an attribute scope of the same name
	const nameOf = (draft: ComponentDraft): { name: string; nameFrom: Component["nameFrom"] } => {
		const tag = draft.docComments.map((index) => comments[index]?.read.componentName).find((name) => name);
		if (tag) return { name: tag, nameFrom: "tag" };
		return draft.identity.kind === "attribute"
			? { name: draft.identity.value, nameFrom: "attribute" }
			: { name: kebabCase(draft.identity.className), nameFrom: "class" };
	};
	const classRoots = [...drafts].filter(([, draft]) => draft.identity.kind === "class");
	const joined = new Map<string, string>();
	for (const [key, draft] of drafts) {
		if (draft.identity.kind !== "attribute") continue;
		const { name } = nameOf(draft);
		const sameName = classRoots.find(
			([, other]) => other.sheet === draft.sheet && nameOf(other).name === name,
		);
		if (sameName) joined.set(key, sameName[0]);
	}
	const componentKeys = [...drafts.keys()]
		.filter((key) => !joined.has(key))
		.map((key) => {
			const others = [...joined].filter(([, target]) => target === key).map(([from]) => from);
			const all = [key, ...others].flatMap((one) => drafts.get(one) ?? []);
			return { key, order: Math.min(...all.map((draft) => draft.order)), all };
		})
		.sort((a, b) => a.order - b.order);
	const componentIds = new Map<string, Id>(componentKeys.map(({ key }, id) => [key, id]));
	const componentOf = (sheet: number, identity: Identity): Id | undefined => {
		const key = draftKey(sheet, identity);
		return componentIds.get(joined.get(key) ?? key);
	};

	// Elements: made as the blocks name them, the component's root first
	const elements: ElementDraft[] = [];
	const elementIds = new Map<string, Id>();
	const ensure = (lookup: string, create: boolean, make: () => ElementSeed): Id | undefined => {
		const existing = elementIds.get(lookup);
		if (existing !== undefined || !create) return existing;
		const id = elements.push({ ...make(), blocks: [] }) - 1;
		elementIds.set(lookup, id);
		return id;
	};
	const rootKeyOf = (component: Id): string => {
		const identity = componentKeys[component]?.all[0]?.identity;
		if (!identity) return "";
		return identity.kind === "class"
			? `.${identity.className}`
			: `[${names.componentAttribute}="${identity.value}"]`;
	};
	const sheetOf = (component: Id): number => componentKeys[component]?.all[0]?.sheet ?? 0;
	const rootOf = (component: Id, create: boolean): Id | undefined =>
		ensure(`c${component}/root`, create, () => ({
			kind: "root",
			component,
			sheet: sheetOf(component),
			key: rootKeyOf(component),
		}));
	const namedElement = (
		component: Id,
		kind: "part" | "slot",
		name: string,
		create: boolean,
	): Id | undefined =>
		ensure(`c${component}/${kind}/${name}`, create, () => {
			const attribute = kind === "part" ? names.partAttribute : names.slotAttribute;
			const key = `${rootKeyOf(component)} [${attribute}="${name}"]`;
			return { kind, component, name, sheet: sheetOf(component), key };
		});

	/** The element a classified selector styles. With `create` off, only one that a block already made. */
	const elementOf = (read: Classified, owner: Owner, sheet: number, create: boolean): Id | undefined => {
		const text = pathText(read);
		let base: Id | undefined;
		let component: Id | undefined;
		if (owner.kind === "foreign" || owner.kind === "utility") {
			// Neither is checked, so a pseudo-element is part of the one element.
			const selector = read.pseudoElement ? `${text}::${read.pseudoElement}` : text;
			return ensure(`${owner.kind}${sheet}/${selector}`, create, () => ({
				kind: owner.kind,
				selector,
				sheet,
				key: selector,
			}));
		}
		if (owner.kind === "global") {
			base = ensure(`global${sheet}/${text}`, create, () => ({
				kind: "global",
				selector: text,
				themeScope: read.themeScope,
				colorScheme: read.colorScheme,
				sheet,
				key: text,
			}));
		} else {
			component = componentOf(sheet, owner.identity);
			if (component === undefined) return undefined;
			const owned = component;
			const root = rootOf(owned, create);
			// Every part and slot a selector names is one the component has, styled or not.
			const stepIds = read.path.map((step, index) =>
				index > 0 && step.name !== undefined && (step.names === "part" || step.names === "slot")
					? namedElement(owned, step.names, step.name, create)
					: undefined,
			);
			for (const mention of read.partMentions)
				if (mention.where === "has" && mention.name !== undefined)
					namedElement(owned, "part", mention.name, create);

			const subject = read.path.length - 1;
			if (subject <= 0) base = root;
			else if (stepIds[subject] !== undefined) base = stepIds[subject];
			else {
				const selector = read.path
					.slice(1)
					.map((step) => (step.combinator === ">" ? `> ${step.text}` : step.text))
					.join(" ");
				// The nearest part the selector names before its subject.
				const under = stepIds
					.slice(0, subject)
					.reduce<number>(
						(nearest, id, index) =>
							id !== undefined && read.path[index]?.names === "part" ? index : nearest,
						-1,
					);
				base = ensure(`c${owned}/content/${selector}`, create, () => ({
					kind: "content",
					component: owned,
					selector,
					under: under === -1 ? undefined : stepIds[under],
					sheet: sheetOf(owned),
					key: `${rootKeyOf(owned)} ${selector}`,
				}));
			}
		}
		const name = read.pseudoElement;
		if (base === undefined || name === undefined) return base;
		const host = base;
		return ensure(`${host}::${name}`, create, () => ({
			kind: "pseudo-element",
			component,
			name,
			host,
			sheet,
			key: `${elements[host]?.key ?? ""}::${name}`,
		}));
	};

	// Blocks, guards and part references
	const guards: { element: Id; condition: Condition; blocking: string[]; blocks: Id[] }[] = [];
	const guardIds = new Map<Rule | AtRule, Map<number, Id>>();
	const references: PartReference[] = [];
	const referenced = new Map<Rule | AtRule, Set<string>>();

	/** The element a guard is written on: the block's own, its host for a pseudo-element, or the component root. */
	const guardedElement = (condition: Condition, element: Id, component: Id | undefined): Id => {
		const draft = elements[element];
		if (condition.on === "host" && draft?.kind === "pseudo-element") return draft.host;
		if (condition.on === "root" && component !== undefined) return rootOf(component, false) ?? element;
		return element;
	};

	const blocks = walked.blocks.map((block, id): PlacedBlock => {
		const read = classified[id];
		if (!read) throw new Error(`block ${id} wasn't classified`);
		const owner = ownerOf(read, block.layer, names);
		const element = elementOf(read, owner, block.sheet, true);
		if (element === undefined) throw new Error(`block ${id} has no element`);
		elements[element]?.blocks.push(id);
		const component = owner.kind === "component" ? componentOf(block.sheet, owner.identity) : undefined;

		const conditions = read.conditions.map((condition): Condition => {
			if (condition.kind !== "guard") return condition;
			const written = guardIds.get(condition.at.node) ?? new Map<number, Id>();
			guardIds.set(condition.at.node, written);
			let guard = written.get(condition.at.index);
			if (guard === undefined) {
				guard = guards.length;
				written.set(condition.at.index, guard);
				guards.push({
					element: guardedElement(condition, element, component),
					condition: { ...condition, guard },
					blocking: condition.inner
						.filter((inner) => inner.kind === "state" && inner.group === "blocking" && !inner.has)
						.map((inner) => inner.text),
					blocks: [],
				});
			}
			guards[guard]?.blocks.push(id);
			return { ...condition, guard };
		});

		for (const mention of read.partMentions) {
			const place = placeOf(mention, read, owner, block.scope !== undefined);
			const seen = referenced.get(mention.at.node) ?? new Set<string>();
			referenced.set(mention.at.node, seen);
			const once = `${mention.at.index} ${place}`;
			if (seen.has(once)) continue;
			seen.add(once);
			references.push({ name: mention.name, component, block: id, place, at: mention.at });
		}

		return {
			element,
			reach:
				block.scope !== undefined
					? "scope"
					: owner.kind === "component" && read.path.length > 1
						? "descendant"
						: "direct",
			conditions,
			guard: conditions.find((condition) => condition.kind === "guard")?.guard,
		};
	});

	// A component nothing styled yet still has its root
	const roots = componentKeys.map((_, id) => rootOf(id, true));

	// The first rule that styles each component's root, outside any scope
	const firstRootRule = new Map<Id, number>();
	for (const { rule, selectors } of rules) {
		if (rule.scope !== undefined) continue;
		for (const { read, owner } of selectors) {
			if (owner.kind !== "component" || read.path.length !== 1 || read.pseudoElement) continue;
			const component = componentOf(rule.sheet, owner.identity);
			if (component !== undefined && !firstRootRule.has(component)) firstRootRule.set(component, rule.order);
		}
	}

	const scopes = walked.scopes.map((scope, id): Scope => {
		const owner = scopeOwners[id];
		const component = owner?.kind === "component" ? componentOf(scope.sheet, owner.identity) : undefined;
		const rootOrder = component === undefined ? undefined : firstRootRule.get(component);
		return {
			id,
			node: scope.node,
			component,
			root: scope.rootText,
			rootKind: owner?.kind === "component" ? owner.identity.kind : undefined,
			limit: scope.limit,
			limitIsComponents: isComponentsLimit(scope.limit, names),
			nested: scope.nested,
			afterRootBlock: rootOrder === undefined ? undefined : scope.order > rootOrder,
		};
	});

	const docComments = comments.map(({ comment, key, read }, id): DocComment => ({
		id,
		node: comment.node,
		component: key === undefined ? undefined : componentIds.get(joined.get(key) ?? key),
		...read,
	}));

	return {
		components: componentKeys.map(({ all }, id): Component => {
			const [first] = all;
			const root = roots[id];
			if (!first || root === undefined) throw new Error(`component ${id} is incomplete`);
			// A class root keeps its identity when an attribute scope joined it, and its own doc comment comes first.
			const merged = { ...first, docComments: all.flatMap((draft) => draft.docComments) };
			return {
				id,
				sheet: first.sheet,
				identity: first.identity,
				...nameOf(merged),
				docComment: merged.docComments[0],
				root,
				hasRootBlock: firstRootRule.has(id),
				scopes: scopes.filter((scope) => scope.component === id).map((scope) => scope.id),
				elements: elements.flatMap((element, index) =>
					"component" in element && element.component === id ? [index] : [],
				),
			};
		}),
		scopes,
		elements: elements.map((draft, id) => ({ ...draft, id, variables: [] }) as Element),
		blocks,
		guards: guards.map((guard, id) => ({ id, ...guard })),
		partReferences: references,
		docComments,
		unknownElements: walked.unknowns.map((unknown) => {
			const found = unknown.selectors.flatMap((selector) => {
				const read = classifySelector(selector, unknown.scope);
				const element = read && elementOf(read, ownerOf(read, unknown.layer, names), unknown.sheet, false);
				return element === undefined ? [] : [element];
			});
			return [...new Set(found)];
		}),
	};
}

function draftKey(sheet: number, identity: Identity): string {
	return `${sheet} ${identity.kind} ${identity.kind === "class" ? identity.className : identity.value}`;
}

/** Layers don't decide what a component is, with one exception: a class block in the utilities layer is a utility. */
function ownerOf(read: Classified, layer: string | undefined, names: Names): Owner {
	if (read.foreign) return { kind: "foreign" };
	if (!read.root) return { kind: "global" };
	return isUtility(read.root, layer, names)
		? { kind: "utility" }
		: { kind: "component", identity: read.root };
}

function isUtility(identity: Identity, layer: string | undefined, names: Names): boolean {
	return identity.kind === "class" && layer?.split(".")[0] === names.utilitiesLayer;
}

/** A selector's steps as text: `main a`, `.stack > *`. */
function pathText(read: Classified): string {
	return read.path
		.map((step, index) =>
			index === 0 ? step.text : step.combinator === ">" ? ` > ${step.text}` : ` ${step.text}`,
		)
		.join("");
}

/** Whether a scope's limit is exactly the component attribute, with no value. */
function isComponentsLimit(limit: string | undefined, names: Names): boolean {
	if (limit === undefined) return false;
	const parsed = parseSelectorList(limit);
	if ("reason" in parsed) return false;
	const [selector, ...others] = parsed.selectors;
	const [only, ...rest] = selector?.nodes.filter((node) => node.type !== "comment") ?? [];
	if (!only || others.length > 0 || rest.length > 0 || only.type !== "attribute") return false;
	return only.attribute.toLowerCase() === names.componentAttribute && only.operator === undefined;
}

/**
 * Where a part is named. Inside its component's scope is where it belongs. From the root block there are two more
 * places: a step on the way to a slot, and inside `:has()` on the root compound. A root's own compound is never one.
 */
function placeOf(
	mention: PartMention,
	read: Classified,
	owner: Owner,
	inScope: boolean,
): PartReference["place"] {
	if (owner.kind !== "component" || mention.where === "root" || mention.where === "context") return "outside";
	if (inScope) return "scope";
	if (mention.where === "step" && read.path.at(-1)?.names === "slot") return "placement-path";
	if (mention.where === "has" && (mention.on === "root" || read.path.length === 1)) return "has";
	return "outside";
}
