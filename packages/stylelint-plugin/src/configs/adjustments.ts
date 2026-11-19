// The one source of both configs, so `recommended` and `compatible` can't disagree.
import type stylelint from "stylelint";

import { everyRule } from "../rules/index.js";
import { ruleNameOf } from "../stylelint/plugin.js";

type Rules = NonNullable<stylelint.Config["rules"]>;

/** The Stateful CSS rules, each at its own level, the config check included. */
export const statefulRules: Rules = Object.fromEntries(
	everyRule.map((rule) => [
		ruleNameOf(rule),
		rule.severity === "warning" ? [true, { severity: "warning" }] : true,
	]),
);

/** Stylelint's own rules, as both configs set them. */
export const adjusted: Rules = {
	// The methodology has no use for `!important`: states are ordered, and blocking states come last.
	"declaration-no-important": true,
	// A repeated native property works as a fallback for older browsers. `@supports` is the taught form, so every
	// repeat is a warning that says so. Its fix would delete the fallback, so it's off.
	"declaration-block-no-duplicate-properties": [
		true,
		{
			severity: "warning",
			disableFix: true,
			message: 'Unexpected duplicate "%s". Write the fallback with "@supports" instead.',
		},
	],
	// It compares selectors across the file, and reports state blocks written in the methodology's order.
	"no-descending-specificity": null,
	// `bind-once` reports a repeated custom property, with the `@supports` form that replaces it.
	"declaration-block-no-duplicate-custom-properties": null,
};

/**
 * Rules `stylelint-config-recommended` turns on, which `compatible` turns on itself: a project's own config may not
 * have them.
 */
export const fromRecommended: Rules = {
	"selector-no-unmatchable": true,
	"selector-no-invalid": true,
	// A longhand followed by its shorthand, which always discards the longhand.
	"declaration-block-no-shorthand-property-overrides": true,
};

/** Rules a project's existing config may have on that contradict the methodology. `compatible` switches them off. */
export const contradicted: Rules = {
	// `stylelint-config-standard` expects kebab-case, which refuses a private's `--_gap`.
	"custom-property-pattern": null,
	// It expects kebab-case too, which refuses `.Button`, the form a CSS Module uses.
	"selector-class-pattern": null,
	// Formatting rules that fight the grouping of a component's defaults.
	"custom-property-empty-line-before": null,
	"declaration-empty-line-before": null,
	// Tokens and component variables are declared in other files, and a library's variables in none.
	"no-unknown-custom-properties": null,
};

/** Stylelint's docs say the two selector rules are for CSS only. */
export const overrides: NonNullable<stylelint.Config["overrides"]> = [
	{
		files: ["**/*.scss", "**/*.sass", "**/*.less"],
		rules: {
			"selector-no-unmatchable": null,
			"selector-no-invalid": null,
		},
	},
];

/** Sass's own at-rules, which `at-rule-no-unknown` doesn't know. */
const sassAtRules = [
	"use",
	"forward",
	"import",
	"mixin",
	"include",
	"content",
	"function",
	"return",
	"extend",
	"at-root",
	"if",
	"else",
	"each",
	"for",
	"while",
	"error",
	"warn",
	"debug",
];

/** What a Sass block needs of the rules that know only CSS's names. */
const sassNames: Rules = {
	"at-rule-no-unknown": [true, { ignoreAtRules: sassAtRules }],
	// CSS has `@mixin` and `@function` too, so their Sass preludes are read as CSS's. `media` is ignored as
	// `stylelint-config-recommended` ignores it.
	"at-rule-prelude-no-invalid": [true, { ignoreAtRules: ["media", "mixin", "function"] }],
	"annotation-no-unknown": [true, { ignoreAnnotations: ["default", "global"] }],
	// A mixin's `&` is the selector of the rule that includes it: `.button { @include focused; }`.
	"nesting-selector-no-missing-scoping-root": [true, { ignoreAtRules: ["mixin"] }],
};

/**
 * CSS Modules' blocks whose declarations name values rather than set properties: `:export { brand: red; }` and
 * `:import("./base.css") { other: source; }`.
 */
const cssModulesBlocks = [":export", "/^:import\\(/"];

/** CSS Modules' own properties and blocks, which `property-no-unknown` doesn't know. */
const cssModulesProperties: Rules = {
	"property-no-unknown": [true, { ignoreProperties: ["composes"], ignoreSelectors: cssModulesBlocks }],
};

/** CSS Modules' own names: `composes`, `:global`, `:local`, `:export` and `:import()`, and `@value`. */
const cssModulesNames = (atRules: readonly string[]): Rules => ({
	...cssModulesProperties,
	"selector-pseudo-class-no-unknown": [
		true,
		{ ignorePseudoClasses: ["global", "local", "export", "import"] },
	],
	"at-rule-no-unknown": [true, { ignoreAtRules: [...atRules, "value"] }],
});

/**
 * For `recommended`, whose rules come from `stylelint-config-recommended`: the syntaxes the rules read, Sass, Vue
 * and CSS Modules, by file name. A project on `compatible` has its own config for its syntaxes. Overrides go in
 * order, and a later one replaces a rule's whole setting, so the CSS Modules ones repeat Sass's at-rules.
 */
export const syntaxOverrides: NonNullable<stylelint.Config["overrides"]> = [
	{
		files: ["**/*.scss", "**/*.sass"],
		rules: {
			...sassNames,
			// They read a value or a media query as CSS, so a Sass variable, function or map in one is reported.
			"declaration-property-value-no-unknown": null,
			"value-no-invalid": null,
			"media-query-no-invalid": null,
			// Sass's `@use` and `@forward` come before an `@import`.
			"no-invalid-position-at-import-rule": [true, { ignoreAtRules: ["use", "forward"] }],
		},
	},
	{
		// A `<style lang="scss">` block can't be told from a CSS one by file name: Sass's names are accepted, and the
		// rules that read values as CSS stay on.
		files: ["**/*.vue"],
		rules: {
			...sassNames,
			// Vue's own pseudo-classes, and CSS Modules' names in a `<style module>` block.
			"selector-pseudo-class-no-unknown": [
				true,
				{ ignorePseudoClasses: ["deep", "global", "slotted", "local", "export", "import"] },
			],
			...cssModulesProperties,
			"at-rule-no-unknown": [true, { ignoreAtRules: [...sassAtRules, "value"] }],
		},
	},
	{ files: ["**/*.module.css"], rules: cssModulesNames([]) },
	{ files: ["**/*.module.scss", "**/*.module.sass"], rules: cssModulesNames(sassAtRules) },
];
