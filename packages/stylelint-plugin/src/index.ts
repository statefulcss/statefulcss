import type stylelint from "stylelint";

import { configRule, everyRule, rules } from "./rules/index.js";
import { toConfigPlugin } from "./stylelint/config-check.js";
import { metaOf, ruleNameOf, toPlugin } from "./stylelint/plugin.js";

/** The rule plugins, in the form Stylelint accepts in `plugins`. */
const plugins: stylelint.Plugin[] = [...rules.map((rule) => toPlugin(rule)), toConfigPlugin(configRule)];

/** The name of every rule, for tools that list or document them. */
export const ruleNames: readonly string[] = everyRule.map(ruleNameOf);

/** Every rule's page and whether it can fix, by the rule's name. */
export const ruleMeta: Readonly<Record<string, stylelint.RuleMeta>> = Object.fromEntries(
	everyRule.map((rule) => [ruleNameOf(rule), metaOf(rule)]),
);

export default plugins;
