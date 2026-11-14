import { defaults, type Settings } from "@statefulcss/config";
import { type Document, parse, type Root } from "postcss";
import html from "postcss-html";
import scss from "postcss-scss";
import { describe, it } from "vitest";

import { analyze } from "../index.js";
import type { Model } from "../model.js";

const parseHTML = html.parse;

/** Every case runs in each of these, unless it opts out with a reason. */
export const syntaxes = ["css", "scss", "vue"] as const;
export type Syntax = (typeof syntaxes)[number];

export interface ReadOptions {
	/** The file name, without changing its syntax: `button.module.css` reads as `button.module.scss` and `Button.vue`. */
	file?: string;
	/** A CSS Module: `*.module.css`, or a Vue `<style module>`. */
	module?: boolean;
	settings?: Settings;
}

/** Parses CSS the way Stylelint would for a file of that syntax. A Vue file holds it in one `<style>` block. */
export function parseIn(syntax: Syntax, css: string, options: ReadOptions = {}): Root | Document {
	const base = (options.file ?? "button.css").replace(/\.(css|scss|vue)$/, "");
	const stem = options.module && !base.endsWith(".module") ? `${base}.module` : base;
	switch (syntax) {
		case "css":
			return parse(css, { from: `/project/src/${stem}.css` });
		case "scss":
			return scss.parse(css, { from: `/project/src/${stem}.scss` });
		case "vue": {
			const name = stem.replace(/\.module$/, "");
			const component = name.charAt(0).toUpperCase() + name.slice(1);
			const source = `<template><div></div></template>\n<style${options.module ? " module" : ""}>\n${css}\n</style>\n`;
			if (!parseHTML) throw new Error("postcss-html has no parser");
			return parseHTML(source, { from: `/project/src/${component}.vue` });
		}
	}
}

/** One syntax, for a test: CSS in, and either the tree a pass reads or the whole model out. */
export interface Source {
	syntax: Syntax;
	/** The PostCSS tree, for a test of one pass. */
	parse: (css: string, options?: ReadOptions) => Root | Document;
	/** The model, for a test of the whole analysis. */
	read: (css: string, options?: ReadOptions) => Model;
}

export function sourceFor(syntax: Syntax): Source {
	return {
		syntax,
		parse: (css, options = {}) => parseIn(syntax, css, options),
		read: (css, options = {}) => analyze(parseIn(syntax, css, options), options.settings ?? defaults),
	};
}

/**
 * A test that runs in every syntax. A syntax the case doesn't translate to is skipped, with the reason in its name.
 */
export function inEverySyntax(
	name: string,
	test: (source: Source) => void,
	options: { skip?: Partial<Record<Syntax, string>> } = {},
): void {
	describe(name, () => {
		for (const syntax of syntaxes) {
			const reason = options.skip?.[syntax];
			if (reason) it.skip(`${syntax}: ${reason}`, () => {});
			else it(syntax, () => test(sourceFor(syntax)));
		}
	});
}
