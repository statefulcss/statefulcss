// Turns the config check into a Stylelint rule. It reads the config Stylelint resolved for the file, and says each
// problem once for a run: on the first file it's shown on, and on that file again if the same run lints it again.
import stylelint from "stylelint";

import type { ConfigRuleDefinition } from "../rules/config-check/index.js";
import { isRecord, metaOf, ruleNameOf, validOptions } from "./plugin.js";

const { createPlugin, utils } = stylelint;

/** Where each problem was shown in one run, by its text: the file's path, or `""` for code with no file. */
type Said = Map<string, string>;

/**
 * What stands for the run a result belongs to. Each `stylelint.lint()` call, and each PostCSS plugin made with
 * `stylelint()`, gives every file it lints the same `referenceRoots` array, and a new one to the next call. So an
 * editor, which calls `lint()` for each file it shows, gets the warning on every file, and two projects linted in
 * one process each get their own.
 */
function runOf(result: stylelint.PostcssResult): object {
	const roots: unknown = (result.stylelint as Partial<stylelint.StylelintPostcssResult>).referenceRoots;
	// A result linted some other way is a run of its own.
	return typeof roots === "object" && roots !== null ? roots : result;
}

export function toConfigPlugin(definition: ConfigRuleDefinition): stylelint.Plugin {
	const ruleName = ruleNameOf(definition);
	const messages = utils.ruleMessages(ruleName, definition.messages);
	// A `.vue` file's `<style>` blocks share one result: the problems are said in its first block.
	const checked = new WeakSet<object>();
	const runs = new WeakMap<object, Said>();

	const rule: stylelint.Rule = (primary: unknown, secondary: unknown) => (root, result) => {
		if (!validOptions(result, definition, primary, secondary)) return;
		// As for every rule: a falsy secondary option isn't a custom message (`toPlugin`).
		if (!isRecord(secondary)) delete result.stylelint.customMessages[ruleName];
		if (checked.has(result)) return;
		checked.add(result);

		const run = runOf(result);
		let said = runs.get(run);
		if (!said) {
			said = new Map();
			runs.set(run, said);
		}

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
			const before = result.messages.length;
			utils.report({
				ruleName,
				result,
				node: root,
				index: 0,
				endIndex: 1,
				message,
				messageArgs: [...finding.args],
			});
			// A warning a disable comment hides, or `--quiet` drops, isn't shown, so the next file still says it.
			if (result.messages.length > before) said.set(text, file);
		}
	};

	rule.ruleName = ruleName;
	rule.messages = messages;
	rule.meta = metaOf(definition);
	return createPlugin(ruleName, rule);
}
