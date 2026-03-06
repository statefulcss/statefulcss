import statefulCSSPlugin from "@statefulcss/stylelint-plugin";

/** @type {import("stylelint").Config} */
export default {
	extends: ["stylelint-config-standard"],
	plugins: [statefulCSSPlugin],
	rules: {
		"custom-property-empty-line-before": null,
		"number-max-precision": 5,
		"value-keyword-case": [
			"lower",
			{
				ignoreKeywords: ["currentColor"],
			},
		],
		"statefulcss/no-theme-token-reassign": true,
	},
	overrides: [
		{
			files: ["**/*.module.css"],
			rules: {
				"selector-class-pattern": [
					"^[a-z][a-zA-Z0-9]+$|^[A-Z][a-zA-Z0-9]+$",
					{
						message: 'Expected class selector "%(selector)s" to be kebab-case or PascalCase',
					},
				],
			},
		},
	],
};
