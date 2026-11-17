import bindOnce from "./bind-once/index.js";
import noUndeclaredStateVariables from "./no-undeclared-state-variables/index.js";
import partVariables from "./part-variables/index.js";
import partsInScope from "./parts-in-scope/index.js";
import type { RuleDefinition } from "./rule.js";
import variableRolePrefix from "./variable-role-prefix/index.js";

/** Every rule, in the order the configs list them. */
export const rules: readonly RuleDefinition[] = [
	variableRolePrefix,
	bindOnce,
	noUndeclaredStateVariables,
	partsInScope,
	partVariables,
];
