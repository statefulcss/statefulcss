import type stylelint from "stylelint";

import plugins from "../index.js";
import { adjusted, contradicted, fromRecommended, overrides, statefulRules } from "./adjustments.js";

/**
 * For a project that already extends a Stylelint config, listed last in `extends`: the Stateful CSS rules, and
 * the project's rules that contradict the methodology switched off or adjusted.
 */
const compatible: stylelint.Config = {
	plugins,
	rules: { ...statefulRules, ...fromRecommended, ...adjusted, ...contradicted },
	overrides,
};

export default compatible;
