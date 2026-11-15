// The form of one entry in a state list. `blockingStates` and `interactionStates` take one simple selector, a
// pseudo-class or an attribute selector; `stateAttributes` takes an attribute name. An entry is read just far
// enough to tell which it is, and what to write when it's the other.

/** Why an entry isn't in its list's form. */
export type EntryProblem =
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
	/** In a list of attribute names: an attribute selector, which has the name. */
	| { readonly is: "attribute-selector"; readonly name: string }
	| { readonly is: "not-a-name" };

interface Piece {
	readonly kind: "attribute" | "pseudo-class" | "pseudo-element" | "class" | "id" | "name" | "other";
	readonly text: string;
}

const escape = String.raw`\\[^\n]`;
const identifier = String.raw`(?:--|-?(?:[a-z_\u0080-￿]|${escape}))(?:[\w\u0080-￿-]|${escape})*`;
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
const attributeName = /^[a-z_][\w-]*$/i;

// Pseudo-classes core never compares with a state list, so config doesn't accept them: the ones that hold other
// selectors, the ones that say which element it is, and the wrappers CSS Modules and Vue add. Core's lists are in
// its classify.ts and selectors.ts.
const notStates = new Set([
	":not",
	":is",
	":where",
	":has",
	":matches",
	":-webkit-any",
	":-moz-any",
	":root",
	":scope",
	":host",
	":local",
	":global",
	":deep",
	":slotted",
]);

/** Pseudo-elements that can be written with one colon. */
const legacyPseudoElements = new Set([":before", ":after", ":first-line", ":first-letter"]);

/** What's wrong with an entry of `blockingStates` or `interactionStates`, or `undefined` for one simple selector. */
export function selectorProblem(entry: string): EntryProblem | undefined {
	const pieces = piecesOf(entry.trim());
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
			if (legacyPseudoElements.has(name)) return { is: "pseudo-element" };
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

/** What's wrong with an entry of `stateAttributes`, or `undefined` for an attribute name. */
export function attributeNameProblem(entry: string): EntryProblem | undefined {
	const text = entry.trim();
	if (attributeName.test(text)) return undefined;
	const pieces = piecesOf(text);
	const [piece, ...others] = Array.isArray(pieces) ? pieces : [];
	const [, name] = (piece?.kind === "attribute" && /^\[\s*([^\s~|^$*=\]]+)/.exec(piece.text)) || [];
	return name && others.length === 0 && attributeName.test(name)
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
