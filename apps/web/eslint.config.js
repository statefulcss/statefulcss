import { config as baseConfig } from "@repo/eslint-config/base";
import eslintPluginAstro from "eslint-plugin-astro";

/** @type {import("eslint").Linter.Config[]} */
export default [
	...baseConfig,
	...eslintPluginAstro.configs.recommended,
	{
		ignores: [".astro/**", "dist/**"],
	},
];
