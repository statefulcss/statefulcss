import type { DocTag } from "../model.js";

/** What a doc comment says, before it's given a component. */
export interface ReadDocComment {
	/** Its first line: the component's name as people say it. */
	readonly title: string | undefined;
	/** Every tag, unknown ones included, in order. */
	readonly tags: readonly DocTag[];
	/** The first word of `@component`. */
	readonly componentName: string | undefined;
	readonly sets: readonly string[];
	readonly reads: readonly string[];
	readonly queries: readonly string[];
}

/**
 * Reads a doc comment's text as PostCSS hands it over, without its delimiters. The first line is the component's
 * name; a line that starts with `@name` is a tag, and the lines after it belong to it until the next tag, so a list
 * may wrap.
 */
export function readDocComment(text: string): ReadDocComment {
	const lines = text.split("\n").map((line) => line.replace(/^\s*\*+\s?/, "").trim());
	const tags: DocTag[] = [];
	let title: string | undefined;
	for (const line of lines) {
		const tag = /^@([\w-]+)\s*(.*)$/.exec(line);
		if (tag?.[1]) tags.push({ name: tag[1], value: tag[2] ?? "" });
		else if (line === "") continue;
		else if (tags.length === 0) title ??= line;
		else {
			const last = tags.length - 1;
			const open = tags[last];
			if (open) tags[last] = { name: open.name, value: `${open.value} ${line}`.trim() };
		}
	}
	return {
		title,
		tags,
		componentName: valuesOf(tags, "component")[0]?.split(/\s+/)[0] || undefined,
		sets: namesIn(tags, "sets"),
		reads: namesIn(tags, "reads"),
		queries: namesIn(tags, "queries"),
	};
}

function valuesOf(tags: readonly DocTag[], name: string): string[] {
	return tags.filter((tag) => tag.name === name).map((tag) => tag.value);
}

/** The custom property names a tag lists, across every use of the tag. Anything else in its value is prose. */
function namesIn(tags: readonly DocTag[], name: string): string[] {
	const names = valuesOf(tags, name)
		.flatMap((value) => value.split(/[\s,]+/))
		.filter((word) => word.startsWith("--"));
	return [...new Set(names)];
}
