// Turns the config check into a Stylelint rule. It reads the config Stylelint resolved for the file, and says each
// problem once for a run: on the first file it's found in, and on that file again whenever it's linted, so an editor
// keeps showing it.
import stylelint from "stylelint";

import type { ConfigRuleDefinition } from "../rules/rules-work-together/index.js";
import { isRecord, metaOf, ruleNameOf, validOptions } from "./plugin.js";

const { createPlugin, utils } = stylelint;

/**
 * Where each problem was said, by its text: the file's path, or `""` for code with no file. A plugin keeps its own,
 * so one made for a test starts with none.
 */
export type Said = Map<string, string>;

export function toConfigPlugin(definition: ConfigRuleDefinition, said: Said = new Map()): stylelint.Plugin {
	const ruleName = ruleNameOf(definition);
	const messages = utils.ruleMessages(ruleName, definition.messages);
	// A `.vue` file's `<style>` blocks share one result: the problems are said in its first block.
	const checked = new WeakSet<object>();

	const rule: stylelint.Rule = (primary: unknown, secondary: unknown) => (root, result) => {
		if (!validOptions(result, definition, primary, secondary)) return;
		// As for every rule: a falsy secondary option isn't a custom message (`toPlugin`).
		if (!isRecord(secondary)) delete result.stylelint.customMessages[ruleName];
		if (checked.has(result)) return;
		checked.add(result);

		const rules = result.stylelint.config?.rules ?? {};
		const isOn = (name: string): boolean => {
			const setting: unknown = rules[name];
			const primary: unknown = Array.isArray(setting) ? setting[0] : setting;
			return primary !== undefined && primary !== null;
		};
		const file = result.opts?.from ?? root.source?.input.file ?? "";
		for (const finding of definition.check(isOn)) {
			const message = (messages as Readonly<Record<string, (...args: string[]) => string>>)[finding.message];
			if (!message) continue;
			const text = message(...finding.args);
			const first = said.get(text);
			if (first !== undefined && first !== file) continue;
			said.set(text, file);
			utils.report({
				ruleName,
				result,
				node: root,
				index: 0,
				endIndex: 1,
				message,
				messageArgs: [...finding.args],
			});
		}
	};

	rule.ruleName = ruleName;
	rule.messages = messages;
	rule.meta = metaOf(definition);
	return createPlugin(ruleName, rule);
}
