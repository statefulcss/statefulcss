import type stylelint from "stylelint";
import stylelintConfigRecommended from "stylelint-config-recommended";

import plugins from "../index.js";
import { adjusted, overrides, statefulRules, syntaxOverrides } from "./adjustments.js";

/**
 * For a new project: Stylelint's own recommended rules, the Stateful CSS rules, and Stylelint's rules that
 * contradict the methodology switched off or adjusted, with what Sass, Vue and CSS Modules need of them.
 */
const recommended: stylelint.Config = {
	// The config itself, not its name: it's found whether a project extends this config or imports it.
	extends: [stylelintConfigRecommended],
	plugins,
	rules: { ...statefulRules, ...adjusted },
	overrides: [...overrides, ...syntaxOverrides],
};

export default recommended;
