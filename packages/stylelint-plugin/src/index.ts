import type stylelint from "stylelint";
import { noThemeTokenReassign, noThemeTokenReassignRuleName } from "./rules/no-theme-token-reassign/index.js";

const namespace = "statefulcss";

const plugin: stylelint.Plugin[] = [
	{
		ruleName: `${namespace}/${noThemeTokenReassignRuleName}`,
		rule: noThemeTokenReassign,
	},
];

export default plugin;
