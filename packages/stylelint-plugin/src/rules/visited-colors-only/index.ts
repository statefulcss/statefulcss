// `visited-colors-only` (rule 5): a `:visited` block declares only what `:visited` can apply. Browsers apply a few
// color properties there, so a page can't find out which links someone has visited, and silently ignore the rest,
// custom properties included.
import type { Block, Condition, Declaration, Id, Model } from "@statefulcss/core";

import { listOf } from "../names.js";
import { defineRule, type Finding } from "../rule.js";

/** What `:visited` applies, as the messages say it. */
const accepted =
	'"color", "background-color", "fill", "stroke" and the border, outline, column-rule, text-decoration and text-emphasis colors';

const messages = {
	ignored: (property: string, place: string) =>
		`Unexpected "${property}" in ${place}, where the browser ignores it. ":visited" applies only ${accepted}.`,
	shorthand: (property: string, place: string, longhand: string) =>
		`Unexpected "${property}" in ${place}, where only its color applies and the rest is ignored. Write "${longhand}" for the color, and set anything else outside ":visited".`,
	customProperty: (name: string, place: string, property: string) =>
		`Unexpected "${name}" set in ${place}, where the browser ignores custom properties. Set "${property}" directly instead.`,
	customPropertyOther: (name: string, place: string) =>
		`Unexpected "${name}" set in ${place}, where the browser ignores custom properties. Set the color property directly instead: ":visited" applies only ${accepted}.`,
};

type Key = keyof typeof messages;

/**
 * The properties `:visited` applies, from MDN's list: the color properties, with every border color's longhand and
 * logical form, and `fill` and `stroke`. `caret-color` and WebKit's text fill and stroke colors are kept too, since
 * Chromium applies them, so they're never reported as ignored.
 */
const applied = new Set([
	"color",
	"background-color",
	"border-color",
	"border-top-color",
	"border-right-color",
	"border-bottom-color",
	"border-left-color",
	"border-block-color",
	"border-block-start-color",
	"border-block-end-color",
	"border-inline-color",
	"border-inline-start-color",
	"border-inline-end-color",
	"outline-color",
	"column-rule-color",
	"text-decoration-color",
	"text-emphasis-color",
	"caret-color",
	"fill",
	"stroke",
	"-webkit-text-fill-color",
	"-webkit-text-stroke-color",
]);

/** Shorthands whose color part `:visited` applies, with that color's longhand. */
const shorthands = new Map([
	["background", "background-color"],
	["border", "border-color"],
	["border-top", "border-top-color"],
	["border-right", "border-right-color"],
	["border-bottom", "border-bottom-color"],
	["border-left", "border-left-color"],
	["border-block", "border-block-color"],
	["border-block-start", "border-block-start-color"],
	["border-block-end", "border-block-end-color"],
	["border-inline", "border-inline-color"],
	["border-inline-start", "border-inline-start-color"],
	["border-inline-end", "border-inline-end-color"],
	["outline", "outline-color"],
	["column-rule", "column-rule-color"],
	["text-decoration", "text-decoration-color"],
	["text-emphasis", "text-emphasis-color"],
	["-webkit-text-stroke", "-webkit-text-stroke-color"],
]);

/**
 * The color properties a state or part variable's name can end with, longest first: `--s-border-color` is
 * `border-color`. Those variables are named for the property they set; another custom property's name isn't.
 */
const namedProperties = [...applied]
	.filter((property) => !property.startsWith("-"))
	.sort((a, b) => b.length - a.length);

/** What a finding says before a selector list's branches are joined. */
interface Said {
	readonly message: Key;
	readonly args: readonly string[];
	readonly at: Finding<Key>["at"];
}

export default defineRule<Record<never, never>, Key>({
	name: "visited-colors-only",
	severity: "error",
	fixable: false,
	messages,
	check(model) {
		// Each written declaration, with the blocks it's in: a selector list is one written declaration in several.
		const written = new Map<Id, { declaration: Declaration; block: Block }[]>();
		for (const declaration of model.declarations) {
			const block = model.blocks[declaration.block];
			if (!block) continue;
			const one = written.get(declaration.written);
			if (one) one.push({ declaration, block });
			else written.set(declaration.written, [{ declaration, block }]);
		}

		const findings: Finding<Key>[] = [];
		for (const branches of written.values()) {
			// Reported only when every branch applies on `:visited` alone: `.link:visited, .link:hover` still applies on
			// hover, as `:is(:visited, :hover)` does.
			if (!branches.every(({ block }) => block.conditions.some(visited))) continue;
			const said = branches.flatMap(({ declaration, block }) => sayOf(model, declaration, block) ?? []);
			const [first] = said;
			if (!first) continue;
			const args = first.args.map((_, index) => listOf(said.map((one) => one.args[index] ?? "")));
			findings.push({ message: first.message, args, at: first.at });
		}
		return findings;
	},
});

/** What to say about one declaration in a `:visited` block, or nothing when `:visited` applies it. */
function sayOf(model: Model, declaration: Declaration, block: Block): Said | undefined {
	const { property } = declaration;
	// A property SCSS builds (`#{$side}-color`) can't be judged.
	if (property.includes("#{") || property.includes("@{") || property.includes("$")) return undefined;
	const place = `"${block.conditions.map((condition) => condition.text).join("")}"`;
	const at = { node: declaration.node, part: "property" } as const;
	if (property.startsWith("--")) {
		const named = boundTo(model, property, block.element) ?? namedFor(declaration);
		return named
			? { message: "customProperty", args: [property, place, named], at }
			: { message: "customPropertyOther", args: [property, place], at };
	}
	const unprefixed = property.replace(/^-(?:webkit|moz)-/, "");
	if (applied.has(property) || applied.has(unprefixed)) return undefined;
	const longhand = shorthands.get(property) ?? shorthands.get(unprefixed);
	if (longhand) return { message: "shorthand", args: [property, place, longhand], at };
	return { message: "ignored", args: [property, place], at };
}

/**
 * The property `:visited` applies that a custom property is bound to: the one color property the file's `var()` reads
 * of it set, on its element, else anywhere. A shorthand binds its color longhand. Undefined when no read, or more than
 * one property, says.
 */
function boundTo(model: Model, name: string, element: Id): string | undefined {
	const properties = (reads: readonly Model["reads"][number][]): Set<string> =>
		new Set(
			reads.flatMap((read) => {
				const reader = read.declaration === undefined ? undefined : model.declarations[read.declaration];
				if (!reader || reader.property.startsWith("--")) return [];
				const unprefixed = reader.property.replace(/^-(?:webkit|moz)-/, "");
				if (applied.has(reader.property)) return [reader.property];
				if (applied.has(unprefixed)) return [unprefixed];
				const longhand = shorthands.get(reader.property) ?? shorthands.get(unprefixed);
				return longhand ? [longhand] : [];
			}),
		);
	const all = model.reads.filter((read) => read.via === "var" && read.name === name);
	for (const reads of [all.filter((read) => read.element === element), all]) {
		const found = properties(reads);
		if (found.size > 0) return found.size === 1 ? [...found][0] : undefined;
	}
	return undefined;
}

/** The color property a state or part variable is named for: `--s-color`, `--p-after-border-color`. */
function namedFor(declaration: Declaration): string | undefined {
	if (declaration.role !== "state" && declaration.role !== "part") return undefined;
	const name = declaration.property.toLowerCase();
	return namedProperties.find((one) => name.endsWith(`-${one}`));
}

/**
 * Whether a block needs `:visited` to apply, through this condition: `:visited` itself, a compound holding it
 * (`:visited:hover` in a list), or a list (`:is()`, `:where()`) whose every selector needs it. `:not(:visited)`
 * matches every link that isn't visited, and `:has()` never matches `:visited`, so neither counts.
 */
function visited(condition: Condition): boolean {
	const text = condition.text.toLowerCase();
	if (text.startsWith(":not(") || text.startsWith(":has(") || condition.has) return false;
	if (condition.inner.length === 0) return condition.group === "visited" && text === ":visited";
	if (condition.compound) return condition.inner.some(visited);
	return condition.inner.every(visited);
}
