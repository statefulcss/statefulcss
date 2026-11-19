// The config check: the rules a project switches on, against what the rules need of each other. It reads which rules
// are on, not a stylesheet, so another tool can run the same check without linting a file.
import type { Message } from "../rule.js";

/** Whether the config switches a rule on, by its name as a Stylelint config writes it: `statefulcss/bind-once`. */
export type IsOn = (ruleName: string) => boolean;

export interface ConfigFinding<Key extends string = string> {
	/** A key of the rule's messages. */
	readonly message: Key;
	/** What the message is called with. */
	readonly args: readonly string[];
}

/** A rule over the config, not the stylesheet. Its findings are about the whole run, so they have no place. */
export interface ConfigRuleDefinition<Key extends string = string> {
	/** Without the namespace. */
	readonly name: string;
	readonly severity: "warning";
	readonly fixable: false;
	readonly messages: Readonly<Record<Key, Message>>;
	check(isOn: IsOn): readonly ConfigFinding<NoInfer<Key>>[];
}

function defineConfigRule<Key extends string>(
	definition: ConfigRuleDefinition<Key>,
): ConfigRuleDefinition<Key> {
	return definition;
}

const bindOnce = "statefulcss/bind-once";
const bindThrough = "statefulcss/bind-through-state-variables";
const duplicateCustomProperties = "declaration-block-no-duplicate-custom-properties";

/** Stylelint's rules the methodology contradicts, each with the reason both configs switch it off. */
const contradicted: Readonly<Record<string, string>> = {
	"no-descending-specificity": "it reports state blocks written in the methodology's order",
	"no-duplicate-selectors":
		"it reports a second guard around interaction states, which the order of states needs",
};

export default defineConfigRule({
	name: "config-check",
	severity: "warning",
	fixable: false,
	messages: {
		bindThroughOff: (on, off) =>
			`Unexpected "${on}" without "${off}": a state that changes a property through a private goes unreported. ` +
			`Turn "${off}" on.`,
		duplicatesUnreported: (ours, theirs) =>
			`Unexpected "${ours}" and "${theirs}" both off: a repeated custom property goes unreported. ` +
			`Turn "${ours}" on.`,
		contradicted: (rule, reason) =>
			`Unexpected "${rule}": ${reason}. Turn it off, as "recommended" and "compatible" do.`,
	},
	check(isOn) {
		const findings: ConfigFinding<"bindThroughOff" | "duplicatesUnreported" | "contradicted">[] = [];
		// The two keep one promise together: a state changes a property only through a state variable.
		if (isOn(bindOnce) && !isOn(bindThrough)) {
			findings.push({ message: "bindThroughOff", args: [bindOnce, bindThrough] });
		}
		// `bind-once` reports a repeated custom property, which is why both configs switch Stylelint's own rule off.
		if (!isOn(bindOnce) && !isOn(duplicateCustomProperties)) {
			findings.push({ message: "duplicatesUnreported", args: [bindOnce, duplicateCustomProperties] });
		}
		for (const [rule, reason] of Object.entries(contradicted)) {
			if (isOn(rule)) findings.push({ message: "contradicted", args: [rule, reason] });
		}
		return findings;
	},
});
