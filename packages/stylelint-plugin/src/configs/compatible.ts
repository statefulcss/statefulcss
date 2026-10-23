import type stylelint from "stylelint";

import plugins from "../index.js";

/** For a project that already extends a Stylelint config, listed last in `extends`. No rules yet. */
const compatible: stylelint.Config = {
	plugins,
	rules: {},
};

export default compatible;
