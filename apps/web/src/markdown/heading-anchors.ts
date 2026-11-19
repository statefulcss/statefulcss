import { toString } from "hast-util-to-string";
import { h } from "hastscript";
import type { Options } from "rehype-autolink-headings";

/**
 * Puts a section link after each Markdown heading, both in one wrapper:
 *
 * ```html
 * <div data-part="heading">
 *   <h2 id="install">Install</h2>
 *   <a href="#install" data-part="heading-anchor">
 *     <span aria-hidden="true">#</span>
 *     <span class="visually-hidden">Section titled “Install”</span>
 *   </a>
 * </div>
 * ```
 *
 * The heading keeps its own accessible name, and the link is named by its hidden text instead of
 * the "#" it shows.
 */
export const headingAnchors: Options = {
	behavior: "after",
	test: ["h2", "h3", "h4", "h5", "h6"],
	group: () => h("div", { dataPart: "heading" }),
	properties: { dataPart: "heading-anchor" },
	content: (heading) => [
		h("span", { ariaHidden: "true" }, "#"),
		h("span", { className: ["visually-hidden"] }, `Section titled “${toString(heading)}”`),
	],
};
