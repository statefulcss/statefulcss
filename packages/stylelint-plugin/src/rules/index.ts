import partsInScope from "./parts-in-scope/index.js";
import type { RuleDefinition } from "./rule.js";

/** Every rule, in the order the configs list them. */
export const rules: readonly RuleDefinition[] = [partsInScope];
