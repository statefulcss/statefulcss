// `parts-in-scope` (rule 9): a component's parts are styled only inside its `@scope (root) to ([data-component])`,
// written after its root block, and inside that scope `:scope` appears only as `:scope >`.
import type { Settings } from "@statefulcss/config";
import type { Block, Component, Model, Position, Scope } from "@statefulcss/core";

import { defineRule, type Edit, type Finding } from "../rule.js";

const messages = {
	outside: (part: string, scope: string) =>
		`Unexpected "${part}" outside its component's scope. Move it into "${scope}".`,
	outsideAnyComponent: (part: string) =>
		`Unexpected "${part}" outside a component's scope. Move it into the scope of the component it belongs to.`,
	partOnRoot: (part: string, root: string) =>
		`Unexpected "${part}" on the component root "${root}". An element is a component or a part, so remove one of the two.`,
	placementPath: (part: string) =>
		`Unexpected "${part}" on a placement path that doesn't step through parts with ">". Step from the root through parts, each with ">", into the slot.`,
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
		`Unexpected "${condition}" on the scope's root, selecting inside it. Write "${condition}" in the root block, setting a part variable that the part reads.`,
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
		// One finding for each written thing: a selector list, or a rule under two components, names it once.
		const seen = new Map<object, Set<string>>();
		const report = (finding: Finding<Key>): void => {
			const node = finding.at.node;
			const key = "index" in finding.at ? `${finding.at.index}:${finding.at.endIndex}` : "";
			const keys = seen.get(node) ?? new Set<string>();
			seen.set(node, keys);
			if (keys.has(`${key}:${finding.message}`)) return;
			keys.add(`${key}:${finding.message}`);
			findings.push(finding);
		};

		checkReferences(model, settings, report);
		checkScopes(model, settings, report);
		checkBlocksInScopes(model, report);
		return findings;
	},
});

type Report = (finding: Finding<Key>) => void;

/** Every place a selector names a part: inside the scope, on a placement path, or inside `:has()` on the root. */
function checkReferences(model: Model, settings: Settings, report: Report): void {
	for (const reference of model.partReferences) {
		const blocks = reference.blocks.map((id) => model.blocks[id]).filter((block) => block !== undefined);
		// What `:deep()` and the utilities layer select belongs to no component's rules.
		if (blocks.length > 0 && blocks.every((block) => skipped(model, block))) continue;
		const part = textAt(reference.at);
		const component = reference.component === undefined ? undefined : model.components[reference.component];

		if (reference.place === "outside") {
			if (!component) {
				report({ message: "outsideAnyComponent", args: [part], at: reference.at });
			} else if (blocks.length > 0 && blocks.every((block) => block.path.length === 1)) {
				report({ message: "partOnRoot", args: [part, rootOf(component, settings)], at: reference.at });
			} else {
				report({ message: "outside", args: [part, scopeOf(component, settings)], at: reference.at });
			}
		} else if (reference.place === "placement-path" && blocks.some((block) => !throughParts(block))) {
			report({ message: "placementPath", args: [part], at: reference.at });
		}
	}
}

/**
 * A placement path steps from the root through parts, each with `>`, into the slot that is its subject. A plain
 * element on the way, or a sibling, takes it outside the exception.
 */
function throughParts(block: Block): boolean {
	const last = block.path.length - 1;
	const steps = block.path.slice(1);
	const sibling = block.conditions.some(
		(condition) => condition.step !== undefined && condition.step > 0 && /\s[+~]$/.test(condition.text),
	);
	return (
		!sibling &&
		steps.every(
			(step, index) => step.combinator === ">" && step.names === (index + 1 === last ? "slot" : "part"),
		)
	);
}

/** Every `@scope` of a component: where it's written, and its limit. */
function checkScopes(model: Model, settings: Settings, report: Report): void {
	const expected = `to ([${settings.componentAttribute}])`;
	for (const scope of model.scopes) {
		const component = scope.component === undefined ? undefined : model.components[scope.component];
		const at = paramsOf(scope);
		if (scope.nested) {
			report(
				component
					? { message: "nested", args: [scopeOf(component, settings)], at }
					: { message: "nestedAnyComponent", args: [], at },
			);
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

/** Every block inside a component's scope: how it writes the scope's root. */
function checkBlocksInScopes(model: Model, report: Report): void {
	for (const block of model.blocks) {
		if (block.reach !== "scope" || block.scope === undefined || skipped(model, block)) continue;
		const scope = model.scopes[block.scope];
		if (scope?.component === undefined || scope.nested) continue;

		// The scope's root is the subject itself, the host of a pseudo-element, or a compound before the subject.
		const subjectIsRoot = block.path.length === 1;
		const ownRoot = model.elements[block.element]?.kind === "pseudo-element" ? "host" : "subject";
		const onRoot = subjectIsRoot ? ownRoot : "root";
		// A condition written in the scope's own prelude is the scope's business, not this block's.
		const condition = block.conditions.find(
			(one) => one.on === onRoot && one.at.node !== scope.node && one.kind !== "unknown",
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
		if (block.scopeRoot === "&" && next?.combinator === ">") {
			// The glue checks that "&" is still written there before it replaces it.
			const edits: Edit[] = [{ kind: "replace", at: written, expects: "&", text: ":scope" }];
			report({ message: "nestingChild", args: [], at: written, edits });
		} else if (next?.combinator === " ") {
			const message = block.scopeRoot === "&" ? "nestingDescendant" : "scopeDescendant";
			const removal = removalBefore(written, next.at);
			report({ message, args: [], at: written, ...(removal ? { edits: [removal] } : {}) });
		}
	}
}

/** Foreign and utility elements are no component's: the rules skip them. */
function skipped(model: Model, block: Block): boolean {
	const kind = model.elements[block.element]?.kind;
	return kind === "foreign" || kind === "utility";
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
	const { node } = position;
	const value = node.type === "rule" ? node.selector : node.params;
	return value.slice(position.index, position.endIndex);
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
