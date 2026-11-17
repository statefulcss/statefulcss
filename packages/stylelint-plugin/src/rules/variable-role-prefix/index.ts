// `variable-role-prefix` (rule 1): every custom property a stylesheet declares or registers starts with one of the six
// role prefixes and a name, unless it's a library's variable the component's doc comment lists in `@sets`.
import {
	type Declaration,
	type Element,
	type Model,
	type Read,
	rolePrefixes,
	type Variable,
} from "@statefulcss/core";

import { ownershipOf } from "../ownership.js";
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
		const uses = usesOf(model);
		const findings: Finding<Key>[] = [];

		// A selector list writes a declaration once: its branches are judged together, and it's reported once.
		const branches = new Map<number, Declaration[]>();
		for (const declaration of model.declarations) {
			if (declaration.role === undefined || ignored(declaration.property)) continue;
			const element = elementOf(model, declaration);
			if (!element || skipped(element)) continue;
			const written = branches.get(declaration.written);
			if (written) written.push(declaration);
			else branches.set(declaration.written, [declaration]);
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
				const suggestion = strongest(unnamed.map((declaration) => uses.suggest(declaration)));
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

		// `@property` registers a name for the whole page: no doc comment makes a library's name one to register. A
		// name with SCSS or Less interpolation can't be read, as with a declaration's.
		for (const registration of model.registrations) {
			const { name, node } = registration;
			if (ignored(name) || unreadable.test(name)) continue;
			const index = node.params.indexOf(name);
			if (index === -1) continue;
			const at = { node, index, endIndex: index + name.length };
			if (hasNoName(name)) {
				findings.push({ message: "noName", args: [name], at });
			} else if (registration.role === "none") {
				const declared = uses.declarations(name);
				const suggestion =
					declared.length > 0
						? strongest(declared.map((declaration) => uses.suggest(declaration)))
						: undefined;
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

/** Interpolation in a name: SCSS's `#{}`, Less's `@{}`, a template's `${}` or `{{ }}`. */
const unreadable = /#\{|@\{|\$\{|\{\{/;

/** The suggestions in the order they win: a selector list's branches, or a registered name's declarations. */
const order: readonly Suggestion[] = ["query", "state", "token", "page", "component", "private"];

function strongest(suggestions: readonly Suggestion[]): Suggestion {
	return order.find((one) => suggestions.includes(one)) ?? "private";
}

interface Uses {
	/** The role one declaration's own use suggests. */
	suggest(declaration: Declaration): Suggestion;
	/** The declarations of a name on elements the rule checks. */
	declarations(name: string): readonly Declaration[];
}

/**
 * What the file says about each name, gathered in one pass, and the role a declaration's own use suggests from it:
 * queried with `@container style()`, a query variable; changed by a variant or state of its own element, or by one
 * that takes its default from outside, a state variable; declared in a theme, a token; declared on the document
 * element, in any form, a token for the whole page; read by a component that doesn't declare it, and written outside
 * that component, a component variable; otherwise a private. What the document element changes in a query (a dark
 * color scheme) stays a token.
 */
function usesOf(model: Model): Uses {
	const ownership = ownershipOf(model);
	const queried = new Set<string>();
	/** Reads with `var()` that reach no variable in their component. */
	const fromOutside = new Map<string, Read[]>();
	/** Variables a variant or state changes with no default of their own: their default comes from outside. */
	const changedFromOutside = new Map<string, Variable[]>();
	const declarations = new Map<string, Declaration[]>();
	/** Written on the document element, in any form (`html.dark` is read as a component's root). */
	const onPage = (declaration: Declaration): boolean =>
		isPage(model.blocks[declaration.block]?.selector ?? "");
	/** A variant or state changes it, but not the document element in a query (a dark color scheme). */
	const changes = (variable: Variable): boolean =>
		variable.changes.some((id) => {
			const change = model.declarations[id];
			return change !== undefined && !onPage(change);
		});
	const push = <Value>(map: Map<string, Value[]>, name: string, value: Value): void => {
		const list = map.get(name);
		if (list) list.push(value);
		else map.set(name, [value]);
	};

	for (const read of model.reads) {
		if (read.via === "style-query") queried.add(read.name);
		else if (read.source === undefined) push(fromOutside, read.name, read);
	}
	for (const variable of model.variables) {
		const element = model.elements[variable.element];
		if (!element || skipped(element)) continue;
		if (variable.default === undefined && changes(variable))
			push(changedFromOutside, variable.name, variable);
	}
	for (const declaration of model.declarations) {
		const element = elementOf(model, declaration);
		if (element && !skipped(element)) push(declarations, declaration.property, declaration);
	}

	const suggest = (declaration: Declaration): Suggestion => {
		const name = declaration.property;
		const element = elementOf(model, declaration);
		if (!element) return "private";
		if (queried.has(name)) return "query";
		const page = onPage(declaration);
		const own = ownership.variable(element.id, name);
		if (own && changes(own)) return "state";
		if (changedFromOutside.get(name)?.some((variable) => variable.element !== element.id)) return "state";
		if (element.kind === "global" && element.themeScope !== undefined) return "token";
		if (page) return "page";
		const writer = componentOf(element);
		const outside = fromOutside.get(name)?.some((read) => {
			const reader = componentOf(model.elements[read.element]);
			return reader !== undefined && reader !== writer;
		});
		return outside ? "component" : "private";
	};
	return { suggest, declarations: (name) => declarations.get(name) ?? [] };
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

/**
 * A selector for the document element, in any form: `:root` or `html`, alone or with a class, an attribute or a
 * pseudo-class on it (`:root[data-color-scheme="dark"]`, `html.dark`). What it declares is for the whole page.
 */
function isPage(written: string): boolean {
	const selector = written.trim().toLowerCase();
	const subject = /^(?::root|html)(?![\w-])/.exec(selector);
	return subject !== null && !hasCombinator(selector.slice(subject[0].length));
}

/** Whether a selector steps to another element: a combinator outside brackets, parentheses and quotes. */
function hasCombinator(selector: string): boolean {
	let depth = 0;
	let quote: string | undefined;
	for (let index = 0; index < selector.length; index++) {
		const char = selector.charAt(index);
		if (char === "\\") index++;
		else if (quote) quote = char === quote ? undefined : quote;
		else if (char === '"' || char === "'") quote = char;
		else if (char === "(" || char === "[") depth++;
		else if (char === ")" || char === "]") depth--;
		else if (depth === 0 && /[\s>+~,]/.test(char)) return true;
	}
	return false;
}
