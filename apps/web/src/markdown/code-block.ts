import type { ShikiConfig } from "@astrojs/markdown-remark";
import type { Element } from "hast";
import { h } from "hastscript";

type ShikiTransformer = NonNullable<ShikiConfig["transformers"]>[number];

const TITLE = /\btitle=(["'])(.*?)\1/;
const LINE_NUMBERS = /(^|\s)(lineNumbers|showLineNumbers)(?=\s|$)/;
const PLAIN_LANGUAGES = new Set(["plaintext", "text", "txt", "plain", "ansi"]);

/**
 * Wraps each Markdown code block in the code block component:
 *
 * ```html
 * <figure data-component="code-block" data-language="css" data-line-numbers>
 *   <figcaption data-part="title">src/styles/button.css</figcaption>
 *   <pre data-part="code" tabindex="0"><code><span class="line">…</span></code></pre>
 *   <button type="button" data-part="copy" hidden>Copy</button>
 * </figure>
 * ```
 *
 * The fence's info string sets the options:
 *
 * - `title="…"` adds the title, and is left out without one.
 * - `lineNumbers` (or `showLineNumbers`) adds `data-line-numbers`.
 *
 * `data-language` is left out for plain text. The copy button stays hidden until the copy script
 * shows it.
 */
export function transformerCodeBlock(): ShikiTransformer {
	return {
		name: "statefulcss:code-block",
		preprocess() {
			const meta = this.options.meta;
			const raw = meta?.__raw;
			if (!meta || !raw) return;

			// Shiki writes every meta key without a leading underscore onto the <pre> as an attribute.
			let rest = raw;
			const title = TITLE.exec(rest);
			if (title) {
				meta._title = title[2];
				rest = rest.replace(title[0], "");
			}
			if (LINE_NUMBERS.test(rest)) {
				meta._lineNumbers = true;
				rest = rest.replace(LINE_NUMBERS, "$1");
			}
			// The word highlighter reads `/word/` from the same string, so a path in the title would highlight words.
			Object.assign(meta, { __raw: rest });
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
			const meta = this.options.meta;
			const title: unknown = meta?._title;
			const language = this.options.lang;

			root.children = [
				h(
					"figure",
					{
						dataComponent: "code-block",
						dataLanguage: language && !PLAIN_LANGUAGES.has(language) ? language : undefined,
						dataLineNumbers: meta?._lineNumbers === true ? "" : undefined,
					},
					[
						typeof title === "string" && title ? h("figcaption", { dataPart: "title" }, title) : undefined,
						pre,
						h("button", { type: "button", dataPart: "copy", hidden: true }, "Copy"),
					],
				),
			];
		},
	};
}
