// The one source of both configs, so `recommended` and `compatible` can't disagree.
import type stylelint from "stylelint";

import { rules } from "../rules/index.js";
import { ruleNameOf } from "../stylelint/plugin.js";

type Rules = NonNullable<stylelint.Config["rules"]>;

/** The Stateful CSS rules, each at its own level. */
export const statefulRules: Rules = Object.fromEntries(
	rules.map((rule) => [
		ruleNameOf(rule),
		rule.severity === "warning" ? [true, { severity: "warning" }] : true,
	]),
);

/** Stylelint's own rules, as both configs set them. */
export const adjusted: Rules = {
	// The methodology has no use for `!important`: states are ordered, and blocking states come last.
	"declaration-no-important": true,
	// A repeated native property works as a fallback for older browsers. `@supports` is the taught form, so the
	// repeat is a warning, and only where both values have the same syntax.
	"declaration-block-no-duplicate-properties": [
		true,
		{ ignore: ["consecutive-duplicates-with-different-syntaxes"], severity: "warning" },
	],
	// It compares selectors across the file, and reports state blocks written in the methodology's order.
	"no-descending-specificity": null,
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
