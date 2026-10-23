import globals from "globals";

import { config as baseConfig } from "./base.js";

/**
 * The shared configuration for packages that run on Node.js.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
	...baseConfig,
	{
		languageOptions: {
			globals: globals.node,
		},
	},
];
