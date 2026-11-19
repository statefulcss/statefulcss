// Names a rule's `ignore…` option lists, in Stylelint's own convention: a name, a string written as `/regex/` (or
// `/regex/i`), or a regular expression from a JavaScript config.

export type NamePattern = string | RegExp;

/** Whether a value is a pattern an `ignore…` option takes. A `/regex/` string has to compile. */
export function isNamePattern(value: unknown): value is NamePattern {
	if (value instanceof RegExp) return true;
	if (typeof value !== "string") return false;
	try {
		expressionOf(value);
		return true;
	} catch {
		return false;
	}
}

/** Whether a name matches any of the patterns: a plain string matches only itself, exactly. */
export function matchesAny(name: string, patterns: readonly NamePattern[]): boolean {
	return patterns.some((pattern) => {
		const expression = pattern instanceof RegExp ? pattern : expressionOf(pattern);
		return expression ? name.match(expression) !== null : name === pattern;
	});
}

/** The expression a `/regex/` or `/regex/i` string stands for; undefined for a plain name. */
function expressionOf(pattern: string): RegExp | undefined {
	if (!pattern.startsWith("/")) return undefined;
	if (pattern.length > 2 && pattern.endsWith("/i")) return new RegExp(pattern.slice(1, -2), "i");
	if (pattern.length > 1 && pattern.endsWith("/")) return new RegExp(pattern.slice(1, -1));
	return undefined;
}
