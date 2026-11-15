// Turns a rule definition into a Stylelint plugin. This file and its neighbours are the only ones that know
// Stylelint: they load the settings and the model, check the options, and report what the rule's check returns.
import { defaults } from "@statefulcss/config";
import stylelint from "stylelint";

import type { Finding, Message, RuleDefinition } from "../rules/rule.js";
import { apply, canApply, overlap } from "./edits.js";
import { liveOf, load } from "./load.js";
import { type Span, spanOf } from "./positions.js";

const { createPlugin, utils } = stylelint;

/** What every rule's name starts with: `statefulcss/bind-once`. */
export const namespace = "statefulcss";

const issuesUrl = "https://github.com/statefulcss/statefulcss/issues";

/** A rule's name as a Stylelint config writes it. */
export function ruleNameOf(definition: Pick<RuleDefinition, "name">): string {
	return `${namespace}/${definition.name}`;
}

/** A rule's page and whether it can fix, for Stylelint and for tools that list the rules. */
export function metaOf(definition: Pick<RuleDefinition, "name" | "fixable">): stylelint.RuleMeta {
	return { url: `https://statefulcss.com/docs/lint-rules/${definition.name}`, fixable: definition.fixable };
}

/** The one message the glue has of its own: a fault of the plugin's, never of the stylesheet's. */
const uncheckable = (detail: string): string =>
	`The Stateful CSS plugin couldn't check this file: ${detail}. Please open an issue at ${issuesUrl}`;

// Each of these is said once for a file, however many rules or `<style>` blocks meet it.
const configErrors = new WeakSet<object>();
const faults = new WeakSet<object>();

export interface PluginOptions {
	/** Throw a fault of the plugin's own instead of reporting it. For tests. */
	readonly failLoudly?: boolean;
}

export function toPlugin(
	definition: RuleDefinition,
	{ failLoudly = false }: PluginOptions = {},
): stylelint.Plugin {
	const ruleName = ruleNameOf(definition);
	const own: Readonly<Record<string, Message>> = definition.messages;
	const messages = utils.ruleMessages(ruleName, { ...own, uncheckable });
	const messageOf = (key: string): Message | undefined =>
		(messages as Readonly<Record<string, Message>>)[key];
	// A rule's check runs once for a file. A `.vue` file's `<style>` blocks share it, and each reports its own part.
	const checked = new WeakMap<object, readonly Reportable[]>();

	const rule: stylelint.Rule = (primary: unknown, secondary: unknown) => async (root, result) => {
		if (!validOptions(result, definition, primary, secondary)) return;

		const fault = (error: unknown): void => {
			if (failLoudly) throw error;
			if (faults.has(result)) return;
			faults.add(result);
			utils.report({
				ruleName,
				result,
				node: root,
				index: 0,
				endIndex: 1,
				message: messages.uncheckable,
				messageArgs: [error instanceof Error ? error.message : String(error)],
				severity: "warning",
			});
		};

		const config = result.stylelint.config;
		const loaded = await load(result);
		if ("error" in loaded) {
			// The rules don't run on settings they can't trust, and the run fails as for a bad Stylelint option.
			if (configErrors.has(result)) return;
			configErrors.add(result);
			result.warn(loaded.error.message, { stylelintType: "invalidOption" });
			result.stylelint.stylelintError = true;
			return;
		}
		if ("fault" in loaded) return fault(loaded.fault);

		const { model, settings } = loaded;
		let reportable = checked.get(result);
		if (!reportable) {
			try {
				// A fault core recorded for the whole file: nothing in it was read.
				const whole = model.unknowns.find((one) => one.reason === "internal" && one.node === model.root);
				if (whole) throw new Error(whole.detail ?? "the stylesheet couldn't be read");
				const options = optionsFrom(definition, secondary);
				reportable = prepare(definition.check(model, { settings, options }));
			} catch (error) {
				reportable = [];
				fault(error);
			}
			checked.set(result, reportable);
		}

		for (const { finding, span } of reportable) {
			if (liveOf(span.node.root()) !== root) continue;
			// A finding the rule can't word is a fault of the rule's, like a check that throws.
			const message = messageOf(finding.message);
			try {
				if (!message) throw new Error(`"${ruleName}" has no message "${finding.message}"`);
				message(...finding.args);
				if (finding.edits && overlap(finding.edits))
					throw new Error(`a fix of "${ruleName}" has edits that overlap`);
			} catch (error) {
				fault(error);
				if (!message) continue;
			}
			// A fix another fix has overtaken is left for the next run, and its problem is reported as usual. So is a
			// single-problem fix in a `.vue` file: Stylelint 18 cuts it out of the wrong text there. `--fix` is right.
			const forEditor = config?.computeEditInfo === true && config.fix !== true;
			const withheld = forEditor && result.root.type === "document";
			const edits =
				finding.edits?.length && !withheld && !overlap(finding.edits) && canApply(finding.edits)
					? finding.edits
					: undefined;
			utils.report({
				ruleName,
				result,
				node: span.node,
				...(span.index === undefined || span.endIndex === undefined
					? {}
					: { index: span.index, endIndex: span.endIndex }),
				message: safely(message),
				messageArgs: [...finding.args],
				...(finding.severity ? { severity: finding.severity } : {}),
				...(edits
					? { fix: { apply: () => apply(edits), node: liveOf(edits[0]?.at.node ?? span.node) ?? root } }
					: {}),
			});
		}
	};

	rule.ruleName = ruleName;
	rule.messages = messages;
	rule.meta = metaOf(definition);
	return createPlugin(ruleName, rule);
}

/** A message that says so, where its own function throws: the fault is reported once, and the finding still is. */
function safely(message: Message): Message {
	return (...args) => {
		try {
			return message(...args);
		} catch {
			return "A problem this rule couldn't describe";
		}
	};
}

interface Reportable {
	readonly finding: Finding;
	readonly span: Span;
}

/**
 * A check's findings as Stylelint will report them: each with its place in the file as it was read, in the file's
 * order, and each said once.
 */
function prepare(findings: readonly Finding[]): readonly Reportable[] {
	const seen = new Set<string>();
	const reportable: (Reportable & { readonly offset: number })[] = [];
	for (const finding of findings) {
		const span = spanOf(finding.at);
		const offset = (span.node.source?.start?.offset ?? 0) + (span.index ?? 0);
		const key = [offset, span.endIndex ?? "", finding.message, ...finding.args].join("\n");
		if (seen.has(key)) continue;
		seen.add(key);
		reportable.push({ finding, span, offset });
	}
	return reportable.sort((a, b) => a.offset - b.offset);
}

/** The secondary options Stylelint itself gives every rule. */
const stylelintOptions = new Set(["severity", "message", "url", "reportDisables", "disableFix"]);

/** The settings a project writes in `statefulcss.config`, which no rule takes as an option. */
const settingNames = new Set(Object.keys(defaults));

function validOptions(
	result: stylelint.PostcssResult,
	definition: RuleDefinition,
	primary: unknown,
	secondary: unknown,
): boolean {
	const ruleName = ruleNameOf(definition);
	const names = isRecord(secondary) ? Object.keys(secondary) : [];
	const settings = names.filter((name) => settingNames.has(name));
	for (const name of settings) {
		result.warn(
			`"${name}" is a project setting, not an option of "${ruleName}". Set it in statefulcss.config.json instead`,
			{ stylelintType: "invalidOption" },
		);
		result.stylelint.stylelintError = true;
	}
	if (settings.length > 0) return false;

	const own: Record<string, ((value: unknown) => boolean)[]> = {};
	for (const [name, option] of Object.entries(definition.options ?? {})) {
		own[name] = [(option as { accepts: (value: unknown) => boolean }).accepts];
	}
	// Stylelint refuses to check secondary options against a rule that has none, so that case is checked here.
	if (Object.keys(own).length === 0) {
		const unknown = names.filter((name) => !stylelintOptions.has(name));
		for (const name of unknown) {
			result.warn(`Invalid option name "${name}" for rule "${ruleName}"`, { stylelintType: "invalidOption" });
			result.stylelint.stylelintError = true;
		}
		return (
			unknown.length === 0 && utils.validateOptions(result, ruleName, { actual: primary, possible: [true] })
		);
	}
	return utils.validateOptions(
		result,
		ruleName,
		{ actual: primary, possible: [true] },
		{ actual: secondary, possible: own, optional: true },
	);
}

/** A rule's own options: what the Stylelint config gives, and the default for the rest. */
function optionsFrom(definition: RuleDefinition, secondary: unknown): Record<never, never> {
	const given = isRecord(secondary) ? secondary : {};
	const options: Record<string, unknown> = {};
	for (const [name, option] of Object.entries(definition.options ?? {})) {
		options[name] = given[name] ?? (option as { default: unknown }).default;
	}
	return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
