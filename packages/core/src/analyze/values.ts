import valueParser from "postcss-value-parser";

/** One `var()` in a value. */
export interface ValueRead {
	readonly name: string;
	readonly hasFallback: boolean;
	/** It sits inside another `var()`'s fallback. */
	readonly inFallback: boolean;
	/**
	 * Where its `var()` stands: it is the whole value; one word of it (a shorthand's slot, an item of a list); or
	 * inside a function such as `calc()`. A read in a fallback stands where the `var()` it falls back for stands.
	 */
	readonly position: "whole" | "word" | "function";
}

/** The variables a value reads, in the order it reads them, fallbacks included. Never throws. */
export function readsOf(value: string): ValueRead[] {
	const found: ValueRead[] = [];
	try {
		const { nodes } = valueParser(value);
		const words = nodes.filter((node) => node.type !== "space" && node.type !== "comment");
		collect(nodes, words.length === 1 ? "whole" : "word", false, found);
	} catch {
		// A value the parser gives up on reads nothing core can name.
	}
	return found;
}

function collect(
	nodes: readonly valueParser.Node[],
	position: ValueRead["position"],
	inFallback: boolean,
	found: ValueRead[],
): void {
	for (const node of nodes) {
		if (node.type !== "function") continue;
		const name = node.value.toLowerCase();
		if (name !== "var") {
			// `url(var(--x))` is a URL, not a read.
			if (name !== "url") collect(node.nodes, inFallback ? position : "function", inFallback, found);
			continue;
		}
		const [first] = node.nodes.filter((inner) => inner.type !== "space" && inner.type !== "comment");
		if (first?.type !== "word" || !first.value.startsWith("--")) continue;
		const comma = node.nodes.findIndex((inner) => inner.type === "div" && inner.value === ",");
		found.push({ name: first.value, hasFallback: comma !== -1, inFallback, position });
		if (comma !== -1) collect(node.nodes.slice(comma + 1), position, true, found);
	}
}

const interpolation = /#\{|@\{|\$\{|\{\{|<%/;
const quoted = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;

/**
 * Whether a value holds syntax core can't read: SCSS or Less interpolation, a SCSS variable, Vue's `v-bind()`, or a
 * template placeholder. Its declaration is kept, since its property is readable, and nothing is read from it.
 */
export function isUnreadValue(value: string): boolean {
	const outside = value.replace(quoted, '""');
	return interpolation.test(value) || /\$[\w-]/.test(outside) || /\bv-bind\(/i.test(outside);
}
