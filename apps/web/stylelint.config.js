/** @type {import("stylelint").Config} */
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	// color theme still switches schemes with [data-scheme] on "*".
	ignoreFiles: ["src/styles/themes/base/color.css"],
	overrides: [
		{
			// Stylelint reads the <style> blocks of an Astro file.
			files: ["**/*.astro"],
			customSyntax: "postcss-html",
		},
	],
};
