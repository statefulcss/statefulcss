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
	const names = typeof before === "string" ? styleAttributes(before) : undefined;
	if (names !== undefined) {
		if (names.includes("module")) return "module";
		if (names.includes("scoped")) return "scoped";
		return "plain";
	}
	return path && /\.module\.[a-z]+$/i.test(path) ? "module" : "plain";
}

/**
 * The attribute names, lowercased, of the `<style>` tag that ends `markup`. Only names count: `data-note="a module"`
 * has no `module` attribute, and a `>` inside a quoted value doesn't end the tag. A `<style` inside a quoted value
 * isn't the tag, because reading from it doesn't end where the markup does.
 */
function styleAttributes(markup: string): string[] | undefined {
	const lower = markup.toLowerCase();
	let at = lower.lastIndexOf("<style");
	while (at >= 0) {
		const names = attributesFrom(markup, at + "<style".length);
		if (names !== undefined) return names;
		at = at === 0 ? -1 : lower.lastIndexOf("<style", at - 1);
	}
	return undefined;
}

/** Reads a tag's attributes from `start`, the HTML way, if the tag ends at the end of `markup` (but for space). */
function attributesFrom(markup: string, start: number): string[] | undefined {
	const names: string[] = [];
	let at = start;
	// `<styles>` isn't a style tag.
	if (at < markup.length && !/[\s/>]/.test(markup.charAt(at))) return undefined;
	for (;;) {
		while (at < markup.length && /[\s/]/.test(markup.charAt(at))) at++;
		if (at >= markup.length) return undefined;
		if (markup.charAt(at) === ">") return markup.slice(at + 1).trim() === "" ? names : undefined;

		const name = /^=?[^\s/>=]*/.exec(markup.slice(at))?.[0] ?? "";
		names.push(name.toLowerCase());
		at += name.length;
		while (at < markup.length && /\s/.test(markup.charAt(at))) at++;
		if (markup.charAt(at) !== "=") continue;

		at++;
		while (at < markup.length && /\s/.test(markup.charAt(at))) at++;
		const quote = markup.charAt(at);
		if (quote === '"' || quote === "'") {
			const end = markup.indexOf(quote, at + 1);
			if (end < 0) return undefined;
			at = end + 1;
		} else {
			while (at < markup.length && !/[\s>]/.test(markup.charAt(at))) at++;
		}
	}
}

/** The name a component's variables start with: its class in kebab-case (`.ButtonGroup` → `button-group`). */
export function kebabCase(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
		.toLowerCase();
}
