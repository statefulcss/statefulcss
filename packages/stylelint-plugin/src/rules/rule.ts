// What a rule is: plain data and one pure function over core's model. Nothing here, or in a rule's folder, knows
// Stylelint, so another tool can run the same checks.
import type { Settings } from "@statefulcss/config";
import type { Model, Position } from "@statefulcss/core";
import type { AtRule, Comment, Declaration, Rule } from "postcss";

/**
 * A rule's own options, as Stylelint's secondary options hold them: each with its default and a check of its value.
 * An option whose default is a list is a list option: a config may give it one item on its own, as Stylelint's own
 * rules allow (`ignoreProperties: "/^--swiper-/"`), and the check always gets a list.
 */
export type OptionsDefinition<Options> = {
	readonly [Name in keyof Options]: {
		readonly default: Options[Name];
		/** Whether a value from the Stylelint config is one this option takes; for a list option, one item of it. */
		readonly accepts: (value: unknown) => boolean;
	};
};

/** A message: its arguments in, its sentences out, without the rule's name. */
export type Message = (...args: string[]) => string;

export interface RuleDefinition<Options = Record<never, never>, Key extends string = string> {
	/** Without the namespace: `bind-once`. */
	readonly name: string;
	/** The level the `recommended` and `compatible` configs give it. */
	readonly severity: "error" | "warning";
	/** Whether any of its findings carries edits. */
	readonly fixable: boolean;
	readonly messages: Readonly<Record<Key, Message>>;
	/** Left out by a rule with no options of its own. */
	readonly options?: OptionsDefinition<Options>;
	/**
	 * The check. It reads only the model, the settings and its options, and it never changes the tree. Written as a
	 * method, so a list can hold rules with different options.
	 */
	check(model: Model, context: Context<Options>): readonly Finding<NoInfer<Key>>[];
}

/**
 * A rule, with its message keys read from its `messages` alone: a finding whose key is misspelled doesn't compile.
 * Every rule is written with it.
 */
export function defineRule<Options = Record<never, never>, Key extends string = string>(
	definition: RuleDefinition<Options, Key>,
): RuleDefinition<Options, Key> {
	return definition;
}

export interface Context<Options> {
	readonly settings: Settings;
	readonly options: Options;
}

export interface Finding<Key extends string = string> {
	/** A key of the rule's messages. */
	readonly message: Key;
	/** What the message is called with. */
	readonly args: readonly string[];
	readonly at: Place;
	/** Only where it differs from the rule's own level. */
	readonly severity?: "warning";
	/** The fix, where the rule offers one: every edit applies, or none does. */
	readonly edits?: readonly Edit[];
}

/**
 * Where a finding is: core's position (a rule or an at-rule, and the offsets inside its selector or parameters), a
 * declaration or one side of it, or a whole node.
 */
export type Place =
	| Position
	| { readonly node: Declaration; readonly part?: "property" | "value" }
	| { readonly node: Rule | AtRule | Comment };

/**
 * One change to the tree. `replace` puts `text` where `expects` is written, in a rule's selector or an at-rule's
 * parameters. It names the text it expects, so an edit that another fix has overtaken is left alone.
 */
export interface Edit {
	readonly kind: "replace";
	readonly at: Position;
	readonly expects: string;
	readonly text: string;
}
