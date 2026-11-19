import type { ShikiConfig } from "@astrojs/markdown-remark";
import type { Element } from "hast";
import { h } from "hastscript";

type ShikiTransformer = NonNullable<ShikiConfig["transformers"]>[number];

const TITLE = /\btitle=(["'])(.*?)\1/;

/**
 * Wraps each Markdown code block in the code block component:
 *
 * ```html
 * <figure class="code-block" data-component data-language="css">
 *   <figcaption data-part="title">src/styles/button.css</figcaption>
 *   <pre data-part="code">…</pre>
 *   <button type="button" data-part="copy" hidden>Copy</button>
 * </figure>
 * ```
 *
 * The title comes from `title="…"` in the fence's info string and is left out without one. The
 * copy button stays hidden until the copy script shows it.
 */
export function transformerCodeBlock(): ShikiTransformer {
	return {
		name: "statefulcss:code-block",
		preprocess() {
			const meta = this.options.meta;
			const raw = meta?.__raw;
			if (!meta || !raw) return;
			const match = TITLE.exec(raw);
			if (!match) return;
			meta.title = match[2];
			// The word highlighter reads `/word/` from the same string, so a path in the title would highlight words.
			Object.assign(meta, { __raw: raw.replace(match[0], "") });
		},
		pre(node) {
			// An inline background could only be overridden with !important; the block's CSS sets it.
			const style = typeof node.properties.style === "string" ? node.properties.style : "";
			const declarations = style
				.split(";")
				.filter((declaration) => declaration.trim() && !/^\s*background-color\s*:/.test(declaration));
			node.properties.style = declarations.length > 0 ? declarations.join(";") : undefined;
			node.properties.dataPart = "code";
		},
		root(root) {
			const pre = root.children.find(
				(node): node is Element => node.type === "element" && node.tagName === "pre",
			);
			if (!pre) return;
			const title: unknown = this.options.meta?.title;

			root.children = [
				h("figure", { className: ["code-block"], dataComponent: "", dataLanguage: this.options.lang }, [
					typeof title === "string" && title ? h("figcaption", { dataPart: "title" }, title) : undefined,
					pre,
					h("button", { type: "button", dataPart: "copy", hidden: true }, "Copy"),
				]),
			];
		},
	};
}
