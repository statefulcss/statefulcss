// The document element: what a selector for it declares is for the whole page. Rule 1 suggests a token for it, and
// `theme-tokens` reads the same answer.

/**
 * Whether a selector's subject is the document element: one compound holding `:root`, or starting with `html`, with
 * no combinator and no pseudo-element. `:root`, `html`, `:root[data-color-scheme="dark"]`, `html.dark` and
 * `.dark:root` are the page; `html::before`, `:root .card` and `:not(:root)` aren't.
 */
export function isPage(selector: string): boolean {
	const compound = topLevelOf(selector.trim().toLowerCase());
	if (compound === undefined) return false;
	if (/::|:(?:before|after|first-line|first-letter)(?![\w-])/.test(compound)) return false;
	return /^html(?![\w-])/.test(compound) || /:root(?![\w-])/.test(compound);
}

/**
 * The selector with what its brackets and parentheses hold left out, so only its own compound is read; undefined when
 * it steps to another element (a combinator or a space) or lists several selectors.
 */
function topLevelOf(selector: string): string | undefined {
	let depth = 0;
	let quote: string | undefined;
	let text = "";
	for (let index = 0; index < selector.length; index++) {
		const char = selector.charAt(index);
		if (char === "\\") {
			if (depth === 0) text += selector.slice(index, index + 2);
			index++;
		} else if (quote) quote = char === quote ? undefined : quote;
		else if (char === '"' || char === "'") quote = char;
		else if (char === "(" || char === "[") {
			if (depth === 0) text += char;
			depth++;
		} else if (char === ")" || char === "]") {
			depth--;
			if (depth === 0) text += char;
		} else if (depth === 0) {
			if (/[\s>+~,]/.test(char)) return undefined;
			text += char;
		}
	}
	return text;
}
