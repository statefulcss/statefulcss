import { markdownConfigDefaults } from "@astrojs/markdown-remark";
import { describe, expect, it } from "vitest";

import { markdownProcessor, shikiConfig } from "../../src/markdown/config";

const renderer = await markdownProcessor.createRenderer({ ...markdownConfigDefaults, shikiConfig });
const render = async (markdown: string) => (await renderer.render(markdown)).code;

describe("headings", () => {
	it("puts the section link after the heading, named by hidden text", async () => {
		const html = await render("## Install the plugin");

		expect(html).toBe(
			'<div data-part="heading"><h2 id="install-the-plugin">Install the plugin</h2>' +
				'<a data-part="heading-anchor" href="#install-the-plugin"><span aria-hidden="true">#</span>' +
				'<span class="visually-hidden">Section titled “Install the plugin”</span></a></div>',
		);
	});

	it("keeps a link inside a heading out of the section link", async () => {
		const html = await render("## Use [the plugin](/docs/)");

		expect(html).toContain(
			'<h2 id="use-the-plugin">Use <a href="/docs/">the plugin</a></h2><a data-part="heading-anchor" href="#use-the-plugin">',
		);
	});

	it("collects headings without the section link's text", async () => {
		const { metadata } = await renderer.render("## Install\n\n### Configure");

		expect(metadata.headings).toEqual([
			{ depth: 2, slug: "install", text: "Install" },
			{ depth: 3, slug: "configure", text: "Configure" },
		]);
	});
});

describe("code blocks", () => {
	it("wraps the code in a code block with its title and a hidden copy button", async () => {
		const html = await render('```css title="src/styles/button.css"\n.button {}\n```');

		expect(html).toMatch(/^<figure class="code-block" data-component="" data-language="css">/);
		expect(html).toContain('<figcaption data-part="title">src/styles/button.css</figcaption>');
		expect(html).toContain('data-part="code"');
		expect(html).toMatch(/<button type="button" data-part="copy" hidden>Copy<\/button><\/figure>$/);
	});

	it("leaves the title out when the fence has none", async () => {
		const html = await render("```css\n.button {}\n```");

		expect(html).not.toContain("figcaption");
	});

	it("writes token colors as light-dark() and no background", async () => {
		const html = await render("```css\n.button { color: red; }\n```");

		expect(html).toMatch(/<span style="color:light-dark\(#[0-9A-F]{6}, #[0-9A-F]{6}\);/i);
		expect(html).not.toContain("background-color");
	});

	it("doesn't highlight words from the title's path", async () => {
		const html = await render('```css title="src/styles/button.css" /color/\n.styles { color: red; }\n```');

		expect(html.match(/highlighted-word/g)).toHaveLength(1);
	});

	it("marks highlighted lines and diffs", async () => {
		const html = await render("```css {1}\n.a {}\n.b {} /* [!code ++] */\n```");

		expect(html).toContain('class="line highlighted"');
		expect(html).toContain('class="line diff add"');
	});
});
