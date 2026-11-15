// The form of one entry in a state list. `blockingStates` and `interactionStates` take one simple selector, a
// pseudo-class or an attribute selector; `stateAttributes` takes an attribute name. An entry is read just far
// enough to tell which it is, and what to write when it's the other.

/**
 * Pseudo-classes that are never a state. No state list can have one, and core never compares one with a state
 * list: it takes its own lists from here, so the two agree.
 */
export const nonStatePseudoClasses = Object.freeze({
	/** Hold a list of selectors, and match when any of them does. */
	matchesAny: Object.freeze([":is", ":where", ":matches", ":-webkit-any", ":-moz-any"] as const),
	/** Hold selectors too, and are read by what they hold. */
	holders: Object.freeze([":not", ":has"] as const),
	/** Say which element it is. */
	identity: Object.freeze([":root", ":scope", ":host", ":local"] as const),
	/** Wrap a selector that belongs to another stylesheet: CSS Modules' `:global()`, Vue's `:deep()` and `:slotted()`. */
	wrappers: Object.freeze([":global", ":deep", ":slotted"] as const),
	/** Pseudo-elements that can be written with one colon. */
	pseudoElements: Object.freeze([":before", ":after", ":first-line", ":first-letter"] as const),
});

/** An attribute name as a setting takes it: `data-state`. */
export const attributeNamePattern = /^[a-z][a-z0-9-]*$/;

/** How an entry of `blockingStates` or `interactionStates` starts. Editors check this much; the loader checks it all. */
export const stateSelectorPattern = new RegExp(String.raw`^[:\[]`);

/** Why an entry isn't in its list's form. */
export type EntryProblem =
	/** Right once the space around it is gone. */
	| { readonly is: "padded"; readonly trimmed: string }
	/** In a list of selectors: a name that reads as an attribute's, such as `data-busy`. */
	| { readonly is: "attribute-name"; readonly name: string }
	/** In a list of selectors: any other name on its own, such as `hover`. */
	| { readonly is: "name"; readonly name: string }
	| { readonly is: "list" }
	| { readonly is: "combinator" }
	/** Several simple selectors together. `selectors` has the ones that could be listed on their own. */
	| { readonly is: "compound"; readonly selectors: readonly string[] }
	/** `[data-step=2]`, which CSS doesn't read. `quoted` is the selector with its value in quotes. */
	| { readonly is: "unquoted-value"; readonly quoted: string }
	| { readonly is: "class" | "id" | "pseudo-element" | "not-a-state" | "not-a-selector" }
	/** An attribute selector for the attribute a setting gives to components, parts, slots or themes. */
	| { readonly is: "identity-attribute"; readonly name: string; readonly setting: string }
	/** In a list of attribute names: an attribute selector, which has the name. */
	| { readonly is: "attribute-selector"; readonly name: string }
	/** In a list of attribute names: a name with capital letters. */
	| { readonly is: "uppercase"; readonly lowercase: string }
	| { readonly is: "not-a-name" };

interface Piece {
	readonly kind: "attribute" | "pseudo-class" | "pseudo-element" | "class" | "id" | "name" | "other";
	readonly text: string;
}

const escape = String.raw`\\[^\n]`;
const identifier = String.raw`(?:--|-?(?:[a-z_\u0080-\uffff]|${escape}))(?:[\w\u0080-\uffff-]|${escape})*`;
const quoted = String.raw`"(?:[^"\\\n]|\\[^])*"|'(?:[^'\\\n]|\\[^])*'`;
const operator = String.raw`[~|^$*]?=`;

const identifierAt = new RegExp(identifier, "iy");
const attributeSelector = new RegExp(
	String.raw`^\[\s*(${identifier})\s*(?:${operator}\s*(?:${quoted}|${identifier})\s*(?:[is]\s*)?)?\]$`,
	"i",
);
const unquotedValue = new RegExp(
	String.raw`^\[\s*(${identifier})\s*(${operator})\s*([^\s"'[\]\\]+)\s*\]$`,
	"i",
);

const notStates = new Set<string>([
	...nonStatePseudoClasses.matchesAny,
	...nonStatePseudoClasses.holders,
	...nonStatePseudoClasses.identity,
	...nonStatePseudoClasses.wrappers,
]);
const pseudoElements = new Set<string>(nonStatePseudoClasses.pseudoElements);

/** What's wrong with an entry of `blockingStates` or `interactionStates`, or `undefined` for one simple selector. */
export function selectorProblem(entry: string): EntryProblem | undefined {
	const trimmed = entry.trim();
	if (trimmed !== entry) return selectorProblem(trimmed) ?? { is: "padded", trimmed };

	const pieces = piecesOf(entry);
	if (!Array.isArray(pieces)) return { is: pieces };
	const [piece, ...others] = pieces;
	if (!piece) return { is: "not-a-selector" };
	if (others.length > 0) {
		const selectors = pieces.map(({ text }) => text).filter((text) => selectorProblem(text) === undefined);
		return { is: "compound", selectors };
	}

	switch (piece.kind) {
		case "attribute": {
			if (attributeSelector.test(piece.text)) return undefined;
			const [, name, operator, value] = unquotedValue.exec(piece.text) ?? [];
			return name && operator && value
				? { is: "unquoted-value", quoted: `[${name}${operator}"${value}"]` }
				: { is: "not-a-selector" };
		}
		case "pseudo-class": {
			const name = piece.text.replace(/\(.*$/s, "").toLowerCase();
			if (pseudoElements.has(name)) return { is: "pseudo-element" };
			return notStates.has(name) ? { is: "not-a-state" } : undefined;
		}
		case "name":
			return { is: /^(?:data|aria)-/i.test(piece.text) ? "attribute-name" : "name", name: piece.text };
		case "other":
			return { is: "not-a-state" };
		default:
			return { is: piece.kind };
	}
}

/** The attribute an attribute selector asks about, in lowercase; `undefined` for anything else. */
export function attributeOf(entry: string): string | undefined {
	return attributeSelector.exec(entry)?.[1]?.toLowerCase();
}

/** What's wrong with an entry of `stateAttributes`, or `undefined` for an attribute name. */
export function attributeNameProblem(entry: string): EntryProblem | undefined {
	if (attributeNamePattern.test(entry)) return undefined;
	const trimmed = entry.trim();
	if (trimmed !== entry) return attributeNameProblem(trimmed) ?? { is: "padded", trimmed };
	if (attributeNamePattern.test(entry.toLowerCase()))
		return { is: "uppercase", lowercase: entry.toLowerCase() };

	const pieces = piecesOf(entry);
	const [piece, ...others] = Array.isArray(pieces) ? pieces : [];
	const name =
		piece?.kind === "attribute" ? /^\[\s*([^\s~|^$*=\]]+)/.exec(piece.text)?.[1]?.toLowerCase() : undefined;
	return name && others.length === 0 && attributeNamePattern.test(name)
		? { is: "attribute-selector", name }
		: { is: "not-a-name" };
}

/** The simple selectors an entry is made of, or why it isn't one compound. */
function piecesOf(text: string): Piece[] | "list" | "combinator" | "not-a-selector" {
	const pieces: Piece[] = [];
	let index = 0;
	while (index < text.length) {
		const char = text.charAt(index);
		let kind: Piece["kind"];
		let end: number | undefined;
		if (char === "[") {
			kind = "attribute";
			end = closingOf(text, index);
		} else if (char === ":") {
			const colons = text.charAt(index + 1) === ":" ? 2 : 1;
			kind = colons === 2 ? "pseudo-element" : "pseudo-class";
			end = identifierEnd(text, index + colons);
			if (end !== undefined && text.charAt(end) === "(") end = closingOf(text, end);
		} else if (char === "." || char === "#") {
			kind = char === "." ? "class" : "id";
			end = identifierEnd(text, index + 1);
		} else if (char === "*" || char === "&") {
			kind = "other";
			end = index + 1;
		} else if (char === ",") {
			return "list";
		} else if (/\s/.test(char)) {
			// Space before a comma is part of the list; anywhere else it's a combinator.
			return text.slice(index).trimStart().startsWith(",") ? "list" : "combinator";
		} else if (char === ">" || char === "+" || char === "~") {
			return "combinator";
		} else {
			kind = "name";
			end = identifierEnd(text, index);
		}
		if (end === undefined) return "not-a-selector";
		pieces.push({ kind, text: text.slice(index, end) });
		index = end;
	}
	return pieces;
}

/** Where the identifier that starts at `index` ends, or `undefined` when none starts there. */
function identifierEnd(text: string, index: number): number | undefined {
	identifierAt.lastIndex = index;
	return identifierAt.test(text) ? identifierAt.lastIndex : undefined;
}

/** The index after the bracket that closes the one at `open`, past any quoted text and brackets inside. */
function closingOf(text: string, open: number): number | undefined {
	const closers: string[] = [];
	let quote: string | undefined;
	for (let index = open; index < text.length; index++) {
		const char = text.charAt(index);
		if (char === "\\") index++;
		else if (quote) quote = char === quote ? undefined : quote;
		else if (char === '"' || char === "'") quote = char;
		else if (char === "[" || char === "(") closers.push(char === "[" ? "]" : ")");
		else if (char === "]" || char === ")") {
			if (closers.pop() !== char) return undefined;
			if (closers.length === 0) return index + 1;
		}
	}
	return undefined;
}
