// `variable-role-prefix` (rule 1): every custom property a stylesheet declares or registers starts with one of the six
// role prefixes and a name, unless it's a library's variable the component's doc comment lists in `@sets`.
import { type Declaration, type Element, type Model, rolePrefixes } from "@statefulcss/core";

import { isNamePattern, matchesAny, type NamePattern } from "../patterns.js";
import { defineRule, type Finding } from "../rule.js";

const messages = {
	state: (name: string, suggested: string) =>
		`Unexpected "${name}" with no role prefix. A variant or state changes it, so it's a state variable: name it "${suggested}".`,
	query: (name: string, suggested: string) =>
		`Unexpected "${name}" with no role prefix. A style query reads it, so it's a query variable: name it "${suggested}".`,
	token: (name: string, suggested: string) =>
		`Unexpected "${name}" with no role prefix. A theme declares it, so it's a token: name it "${suggested}".`,
	page: (name: string, suggested: string) =>
		`Unexpected "${name}" with no role prefix. Declared for the whole page, it's a token: name it "${suggested}".`,
	component: (name: string, suggested: string) =>
		`Unexpected "${name}" with no role prefix. A component reads it and it's set from outside, so it's a component variable: name it "${suggested}".`,
	private: (name: string, suggested: string) =>
		`Unexpected "${name}" with no role prefix. Name it "${suggested}", a private, if it's used only where it's declared.`,
	library: (name: string, suggested: string) =>
		`Unexpected "${name}" with no role prefix. Name it "${suggested}", a private, or list it in the component's "@sets" if a library reads it.`,
	readsOnly: (name: string) =>
		`Unexpected "${name}" written, but the component's doc comment lists it only in "@reads". List it in "@sets" to write it.`,
	noName: (name: string) =>
		`Unexpected "${name}" with no name after its prefix. Add a name that says what it holds.`,
	registered: (name: string) =>
		`Unexpected "${name}" registered with no role prefix. Name it with the prefix of its role: "--t-", "--c-", "--s-", "--p-", "--_" or "--q-".`,
};

type Key = keyof typeof messages;

interface Options {
	/** Names allowed everywhere, such as a library's used in many files: names, `/regex/` strings or expressions. */
	readonly ignoreProperties: readonly NamePattern[];
}

/** The role a name's use suggests, as the key of its message. */
type Suggestion = "state" | "query" | "token" | "page" | "component" | "private";

const prefixOf: Readonly<Record<Suggestion, string>> = {
	state: rolePrefixes.state,
	query: rolePrefixes.query,
	token: rolePrefixes.token,
	page: rolePrefixes.token,
	component: rolePrefixes.component,
	private: rolePrefixes.private,
};

export default defineRule<Options, Key>({
	name: "variable-role-prefix",
	severity: "error",
	fixable: false,
	messages,
	options: {
		ignoreProperties: { default: [], accepts: isNamePattern },
	},
	check(model, { options }) {
		const ignored = (name: string): boolean => matchesAny(name, options.ignoreProperties);
		const suggestions = new Map<string, Suggestion>();
		const suggestionFor = (name: string): Suggestion => {
			const known = suggestions.get(name);
			if (known) return known;
			const suggestion = suggest(model, name);
			suggestions.set(name, suggestion);
			return suggestion;
		};
		const findings: Finding<Key>[] = [];

		// A selector list writes a declaration once: its branches are judged together, and it's reported once.
		const branches = new Map<number, Declaration[]>();
		for (const declaration of model.declarations) {
			if (declaration.role === undefined || ignored(declaration.property)) continue;
			const element = elementOf(model, declaration);
			if (!element || skipped(element)) continue;
			branches.set(declaration.written, [...(branches.get(declaration.written) ?? []), declaration]);
		}
		for (const written of branches.values()) {
			const [first] = written;
			if (!first) continue;
			const name = first.property;
			const at = { node: first.node, part: "property" } as const;
			if (hasNoName(name)) {
				findings.push({ message: "noName", args: [name], at });
				continue;
			}
			// One branch with no role is enough. A branch in a component may be a library's variable.
			const unnamed = written.filter((declaration) => declaration.role === "none");
			if (unnamed.length > 0) {
				const suggestion = suggestionFor(name);
				const inComponent = unnamed.some(
					(declaration) => componentOf(elementOf(model, declaration)) !== undefined,
				);
				const message = suggestion === "private" && inComponent ? "library" : suggestion;
				findings.push({ message, args: [name, suggested(name, suggestion)], at });
				continue;
			}
			// A library's variable is written only when its component's doc comment lists it in `@sets`.
			const unset = written.some(
				(declaration) =>
					declaration.role === "library" && !setsOf(model, elementOf(model, declaration)).has(name),
			);
			if (unset) findings.push({ message: "readsOnly", args: [name], at });
		}

		// `@property` registers a name for the whole page: no doc comment makes a library's name one to register.
		for (const registration of model.registrations) {
			const { name, node } = registration;
			if (ignored(name)) continue;
			const index = node.params.indexOf(name);
			if (index === -1) continue;
			const at = { node, index, endIndex: index + name.length };
			if (hasNoName(name)) {
				findings.push({ message: "noName", args: [name], at });
			} else if (registration.role === "none") {
				const declared = model.declarations.some((declaration) => declaration.property === name);
				const suggestion = declared ? suggestionFor(name) : undefined;
				findings.push(
					suggestion
						? { message: suggestion, args: [name, suggested(name, suggestion)], at }
						: { message: "registered", args: [name], at },
				);
			}
		}
		return findings;
	},
});

/**
 * The role a name's use in this file suggests: queried with `@container style()`, a query variable; changed by a
 * variant or state, a state variable; declared in a theme, or on `:root` or `html`, a token; read by a component and
 * set outside it, a component variable; otherwise a private. What `:root` changes in a query (a dark color scheme)
 * stays a token.
 */
function suggest(model: Model, name: string): Suggestion {
	if (model.reads.some((read) => read.name === name && read.via === "style-query")) return "query";
	const writers = model.declarations
		.filter((declaration) => declaration.property === name)
		.flatMap((declaration) => elementOf(model, declaration) ?? [])
		.filter((element) => !skipped(element));
	const changed = model.variables.some((variable) => {
		const element = model.elements[variable.element];
		return (
			variable.name === name &&
			variable.changes.length > 0 &&
			element !== undefined &&
			!skipped(element) &&
			!isPage(element)
		);
	});
	if (changed) return "state";
	if (writers.some((element) => element.kind === "global" && element.themeScope !== undefined))
		return "token";
	if (writers.some(isPage)) return "page";
	const outside = model.reads.some((read) => {
		if (read.name !== name || read.via !== "var") return false;
		const reader = componentOf(model.elements[read.element]);
		return reader !== undefined && writers.some((writer) => componentOf(writer) !== reader);
	});
	return outside ? "component" : "private";
}

/** The name with the suggested role's prefix: `--opacity` as a state variable is `--s-opacity`. */
function suggested(name: string, suggestion: Suggestion): string {
	return `${prefixOf[suggestion]}${name.slice(2)}`;
}

/** A role prefix with nothing after it (`--t-`, `--_`), or `--` alone. */
function hasNoName(name: string): boolean {
	return name === "--" || Object.values(rolePrefixes).some((prefix) => name === prefix);
}

/** The names a component's doc comments list in `@sets`. */
function setsOf(model: Model, element: Element | undefined): ReadonlySet<string> {
	const component = componentOf(element);
	return new Set(
		model.docComments.filter((comment) => comment.component === component).flatMap((comment) => comment.sets),
	);
}

function elementOf(model: Model, declaration: Declaration): Element | undefined {
	const block = model.blocks[declaration.block];
	return block ? model.elements[block.element] : undefined;
}

function componentOf(element: Element | undefined): number | undefined {
	return element && "component" in element ? element.component : undefined;
}

/** What `:deep()` or `:global()` selects is a third party's element, whose names are the library's. */
function skipped(element: Element): boolean {
	return element.kind === "foreign";
}

/** `:root` or `html`: what it declares is for the whole page. */
function isPage(element: Element): boolean {
	if (element.kind !== "global") return false;
	const selector = element.selector.toLowerCase();
	return selector === ":root" || selector === "html";
}
