// `no-abbreviations` (rule 8): names other people and tools read use full words. It reports the words of a name that
// are on a deny list of known abbreviations, and suggests the full word: in token and component variable names (and
// privates' with `privates: true`), component class names, and the names and values of the `data-*` attributes the
// CSS selects on.
import { type Model, rolePrefixes, type Role } from "@statefulcss/core";
import type { AtRule, Container, Rule } from "postcss";

import { listOf } from "../names.js";
import { isNamePattern, matchesAny, type NamePattern } from "../patterns.js";
import { defineRule, type Finding, type Place } from "../rule.js";
import { abbreviations, fullSize } from "./words.js";

const messages = {
	word: (written: string, suggested: string) =>
		`Unexpected abbreviation "${written}". Write "${suggested}" instead.`,
	one: (abbreviation: string, written: string, suggested: string) =>
		`Unexpected abbreviation "${abbreviation}" in "${written}". Write "${suggested}" instead.`,
	several: (abbreviations: string, written: string, suggested: string) =>
		`Unexpected abbreviations ${abbreviations} in "${written}". Write "${suggested}" instead.`,
};

type Key = keyof typeof messages;

interface Options {
	/** Words allowed in any name: words, `/regex/` strings or expressions, each matched against one word. */
	readonly ignoreWords: readonly NamePattern[];
	/** Whether privates' names (`--_*`) are checked too. */
	readonly privates: boolean;
	/** `short` allows T-shirt sizes (`sm`, `xl`, `2xl`); `full` reports them too. */
	readonly sizes: "short" | "full";
}

/** The roles whose names are checked, by default and with `privates: true`. */
const publicRoles: ReadonlySet<Role> = new Set(["token", "component"]);

export default defineRule<Options, Key>({
	name: "no-abbreviations",
	severity: "warning",
	fixable: false,
	messages,
	options: {
		ignoreWords: { default: [], accepts: isNamePattern },
		privates: { default: false, accepts: (value) => typeof value === "boolean" },
		sizes: { default: "short", accepts: (value) => value === "short" || value === "full" },
	},
	check(model, { settings, options }) {
		const fullOf = (word: string): string | undefined => {
			if (matchesAny(word, options.ignoreWords) || matchesAny(word.toLowerCase(), options.ignoreWords))
				return undefined;
			const lower = word.toLowerCase();
			return abbreviations.get(lower) ?? (options.sizes === "full" ? fullSize(lower) : undefined);
		};
		const checked = (role: Role | undefined): boolean =>
			role !== undefined && (publicRoles.has(role) || (options.privates && role === "private"));
		const findings: Finding<Key>[] = [];
		const report = (written: string, from: number, at: Place): void => {
			const finding = findingOf(written, from, at, fullOf);
			if (finding) findings.push(finding);
		};

		// Variable names, where they're declared or registered: a selector list writes a declaration once.
		const reported = new Set<number>();
		for (const declaration of model.declarations) {
			if (!checked(declaration.role) || reported.has(declaration.written)) continue;
			const kind = model.elements[model.blocks[declaration.block]?.element ?? -1]?.kind;
			if (kind === undefined || kind === "utility" || kind === "foreign") continue;
			reported.add(declaration.written);
			const name = declaration.property;
			if (!unreadable.test(name))
				report(name, prefixLength(name), { node: declaration.node, part: "property" });
		}
		for (const registration of model.registrations) {
			const { name, node } = registration;
			const index = node.params.indexOf(name);
			if (!checked(registration.role) || unreadable.test(name) || index === -1) continue;
			report(name, prefixLength(name), { node, index, endIndex: index + name.length });
		}

		// Component classes and `data-*` attributes, everywhere a selector writes them.
		const classes = new Set(
			model.components.flatMap(({ identity }) => (identity.kind === "class" ? [identity.className] : [])),
		);
		const named = new Set(
			[
				settings.componentAttribute,
				settings.partAttribute,
				settings.slotAttribute,
				settings.themeAttribute,
			].map((name) => name.toLowerCase()),
		);
		for (const { node, text } of selectorsOf(model)) {
			for (const one of writtenIn(text)) {
				const at = { node, index: one.index, endIndex: one.index + one.text.length };
				if (one.kind === "class") {
					if (classes.has(one.text.slice(1))) report(one.text, 1, at);
				} else if (one.kind === "name") {
					const lower = one.text.toLowerCase();
					// An attribute a setting names is the project's choice, written in its config.
					if (lower.startsWith("data-") && !named.has(lower)) report(one.text, "data-".length, at);
				} else if (one.attribute.startsWith("data-") || named.has(one.attribute)) {
					// The platform's attributes (`type`, `aria-*`, `dir`) take the platform's words.
					report(one.text, 0, at);
				}
			}
		}
		return findings;
	},
});

/** A name SCSS, Less or a template builds, which can't be read. */
const unreadable = /[#$@{}\\]/;

/** Where a custom property's own name starts, after its role prefix: `--t-`, `--_`, or `--` for an unprefixed one. */
function prefixLength(name: string): number {
	const prefix = Object.values(rolePrefixes).find((one) => name.startsWith(one));
	return prefix?.length ?? 2;
}

/** The finding for one written name, from `from` on, or undefined when it has no abbreviation. */
function findingOf(
	written: string,
	from: number,
	at: Place,
	fullOf: (word: string) => string | undefined,
): Finding<Key> | undefined {
	const found: string[] = [];
	let suggested = written;
	// From the end, so each replacement leaves the earlier words' offsets as they were.
	for (const word of wordsOf(written).reverse()) {
		if (word.start < from) continue;
		const full = fullOf(word.text);
		if (!full) continue;
		found.unshift(word.text);
		suggested = suggested.slice(0, word.start) + cased(full, word) + suggested.slice(word.end);
	}
	const [first] = found;
	if (first === undefined) return undefined;
	if (found.length === 1 && first === written) return { message: "word", args: [written, suggested], at };
	if (new Set(found).size === 1) return { message: "one", args: [first, written, suggested], at };
	return { message: "several", args: [listOf(found.map((word) => `"${word}"`)), written, suggested], at };
}

interface Word {
	readonly text: string;
	readonly start: number;
	readonly end: number;
	/** Part of a camel-case run: `Itm` in `NavItm`. */
	readonly camel: boolean;
}

/**
 * A name's words: its runs of letters and digits, each split where camel case starts a new word (`NavItm` is `Nav`
 * and `Itm`). Digits stay with their letters, so `h1` and `2xl` are one word each.
 */
function wordsOf(name: string): Word[] {
	const words: Word[] = [];
	for (const run of name.matchAll(/[\p{L}\p{N}]+/gu)) {
		const parts = run[0].split(/(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u);
		let start = run.index;
		for (const text of parts) {
			words.push({ text, start, end: start + text.length, camel: parts.length > 1 });
			start += text.length;
		}
	}
	return words;
}

/** The full word written the way the abbreviation is: `BTN` as `BUTTON`, `Itm` as `Item`, `Xl` in camel case as `XLarge`. */
function cased(full: string, word: Word): string {
	const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
	const { text } = word;
	if (text.length > 1 && text === text.toUpperCase() && text !== text.toLowerCase())
		return full.toUpperCase();
	const parts = full.split("-");
	const joined = word.camel
		? parts.map((part, index) => (index === 0 ? part : capital(part))).join("")
		: full;
	return text.charAt(0) === text.charAt(0).toUpperCase() && text.charAt(0) !== text.charAt(0).toLowerCase()
		? capital(joined)
		: joined;
}

/**
 * Every rule whose selector a block comes from, with the rules around it, and every scope's prelude, each once. A
 * rule a utility's block comes from is left out: utilities are where short names earn their place.
 */
function selectorsOf(model: Model): { node: Rule | AtRule; text: string }[] {
	const rules = new Set<Rule>();
	const utilities = new Set<Rule>();
	for (const block of model.blocks) {
		const utility = model.elements[block.element]?.kind === "utility";
		for (let node: Container | undefined = block.node; node; node = node.parent as Container | undefined) {
			if (node.type !== "rule") continue;
			(utility ? utilities : rules).add(node as Rule);
		}
	}
	return [
		...[...rules].filter((rule) => !utilities.has(rule)).map((node) => ({ node, text: node.selector })),
		...model.scopes.map(({ node }) => ({ node, text: node.params })),
	];
}

/** A class, or an attribute's name or value, as written in a selector, at its offset there. */
type Written =
	| { readonly kind: "class"; readonly text: string; readonly index: number }
	| { readonly kind: "name"; readonly text: string; readonly index: number }
	| { readonly kind: "value"; readonly text: string; readonly index: number; readonly attribute: string };

/** What another component's styles select, in Vue's and CSS Modules' forms; with no bracket, the rest of the selector. */
const foreignFunction = /^::?(?:deep|global|slotted|v-deep|v-global|v-slotted)(?![\w-])/i;

/**
 * The classes and attributes a selector writes, outside strings and outside what `:deep()`, `:global()` or
 * `:slotted()` select. A name with an escape or interpolation is left out, since it can't be read as written.
 */
function writtenIn(text: string): Written[] {
	const found: Written[] = [];
	let index = 0;
	while (index < text.length) {
		const character = text.charAt(index);
		if (character === "\\") {
			index += 2;
		} else if (character === '"' || character === "'") {
			index = endOfString(text, index);
		} else if (character === ":" && foreignFunction.test(text.slice(index))) {
			const after = index + (foreignFunction.exec(text.slice(index))?.[0].length ?? 1);
			index = text.charAt(after) === "(" ? closing(text, after) + 1 : nextBranch(text, after);
		} else if (text.startsWith(">>>", index) || text.toLowerCase().startsWith("/deep/", index)) {
			index = nextBranch(text, index);
		} else if (character === "[") {
			const end = closing(text, index);
			found.push(...attributeIn(text.slice(index + 1, end), index + 1));
			index = end + 1;
		} else if (character === ".") {
			const name = /^-?[_\p{L}][\w\p{L}-]*/u.exec(text.slice(index + 1))?.[0];
			if (name && text.charAt(index + 1 + name.length) !== "\\")
				found.push({ kind: "class", text: `.${name}`, index });
			index += 1 + (name?.length ?? 0);
		} else {
			index += 1;
		}
	}
	return found;
}

/** An attribute selector's name and value, from the text inside its brackets. */
function attributeIn(inner: string, offset: number): Written[] {
	const match =
		/^(\s*)([\w-]+)\s*(?:[~|^$*]?=\s*(?:"([^"\\]*)"|'([^'\\]*)'|([^\s"'\\]+)))?(?:\s+[is])?\s*$/di.exec(
			inner,
		);
	const nameAt = match?.indices?.[2];
	if (!match?.[2] || !nameAt) return [];
	const attribute = match[2].toLowerCase();
	const found: Written[] = [{ kind: "name", text: match[2], index: offset + nameAt[0] }];
	const group = [3, 4, 5].find((one) => match[one] !== undefined);
	const value = group === undefined ? undefined : match[group];
	const valueAt = group === undefined ? undefined : match.indices?.[group];
	if (value && valueAt && !unreadable.test(value))
		found.push({ kind: "value", text: value, index: offset + valueAt[0], attribute });
	return found;
}

/** The offset just after a string that opens at `start`. */
function endOfString(text: string, start: number): number {
	const quote = text.charAt(start);
	let index = start + 1;
	while (index < text.length && text.charAt(index) !== quote) index += text.charAt(index) === "\\" ? 2 : 1;
	return index + 1;
}

/** The offset of the bracket that closes the one at `start`, or the end of the text. */
function closing(text: string, start: number): number {
	const open = text.charAt(start);
	const close = open === "[" ? "]" : ")";
	let depth = 0;
	let index = start;
	while (index < text.length) {
		const character = text.charAt(index);
		if (character === "\\") {
			index += 2;
			continue;
		}
		if (character === '"' || character === "'") {
			index = endOfString(text, index);
			continue;
		}
		if (character === open) depth += 1;
		else if (character === close && --depth === 0) return index;
		index += 1;
	}
	return text.length;
}

/** The offset of the next selector in a list, after `start`, or the end of the text. */
function nextBranch(text: string, start: number): number {
	let index = start;
	while (index < text.length) {
		const character = text.charAt(index);
		if (character === "\\") index += 2;
		else if (character === '"' || character === "'") index = endOfString(text, index);
		else if (character === "(" || character === "[") index = closing(text, index) + 1;
		else if (character === ",") return index;
		else index += 1;
	}
	return text.length;
}
