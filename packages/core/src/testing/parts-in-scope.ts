// A test-only check for `parts-in-scope` (rule 9), written as a plain function over the model. It proves the model
// can answer the rule's cases; the rule itself, with its messages and fixes, belongs to the Stylelint plugin.
import type { AtRule, Rule } from "postcss";

import type { Model } from "../model.js";

export type Problem =
	/** A part is selected, or named, outside its component's scope. */
	| "part-outside-scope"
	/** A placement path steps through a part without `>`. */
	| "placement-path-not-direct"
	/** A component's scope has no limit, or another one than the component attribute. */
	| "scope-limit"
	/** A scope is written inside a rule. */
	| "scope-nested"
	/** A component's scope is written before its root block. */
	| "scope-before-root-block"
	/** `& >` inside a scope, where a build writes `:scope >`. */
	| "nesting-selector-in-scope"
	/**
	 * `:scope` with an attribute or a pseudo-class. With something after it, a variant or state selecting a part; on
	 * its own, a root state written in the scope, where it beats the root block's blocking states.
	 */
	| "condition-on-scope-root";

export interface Finding {
	readonly problem: Problem;
	readonly node: Rule | AtRule;
}

export function partsInScope(model: Model): Finding[] {
	const findings: Finding[] = [];

	for (const reference of model.partReferences) {
		const block = model.blocks[reference.block];
		if (!block) continue;
		if (reference.place === "outside")
			findings.push({ problem: "part-outside-scope", node: reference.at.node });
		// A placement path reaches the slot through `>` steps only.
		if (reference.place === "placement-path" && block.path.slice(1).some((step) => step.combinator !== ">"))
			findings.push({ problem: "placement-path-not-direct", node: reference.at.node });
	}

	for (const scope of model.scopes) {
		if (scope.nested) findings.push({ problem: "scope-nested", node: scope.node });
		if (scope.component === undefined) continue;
		if (!scope.limitIsComponents) findings.push({ problem: "scope-limit", node: scope.node });
		if (scope.afterRootBlock === false)
			findings.push({ problem: "scope-before-root-block", node: scope.node });
	}

	const seen = new Set<Rule | AtRule>();
	for (const block of model.blocks) {
		if (block.reach !== "scope" || seen.has(block.node)) continue;
		const scope = block.scope === undefined ? undefined : model.scopes[block.scope];
		if (scope?.component === undefined) continue;
		seen.add(block.node);
		if (block.scopeRoot === "&") findings.push({ problem: "nesting-selector-in-scope", node: block.node });
		// The scope's root is the subject itself, the host of a pseudo-element, or a compound before the subject.
		const subjectIsRoot = block.path.length === 1;
		const ownRoot = model.elements[block.element]?.kind === "pseudo-element" ? "host" : "subject";
		if (block.conditions.some((condition) => condition.on === (subjectIsRoot ? ownRoot : "root")))
			findings.push({ problem: "condition-on-scope-root", node: block.node });
	}

	return findings;
}
