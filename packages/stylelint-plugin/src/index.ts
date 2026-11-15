import type stylelint from "stylelint";

import { rules } from "./rules/index.js";
import { metaOf, ruleNameOf, toPlugin } from "./stylelint/plugin.js";

/** The rule plugins, in the form Stylelint accepts in `plugins`. No rules yet. */
const plugins: stylelint.Plugin[] = rules.map((rule) => toPlugin(rule));

/** The name of every rule, for tools that list or document them. */
export const ruleNames: readonly string[] = rules.map(ruleNameOf);

/** Every rule's page and whether it can fix, by the rule's name. */
export const ruleMeta: Readonly<Record<string, stylelint.RuleMeta>> = Object.fromEntries(
	rules.map((rule) => [ruleNameOf(rule), metaOf(rule)]),
);

export default plugins;
