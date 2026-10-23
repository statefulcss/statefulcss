import type stylelint from "stylelint";

import plugins from "../index.js";

/** For a new project. No rules yet. */
const recommended: stylelint.Config = {
	plugins,
	rules: {},
};

export default recommended;
