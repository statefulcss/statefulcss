/** @type {import("stylelint").Config} */
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	// Not linted until they're rewritten: the reset keeps browser fixes the rules report, and the color
	// theme still switches schemes with [data-scheme] on "*".
	ignoreFiles: ["src/styles/reset.css", "src/styles/themes/base/color.css"],
	overrides: [
		{
			// Stylelint reads the <style> blocks of an Astro file.
			files: ["**/*.astro"],
			customSyntax: "postcss-html",
		},
	],
};
