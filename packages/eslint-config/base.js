import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		plugins: {
			turbo: turboPlugin,
		},
		rules: {
			"turbo/no-undeclared-env-vars": "warn",
		},
	},
	{
		// tsup writes a temporary bundled config next to tsup.config.ts while building; turbo runs lint and
		// build in parallel, so ESLint can find that file and fail when it disappears mid-run.
		ignores: ["dist/**", "coverage/**", "**/*.bundled_*.mjs"],
	},
	// Last, so it turns off every rule above that conflicts with Prettier.
	eslintConfigPrettier,
];
