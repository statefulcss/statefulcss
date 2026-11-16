// `parts-in-scope` (rule 9): a component's parts are styled only inside its `@scope (root) to ([data-component])`,
// written after its root block, and inside that scope `:scope` appears only as `:scope >`.
import type { Settings } from "@statefulcss/config";
import type { Block, Component, Condition, Element, Model, Position, Scope, Step } from "@statefulcss/core";

import { defineRule, type Edit, type Finding } from "../rule.js";

const messages = {
	outside: (part: string, scope: string) =>
		`Unexpected ${part} outside its component's scope. Move it into "${scope}".`,
	outsideAnyComponent: (part: string) =>
		`Unexpected ${part} outside a component's scope. Move it into the scope of the component it belongs to.`,
	outsideEach: (part: string, scopes: string) =>
		`Unexpected ${part} outside its components' scopes. Write it in each of ${scopes}.`,
	partOnRoot: (part: string, root: string) =>
		`Unexpected ${part} on the component root "${root}". An element is a component or a part, so remove one of the two.`,
	partOnRoots: (part: string, roots: string) =>
		`Unexpected ${part} on the component roots ${roots}. An element is a component or a part, so remove one of the two.`,
	placementPath: (step: string) =>
		`Unexpected ${step} on a placement path that doesn't step through parts with ">". Step from the root through parts, each with ">", into the slot.`,
	placementPseudoElement: (pseudo: string, slot: string) =>
		`Unexpected "${pseudo}" at the end of a placement path. The path ends on ${slot} itself, so style its "${pseudo}" in the component's scope.`,
	hasSibling: (part: string, combinator: string) =>
		`Unexpected ${part} reached with "${combinator}" inside ":has()" on the component root. That's a sibling of the root, so reach a part inside it, as a descendant or with ">".`,
	hasOnPseudoElement: (part: string, pseudo: string) =>
		`Unexpected ${part} inside ":has()" on a rule that styles "${pseudo}". Write the state on the root, setting a part variable that "${pseudo}" reads.`,
	limit: (limit: string, root: string, expected: string) =>
		`Unexpected limit "${limit}" on the scope of "${root}". Limit it with "${expected}".`,
	noLimit: (root: string, expected: string) =>
		`Expected a limit on the scope of "${root}". Add "${expected}" after its root.`,
	nested: (scope: string) => `Unexpected "@scope" inside a rule. Write "${scope}" after the root block.`,
	nestedAnyComponent: () =>
		`Unexpected "@scope" inside a rule. Write the component's scope after its root block.`,
	beforeRootBlock: (root: string) =>
		`Unexpected scope of "${root}" before its root block. Move it after the root block.`,
	nestingChild: () => `Expected ":scope >" instead of "& >" inside a scope.`,
	nestingDescendant: () =>
		`Unexpected "&" before a descendant inside a scope. Remove "& " and select the descendant on its own.`,
	scopeDescendant: () =>
		`Unexpected ":scope" before a descendant inside a scope. Remove ":scope " and select the descendant on its own.`,
	conditionSelecting: (condition: string) =>
		`Unexpected "${condition}" on the scope's root, selecting inside it. Write "${condition}" in the root block, setting part variables that the parts read.`,
	conditionOnRoot: (condition: string) =>
		`Unexpected "${condition}" on the scope's root. Write the root's variants and states in its root block.`,
	rootInScope: (written: string) =>
		`Unexpected "${written}" without ">" inside a scope. Move its declarations to the root block.`,
	declarationsInScope: () => `Unexpected declarations directly inside a scope. Move them to the root block.`,
};

type Key = keyof typeof messages;

export default defineRule<Record<never, never>, Key>({
	name: "parts-in-scope",
	severity: "error",
	fixable: true,
	messages,
	check(model, { settings }) {
		const findings: Finding<Key>[] = [];
		// One finding for each written thing: a selector list, or a rule under two components, says it once.
		const seen = new Map<object, Set<string>>();
		const report = (finding: Finding<Key>): void => {
			const node = finding.at.node;
			const place = "index" in finding.at ? `${finding.at.index}:${finding.at.endIndex}` : "";
			const key = [place, finding.message, ...finding.args].join("\n");
			const keys = seen.get(node) ?? new Set<string>();
			seen.set(node, keys);
			if (keys.has(key)) return;
			keys.add(key);
			findings.push(finding);
		};

		const siblings = checkPlacementPaths(model, report);
		checkReferences(model, settings, siblings, report);
		checkScopes(model, settings, report);
		checkBlocksInScopes(model, report);
		return findings;
	},
});

type Report = (finding: Finding<Key>) => void;

/**
 * Every place a selector names a part outside its component's scope, or inside `:has()` on the root. A part selected
 * with no component is reported too, unless a utility or a foreign selector names it.
 * What one written selector says about two components (`.card, .button { & [data-part="x"] { } }`) is one finding.
 */
function checkReferences(
	model: Model,
	settings: Settings,
	siblings: readonly Position[],
	report: Report,
): void {
	interface Verdict {
		readonly message: "outside" | "partOnRoot" | "hasSibling" | "hasOnPseudoElement";
		readonly at: Position;
		readonly part: string;
		readonly component: Component;
		readonly detail: string;
	}
	const verdicts: Verdict[] = [];

	for (const reference of model.partReferences) {
		const component = reference.component === undefined ? undefined : model.components[reference.component];
		const blocks = reference.blocks.map((id) => model.blocks[id]).filter((block) => block !== undefined);
		// A part is named by its name, `part "icon"`; a selector that names no one part, as written.
		const part = reference.name === undefined ? `"${textAt(reference.at)}"` : `part "${reference.name}"`;
		if (!component) {
			// A part selected with no component, on its own or from a global element, reaches into every component
			// with a part of that name. A utility and what `:global()` selects are outside the rule.
			if (blocks.length > 0 && blocks.every((block) => skipped(model, block))) continue;
			report({ message: "outsideAnyComponent", args: [part], at: reference.at });
			continue;
		}
		// What `:deep()` selects belongs to another component's rules.
		if (blocks.length > 0 && !blocks.some((block) => owned(model, block))) continue;
		const verdict = { at: reference.at, part, component };

		if (reference.place === "has") {
			const combinator = siblingStep(blocks, reference.at);
			if (combinator) verdicts.push({ ...verdict, message: "hasSibling", detail: combinator });
			continue;
		}
		if (reference.place !== "outside") continue;
		// A sibling on a placement path is where that path goes wrong, and is reported there.
		if (siblings.some((sibling) => within(reference.at, sibling))) continue;
		const pseudo =
			blocks.length > 0 && blocks.every((block) => block.path.length === 1)
				? hostedBy(model, blocks)
				: undefined;
		if (reference.inHas && pseudo)
			verdicts.push({ ...verdict, message: "hasOnPseudoElement", detail: pseudo });
		else if (!reference.inHas && blocks.length > 0 && blocks.every((block) => block.path.length === 1))
			verdicts.push({ ...verdict, message: "partOnRoot", detail: "" });
		else verdicts.push({ ...verdict, message: "outside", detail: "" });
	}

	// The verdicts on one written place, by what they say, each with every component it names.
	const groups = new Map<string, Verdict[]>();
	const places = new Map<object, number>();
	for (const verdict of verdicts) {
		const node = places.get(verdict.at.node) ?? places.size;
		places.set(verdict.at.node, node);
		const key = `${node} ${verdict.at.index} ${verdict.message} ${verdict.detail}`;
		groups.set(key, [...(groups.get(key) ?? []), verdict]);
	}
	for (const group of groups.values()) {
		const [first] = group;
		if (!first) continue;
		const components = [...new Set(group.map((verdict) => verdict.component))];
		const { at, part } = first;
		if (first.message === "hasSibling" || first.message === "hasOnPseudoElement")
			report({ message: first.message, args: [part, first.detail], at });
		else if (first.message === "partOnRoot")
			report(
				components.length === 1
					? { message: "partOnRoot", args: [part, rootOf(first.component, settings)], at }
					: {
							message: "partOnRoots",
							args: [part, quotedList(components.map((one) => rootOf(one, settings)))],
							at,
						},
			);
		else
			report(
				components.length === 1
					? { message: "outside", args: [part, scopeOf(first.component, settings)], at }
					: {
							message: "outsideEach",
							args: [part, quotedList(components.map((one) => scopeOf(one, settings)))],
							at,
						},
			);
	}
}

/**
 * Every placement path: from the root block through parts, each with `>`, into the slot itself. A plain element on
 * the way, a sibling, or a pseudo-element of the slot takes it outside the exception. Each written path is reported
 * once, where it first goes wrong. Returns the siblings it reported, so they aren't reported again as outside parts.
 */
function checkPlacementPaths(model: Model, report: Report): Position[] {
	const siblings: Position[] = [];
	const blocks = new Set<Block>();
	for (const reference of model.partReferences) {
		if (reference.place !== "placement-path" || reference.component === undefined) continue;
		for (const id of reference.blocks) {
			const block = model.blocks[id];
			if (block && owned(model, block)) blocks.add(block);
		}
	}

	for (const block of blocks) {
		const last = block.path.length - 1;
		// Where it goes wrong, as a place along the path: a step's index, a sibling just before its step.
		let wrong: { rank: number; finding: Finding<Key>; sibling?: Position } | undefined;
		const consider = (rank: number, finding: Finding<Key>, sibling?: Position): void => {
			if (!wrong || rank < wrong.rank) wrong = { rank, finding, ...(sibling ? { sibling } : {}) };
		};
		for (const condition of block.conditions) {
			if (condition.step === undefined || condition.step === 0 || !/\s[+~]$/.test(condition.text)) continue;
			const named = model.partReferences.find((reference) => within(reference.at, condition.at));
			const step = named?.name === undefined ? `"${condition.text}"` : `part "${named.name}"`;
			consider(
				condition.step - 0.5,
				{ message: "placementPath", args: [step], at: condition.at },
				condition.at,
			);
		}
		block.path.forEach((step, index) => {
			if (index === 0) return;
			const expected = index === last ? "slot" : "part";
			if (step.combinator === ">" && step.names === expected) return;
			consider(index, { message: "placementPath", args: [stepName(step)], at: step.at });
		});
		const element = model.elements[block.element];
		const slot = block.path[last];
		if (element?.kind === "pseudo-element" && slot) {
			const pseudo = `::${element.name}`;
			consider(last + 0.5, {
				message: "placementPseudoElement",
				args: [pseudo, stepName(slot)],
				at: pseudoAfter(slot.at, element.name) ?? slot.at,
			});
		}
		if (!wrong) continue;
		report(wrong.finding);
		if (wrong.sibling) siblings.push(wrong.sibling);
	}
	return siblings;
}

/** A step as a message names it: `part "footer"`, `slot "action"`, or as written. */
function stepName(step: Step): string {
	return (step.names === "part" || step.names === "slot") && step.name !== undefined
		? `${step.names} "${step.name}"`
		: `"${step.text}"`;
}

/** Where `::after` is written right after the slot that hosts it, when it can be found there. */
function pseudoAfter(slot: Position, name: string): Position | undefined {
	const value = valueOf(slot.node).toLowerCase();
	const match = new RegExp(`^(?:[^\\s>+~,]*?)(::?${name.toLowerCase()})`).exec(value.slice(slot.endIndex));
	if (!match?.[1]) return undefined;
	const index = slot.endIndex + match.index + match[0].length - match[1].length;
	return { node: slot.node, index, endIndex: index + match[1].length };
}

/** The combinator that takes a part named in `:has()` to a sibling of the root (`:has(+ [data-part="input"])`). */
function siblingStep(blocks: readonly Block[], at: Position): string | undefined {
	const conditions = (list: readonly Condition[]): Condition[] =>
		list.flatMap((condition) => [condition, ...conditions(condition.inner)]);
	for (const block of blocks)
		for (const condition of conditions(block.conditions)) {
			const path = condition.has?.path ?? [];
			const end = path.findIndex((step) => within(at, step.at));
			if (end === -1) continue;
			const sibling = path
				.slice(0, end + 1)
				.find((step) => step.combinator === "+" || step.combinator === "~");
			if (sibling) return sibling.combinator;
		}
	return undefined;
}

/** The pseudo-element every block styles on the root, when they all style one: `::after`. */
function hostedBy(model: Model, blocks: readonly Block[]): string | undefined {
	const names = new Set(
		blocks.map((block) => {
			const element = model.elements[block.element];
			return element?.kind === "pseudo-element" ? `::${element.name}` : undefined;
		}),
	);
	const [only] = names;
	return names.size === 1 ? only : undefined;
}

/** Every `@scope`: where it's written, and its limit. Only a component's scope is checked. */
function checkScopes(model: Model, settings: Settings, report: Report): void {
	const expected = `to ([${settings.componentAttribute}])`;
	for (const scope of model.scopes) {
		const component = scope.component === undefined ? undefined : model.components[scope.component];
		const at = paramsOf(scope);
		if (scope.nested) {
			if (component) report({ message: "nested", args: [scopeOf(component, settings)], at });
			// A scope core can't read, written in a component's rule (`.card { @scope to (…) { } }`).
			else if (inComponent(model, scope)) report({ message: "nestedAnyComponent", args: [], at });
			continue;
		}
		if (!component) continue;
		const root = scope.root ?? rootOf(component, settings);
		if (scope.limit === undefined) report({ message: "noLimit", args: [root, expected], at });
		else if (!scope.limitIsComponents)
			report({ message: "limit", args: [`to (${scope.limit})`, root, expected], at: limitOf(scope) ?? at });
		if (scope.afterRootBlock === false) report({ message: "beforeRootBlock", args: [root], at });
	}
}

/** Whether a scope core couldn't read sits in a rule of a component's. */
function inComponent(model: Model, scope: Scope): boolean {
	return model.unknowns.some(
		(unknown) =>
			unknown.node === scope.node &&
			unknown.elements.some((id) => {
				const element = model.elements[id];
				return element !== undefined && ownedElement(element);
			}),
	);
}

/** Every block inside a component's scope: how it writes the scope's root. */
function checkBlocksInScopes(model: Model, report: Report): void {
	for (const block of model.blocks) {
		if (block.reach !== "scope" || block.scope === undefined || !owned(model, block)) continue;
		const scope = model.scopes[block.scope];
		if (scope?.component === undefined || scope.nested) continue;

		// A condition in the scope's own root (`@scope (.button:hover)`) is a variant or state selecting everything
		// inside it. Each block in the scope carries it; the report keeps one for each written place.
		const prelude = wholeCondition(block.conditions.filter((condition) => condition.at.node === scope.node));
		if (prelude) report({ message: "conditionSelecting", args: [prelude.text], at: prelude.at });

		// The scope's root is the subject itself, the host of a pseudo-element, or a compound before the subject.
		const subjectIsRoot = block.path.length === 1;
		const ownRoot = model.elements[block.element]?.kind === "pseudo-element" ? "host" : "subject";
		const onRoot = subjectIsRoot ? ownRoot : "root";
		// Any condition, one core can't classify included, and all of it: `[data-tone="muted"]:hover`.
		const condition = wholeCondition(
			block.conditions.filter((one) => one.on === onRoot && one.at.node !== scope.node),
		);
		if (condition) {
			report({
				message: subjectIsRoot ? "conditionOnRoot" : "conditionSelecting",
				args: [condition.text],
				at: condition.at,
			});
			continue;
		}

		const written = block.scopeRootAt;
		if (subjectIsRoot) {
			if (written) report({ message: "rootInScope", args: [textAt(written)], at: written });
			else {
				const first =
					block.declarations[0] === undefined ? undefined : model.declarations[block.declarations[0]];
				if (first) report({ message: "declarationsInScope", args: [], at: { node: first.node } });
			}
			continue;
		}
		if (!written) continue;
		const next = block.path[1];
		// `--fix` changes only what one written selector holds: not a `&` an outer rule wrote.
		const oneSelector = next !== undefined && next.at.node === written.node;
		if (block.scopeRoot === "&" && next?.combinator === ">") {
			// The glue checks that "&" is still written there before it replaces it.
			const edits: Edit[] = [{ kind: "replace", at: written, expects: "&", text: ":scope" }];
			report({ message: "nestingChild", args: [], at: written, ...(oneSelector ? { edits } : {}) });
		} else if (next?.combinator === " ") {
			const message = block.scopeRoot === "&" ? "nestingDescendant" : "scopeDescendant";
			const removal = oneSelector ? removalBefore(written, next.at) : undefined;
			report({ message, args: [], at: written, ...(removal ? { edits: [removal] } : {}) });
		}
	}
}

/**
 * The conditions written on one compound, as one: in one selector, the whole text from the first to the last, with
 * every bracket it opens or closes there too (`:hover:where(:not(:disabled))`); across nested rules, each one's text
 * in order. Undefined when there are none.
 */
function wholeCondition(conditions: readonly Condition[]): { text: string; at: Position } | undefined {
	const [first] = conditions;
	if (!first) return undefined;
	if (conditions.every((condition) => condition.at.node === first.at.node)) {
		const at = balanced({
			node: first.at.node,
			index: Math.min(...conditions.map((condition) => condition.at.index)),
			endIndex: Math.max(...conditions.map((condition) => condition.at.endIndex)),
		});
		return { text: textAt(at), at };
	}
	return { text: conditions.map((condition) => condition.text).join(""), at: first.at };
}

/**
 * A range widened until every bracket in it has its partner in it too, and a function's name with its opening
 * bracket. Brackets inside quotes and escaped ones don't count.
 */
function balanced(at: Position): Position {
	const text = valueOf(at.node);
	const partners = new Map<number, number>();
	const open: number[] = [];
	for (let index = 0; index < text.length; index++) {
		const char = text[index];
		if (char === "\\") index++;
		else if (char === '"' || char === "'") {
			for (index++; index < text.length && text[index] !== char; index++) if (text[index] === "\\") index++;
		} else if (char === "(" || char === "[") open.push(index);
		else if (char === ")" || char === "]") {
			const opener = open.pop();
			if (opener === undefined) continue;
			partners.set(opener, index);
			partners.set(index, opener);
		}
	}
	let { index, endIndex } = at;
	for (let changed = true; changed;) {
		changed = false;
		for (let one = index; one < endIndex; one++) {
			const partner = partners.get(one);
			if (partner === undefined || (partner >= index && partner < endIndex)) continue;
			if (partner < index) index = partner;
			else endIndex = partner + 1;
			changed = true;
		}
		// The name before an opening bracket at the start: `:where(`.
		if (text[index] === "(") {
			let start = index;
			while (start > 0 && /[-\w]/.test(text[start - 1] ?? "")) start--;
			while (start > 0 && text[start - 1] === ":") start--;
			if (start < index) {
				index = start;
				changed = true;
			}
		}
	}
	return { node: at.node, index, endIndex };
}

/** Whether a block styles an element of a component's. Global, utility and foreign elements are no component's. */
function owned(model: Model, block: Block): boolean {
	const element = model.elements[block.element];
	return element !== undefined && ownedElement(element);
}

/** Whether a block styles a utility, or what `:deep()`, `:global()` and the like select. */
function skipped(model: Model, block: Block): boolean {
	const kind = model.elements[block.element]?.kind;
	return kind === "foreign" || kind === "utility";
}

function ownedElement(element: Element): boolean {
	if (element.kind === "pseudo-element") return element.component !== undefined;
	return (
		element.kind === "root" ||
		element.kind === "part" ||
		element.kind === "slot" ||
		element.kind === "content"
	);
}

/** Whether one position lies inside another, in the same node. */
function within(inner: Position, outer: Position): boolean {
	return inner.node === outer.node && inner.index >= outer.index && inner.endIndex <= outer.endIndex;
}

/** Names in double quotes, joined: `"a"`, `"a" and "b"`, `"a", "b" and "c"`. */
function quotedList(names: readonly string[]): string {
	const quoted = names.map((name) => `"${name}"`);
	return quoted.length < 2 ? quoted.join("") : `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1) ?? ""}`;
}

/**
 * The edit that removes `& ` or `:scope ` before the next compound, when only spaces stand between them in one
 * rule's selector. Anything else, such as a `:where()` around the next part, is left for the author.
 */
function removalBefore(written: Position, next: Position): Edit | undefined {
	if (next.node !== written.node || next.index <= written.endIndex) return undefined;
	const at = { node: written.node, index: written.index, endIndex: next.index };
	const expects = textAt(at);
	return /^(?:&|:scope)\s+$/i.test(expects) ? { kind: "replace", at, expects, text: "" } : undefined;
}

/** The text a position covers, in the rule's selector or the at-rule's parameters. */
function textAt(position: Position): string {
	return valueOf(position.node).slice(position.index, position.endIndex);
}

function valueOf(node: Position["node"]): string {
	return node.type === "rule" ? node.selector : node.params;
}

/** The scope's parameters, or the whole at-rule when it has none. */
function paramsOf(scope: Scope): Finding["at"] {
	const { node } = scope;
	return node.params.length > 0 ? { node, index: 0, endIndex: node.params.length } : { node };
}

/** `to (…)` in the scope's parameters. */
function limitOf(scope: Scope): Position | undefined {
	const { node } = scope;
	const index = node.params.search(/\bto\s*\(/i);
	return index === -1 ? undefined : { node, index, endIndex: node.params.trimEnd().length };
}

/** The component's root as a selector: `.button`, `[data-component="tabs"]`. */
function rootOf(component: Component, settings: Settings): string {
	const { identity } = component;
	return identity.kind === "class"
		? `.${identity.className}`
		: `[${settings.componentAttribute}="${identity.value}"]`;
}

/** The scope a component's parts belong in. */
function scopeOf(component: Component, settings: Settings): string {
	return `@scope (${rootOf(component, settings)}) to ([${settings.componentAttribute}])`;
}
