import type { Root } from "postcss";

/**
 * What kind of stylesheet a root is. In a Vue file each `<style>` block is a root: a plain block styles the whole
 * page, a `scoped` one only its component, and a `module` one is a CSS Module. Outside Vue, `*.module.css` (or
 * `.scss`) is a CSS Module and anything else is plain.
 */
export type SheetKind = "plain" | "scoped" | "module";

export function sheetKind(root: Root, path: string | undefined): SheetKind {
	// postcss-html keeps the markup before each <style> block; its opening tag is the last one there.
	const before: unknown = root.raws.codeBefore;
	const tag = typeof before === "string" ? /<style\b([^>]*)>\s*$/i.exec(before)?.[1] : undefined;
	if (tag !== undefined) {
		if (hasAttribute(tag, "module")) return "module";
		if (hasAttribute(tag, "scoped")) return "scoped";
		return "plain";
	}
	return path && /\.module\.[a-z]+$/i.test(path) ? "module" : "plain";
}

function hasAttribute(tag: string, name: string): boolean {
	return new RegExp(`(?:^|\\s)${name}(?:[\\s=]|$)`, "i").test(tag);
}

/** The name a component's variables start with: its class in kebab-case (`.ButtonGroup` → `button-group`). */
export function kebabCase(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}
