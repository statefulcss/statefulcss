// The rule names on their own, for tools that list the rules without loading Stylelint, the settings or the rules.

/** Every rule's name as a Stylelint config writes it, in the order the configs list them: `statefulcss/bind-once`. */
export const ruleNames: readonly string[] = [
	"statefulcss/variable-role-prefix",
	"statefulcss/theme-tokens",
	"statefulcss/bind-once",
	"statefulcss/bind-through-state-variables",
	"statefulcss/blocking-states-win",
	"statefulcss/visited-colors-only",
	"statefulcss/no-undeclared-state-variables",
	"statefulcss/parts-in-scope",
	"statefulcss/part-variables",
	"statefulcss/no-abbreviations",
	"statefulcss/config-check",
];
