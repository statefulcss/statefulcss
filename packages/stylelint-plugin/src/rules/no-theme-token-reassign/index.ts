import type { Rule } from "stylelint";
import stylelint from "stylelint";

const {
	utils: { report, ruleMessages, validateOptions },
} = stylelint;

export const noThemeTokenReassignRuleName = "no-theme-token-reassign";

export const messages = ruleMessages(`statefulcss/${noThemeTokenReassignRuleName}`, {
	rejected: (prop: string) =>
		`Unexpected assignment to theme token "${prop}". Theme tokens (--t-*) should only be defined in theme files.`,
});

export const meta: Rule["meta"] = {
	url: "https://github.com/statefulcss/statefulcss/blob/main/packages/stylelint-plugin/src/rules/no-theme-token-reassign/README.md",
};

const themeTokenPattern = /^--t-/;

const rule: Rule = Object.assign(
	((primary) => {
		return (root, result) => {
			const validOptions = validateOptions(result, `statefulcss/${noThemeTokenReassignRuleName}`, {
				actual: primary,
				possible: [true],
			});

			if (!validOptions) {
				return;
			}

			root.walkDecls(themeTokenPattern, (decl) => {
				report({
					message: messages.rejected(decl.prop),
					node: decl,
					result,
					ruleName: `statefulcss/${noThemeTokenReassignRuleName}`,
					word: decl.prop,
				});
			});
		};
	}) satisfies stylelint.RuleBase<boolean>,
	{
		ruleName: `statefulcss/${noThemeTokenReassignRuleName}`,
		messages,
		meta,
	},
);

export const noThemeTokenReassign = rule;
