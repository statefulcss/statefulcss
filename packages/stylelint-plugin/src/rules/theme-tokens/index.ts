// `theme-tokens` (rule 2): tokens and theme scopes belong together, in both directions. A token is declared only in a
// theme scope, and a theme scope declares only tokens and `color-scheme`. Theme scopes, `[data-color-scheme]`
// selectors and token registrations are written only in the theme files, each theme in its own folder, and the theme
// files hold nothing else.
import path from "node:path";

import type { Settings } from "@statefulcss/config";
import type { Block, Declaration, Element, Id, Model, Registration } from "@statefulcss/core";
import type { AtRule, Node, Rule } from "postcss";

import { listOf, nameOf } from "../names.js";
import { isPage } from "../page.js";
import { defineRule, type Finding } from "../rule.js";

const messages = {
	tokenOnPage: (name: string, place: string, scope: string) =>
		`Unexpected token "${name}" declared on ${place}, outside any theme scope: switching the theme attribute wouldn't change it. Declare it in a theme scope, such as ${scope}.`,
	tokenUnderTheme: (name: string, place: string, scope: string) =>
		`Unexpected token "${name}" declared on ${place}, inside ${scope}: what a theme scope contains is a component, not the theme. Declare the token on ${scope}, and read it in the component.`,
	tokenOutside: (name: string, place: string, private_: string) =>
		`Unexpected token "${name}" declared on ${place}. Tokens are declared only in theme scopes: a value the element names for itself is a private, such as "${private_}".`,
	tokenOnColorScheme: (name: string, place: string) =>
		`Unexpected token "${name}" declared on ${place}: a color scheme picks a value, it isn't a set of tokens. Give the token both values with "light-dark()" in the theme scope, and set only "color-scheme" here.`,
	colorSchemeOnly: (property: string, place: string) =>
		`Unexpected "${property}" declared on ${place}. A "[data-color-scheme]" selector declares only "color-scheme".`,
	themeScopeOnly: (property: string, place: string) =>
		`Unexpected "${property}" declared in theme scope ${place}. A theme scope declares only tokens and "color-scheme": move "${property}" to a base or component style.`,
	componentVariableInTheme: (name: string, place: string) =>
		`Unexpected component variable "${name}" set in theme scope ${place}. A theme sets tokens: set a token the component's default reads, and set component variables where the component is used.`,
	themeScopeOutside: (place: string, patterns: string) =>
		`Unexpected theme scope ${place} outside the theme files. Write it in a file matching ${patterns}, or change "themeFiles" in statefulcss.config.`,
	colorSchemeOutside: (place: string, patterns: string) =>
		`Unexpected color scheme selector ${place} outside the theme files. Write it in a file matching ${patterns}, or change "themeFiles" in statefulcss.config.`,
	registrationOutside: (name: string, patterns: string) =>
		`Unexpected registration of token "${name}" outside the theme files. Its initial value is the token's global default, part of the base theme: register it in a file matching ${patterns}.`,
	wrongFolder: (place: string, folder: string, owner: string, move: string) =>
		`Unexpected ${place} in "${folder}", which holds ${owner}. Move it to "${move}".`,
	baseNamed: (place: string, folder: string, base: string) =>
		`Unexpected ${place} in "${folder}", the base theme's folder. The base theme is the unnamed scope: write ${base}.`,
	mixedThemes: (place: string, owner: string) =>
		`Unexpected ${place} in a file of ${owner}. Write each theme in a file of its own.`,
	notThemeContent: (place: string) =>
		`Unexpected ${place} in a theme file. A theme file holds only theme scopes, "[data-color-scheme]" selectors, token registrations and imports of other theme files.`,
	importOutside: (url: string, patterns: string) =>
		`Unexpected import of "${url}" in a theme file. A theme file imports only other theme files, matching ${patterns}.`,
};

type Key = keyof typeof messages;

/** What a finding says before a selector list's branches are joined. */
interface Said {
	readonly message: Key;
	readonly args: readonly string[];
	readonly at: Finding<Key>["at"];
}

/** Where a theme file sits among the themes: the themes folder, and the theme folder under it, if any. */
interface ThemeFolder {
	/** The folder the theme folders are in: `src/styles/themes`. */
	readonly root: string;
	/** The first folder under it; undefined for a file at its root. */
	readonly name: string | undefined;
}

/** What the linted file is to the themes: a theme file or not, and its theme folder, when the patterns say. */
interface Location {
	readonly themeFile: boolean;
	readonly folder: ThemeFolder | undefined;
}

export default defineRule<Record<never, never>, Key>({
	name: "theme-tokens",
	severity: "error",
	fixable: false,
	messages,
	check(model, { settings, file }) {
		const findings: Finding<Key>[] = [];
		const add = (said: readonly Said[]): void => {
			const [first] = said;
			if (!first) return;
			const args = first.args.map((_, index) => listOf(said.map((one) => one.args[index] ?? "")));
			findings.push({ message: first.message, args, at: first.at });
		};

		// Checks 1 to 3, on declarations: one finding for each written declaration and message, so a selector list
		// names each of its places once.
		const byWritten = new Map<string, Said[]>();
		for (const declaration of model.declarations) {
			const block = model.blocks[declaration.block];
			const element = block && model.elements[block.element];
			if (!block || !element) continue;
			const said = declarationSaid(model, settings, declaration, block, element);
			if (!said) continue;
			const key = `${declaration.written}\u0000${said.message}`;
			const group = byWritten.get(key);
			if (group) group.push(said);
			else byWritten.set(key, [said]);
		}
		for (const said of byWritten.values()) add(said);

		// Checks 4 to 6 need to know where the file is. Code with no file has no place among the theme files, and a
		// project that lists no theme files doesn't keep its themes in any.
		if (file === undefined || settings.themeFiles.length === 0) return findings;
		const location = locationOf(file, settings);
		const patterns = orList(settings.themeFiles.map((pattern) => `"${pattern}"`));

		// The rules that write a theme scope or a color scheme selector, each once, and the rules that write
		// anything else.
		const themeRules = new Map<Rule, Said[]>();
		const otherRules = new Map<Rule, Id[]>();
		for (const block of model.blocks) {
			const element = model.elements[block.element];
			if (!element || element.kind === "foreign") continue;
			if (element.kind === "global" && (element.themeScope || element.colorScheme)) {
				const rule = outermostRule(block.node);
				if (!rule) continue;
				const said = themeScopeSaid(model, element, rule, location, patterns, settings);
				if (!said) continue;
				const group = themeRules.get(rule) ?? [];
				if (!group.some((one) => one.message === said.message && sameArgs(one.args, said.args)))
					group.push(said);
				themeRules.set(rule, group);
			} else if (location.themeFile) {
				const rule = nearestRule(block.node);
				if (!rule) continue;
				const elements = otherRules.get(rule) ?? [];
				if (!elements.includes(element.id)) elements.push(element.id);
				otherRules.set(rule, elements);
			}
		}

		// Check 6: where theme scopes are written. With no folders to read, a file still holds one theme.
		if (!location.folder && location.themeFile) mixedThemesIn(model, themeRules, settings);
		for (const said of themeRules.values()) {
			const byMessage = new Map<Key, Said[]>();
			for (const one of said) byMessage.set(one.message, [...(byMessage.get(one.message) ?? []), one]);
			for (const group of byMessage.values()) add(group);
		}

		// Check 5: a token's registration.
		for (const registration of model.registrations) {
			if (registration.name.includes("#{")) continue;
			if (registration.role === "token" && !location.themeFile) {
				add([
					{
						message: "registrationOutside",
						args: [registration.name, patterns],
						at: nameAt(registration),
					},
				]);
			} else if (registration.role !== "token" && location.themeFile) {
				add([
					{
						message: "notThemeContent",
						args: [`"@property ${registration.name}"`],
						at: nameAt(registration),
					},
				]);
			}
		}

		if (!location.themeFile) return findings;

		// Check 4: a theme file holds nothing else. A rule inside another reported rule is part of it.
		for (const [rule, elements] of otherRules) {
			if (hasAncestorIn(rule, otherRules)) continue;
			add([
				{
					message: "notThemeContent",
					args: [listOf(elements.map((id) => nameOf(model, settings, id)))],
					at: { node: rule, index: 0, endIndex: rule.selector.length },
				},
			]);
		}
		for (const { name, node } of model.atRules) {
			if (name === "layer" || name === "charset") continue;
			if (name === "import") {
				const url = importedUrl(node.params);
				if (url === undefined) continue;
				const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), url));
				if (isThemeFile(target, settings)) continue;
				add([
					{
						message: "importOutside",
						args: [url, patterns],
						at: { node, index: 0, endIndex: node.params.length },
					},
				]);
				continue;
			}
			add([{ message: "notThemeContent", args: [`"@${node.name}"`], at: { node } }]);
		}
		return findings;
	},
});

/** Checks 1 to 3 for one declaration on one element: what to say, or nothing. */
function declarationSaid(
	model: Model,
	settings: Settings,
	declaration: Declaration,
	block: Block,
	element: Element,
): Said | undefined {
	if (element.kind === "foreign") return undefined;
	const { property, role } = declaration;
	const at = { node: declaration.node, part: "property" } as const;
	const place = nameOf(model, settings, element.id);

	if (element.kind === "global" && element.colorScheme) {
		if (property === "color-scheme") return undefined;
		return role === "token"
			? { message: "tokenOnColorScheme", args: [property, place], at }
			: { message: "colorSchemeOnly", args: [property, place], at };
	}
	if (element.kind === "global" && element.themeScope) {
		if (property === "color-scheme" || role === "token") return undefined;
		return role === "component"
			? { message: "componentVariableInTheme", args: [property, place], at }
			: { message: "themeScopeOnly", args: [property, place], at };
	}
	if (role !== "token") return undefined;
	if (isPage(block.selector))
		return { message: "tokenOnPage", args: [property, place, `"[${settings.themeAttribute}]"`], at };
	const scope = themeScopeAround(block, settings);
	if (scope) return { message: "tokenUnderTheme", args: [property, place, `"${scope}"`], at };
	return { message: "tokenOutside", args: [property, place, property.replace(/^--t-/, "--_")], at };
}

/**
 * The theme scope a selector reaches its element through, as written: `[data-theme="default"]` in
 * `[data-theme="default"] .button`.
 */
function themeScopeAround(block: Block, settings: Settings): string | undefined {
	const name = settings.themeAttribute.toLowerCase();
	const condition = block.conditions.find(
		(one) => one.on === "context" && one.attribute?.name.toLowerCase() === name,
	);
	if (condition) return condition.text;
	// A global element's path holds every compound: the ones before its subject are where it is.
	const attribute = new RegExp(`\\[\\s*${escapeRegExp(name)}\\s*(?:[~|^$*]?=|\\])`, "i");
	return block.path.slice(0, -1).find((step) => attribute.test(step.text))?.text;
}

/** Check 6 for the rule writing one theme scope or color scheme selector: outside the theme files, or in another theme's folder. */
function themeScopeSaid(
	model: Model,
	element: Extract<Element, { kind: "global" }>,
	rule: Rule,
	location: Location,
	patterns: string,
	settings: Settings,
): Said | undefined {
	const at = { node: rule, index: 0, endIndex: rule.selector.length };
	const place = nameOf(model, settings, element.id);
	if (!location.themeFile) {
		return element.themeScope
			? { message: "themeScopeOutside", args: [place, patterns], at }
			: { message: "colorSchemeOutside", args: [place, patterns], at };
	}
	const { folder } = location;
	if (!folder || !element.themeScope) return undefined;
	const theme = element.themeScope.theme;
	const base = folder.name === undefined || folder.name === settings.baseTheme;
	const here = folder.name === undefined ? `${folder.root}/` : `${folder.root}/${folder.name}/`;
	if (base && theme !== undefined && theme === folder.name) {
		return { message: "baseNamed", args: [place, here, `"[${settings.themeAttribute}]"`], at };
	}
	if (base && theme !== undefined) {
		return {
			message: "wrongFolder",
			args: [place, here, "the base theme", `${folder.root}/${theme}/`],
			at,
		};
	}
	if (!base && theme !== folder.name) {
		return {
			message: "wrongFolder",
			args: [place, here, `theme "${folder.name ?? ""}"`, `${folder.root}/${theme ?? settings.baseTheme}/`],
			at,
		};
	}
	return undefined;
}

/**
 * A theme file whose folder the patterns don't say still holds one theme: the first theme scope's. Every rule writing
 * another theme is reported.
 */
function mixedThemesIn(model: Model, themeRules: Map<Rule, Said[]>, settings: Settings): void {
	let first: { theme: string | undefined } | undefined;
	for (const block of model.blocks) {
		const element = model.elements[block.element];
		if (element?.kind !== "global" || !element.themeScope) continue;
		const rule = outermostRule(block.node);
		if (!rule) continue;
		const { theme } = element.themeScope;
		first ??= { theme };
		if (theme === first.theme) continue;
		const owner = first.theme === undefined ? "the base theme" : `theme "${first.theme}"`;
		const said: Said = {
			message: "mixedThemes",
			args: [nameOf(model, settings, element.id), owner],
			at: { node: rule, index: 0, endIndex: rule.selector.length },
		};
		const group = themeRules.get(rule) ?? [];
		if (!group.some((one) => sameArgs(one.args, said.args))) group.push(said);
		themeRules.set(rule, group);
	}
}

/** Where a file is among the theme files, from its path relative to the config's folder. */
function locationOf(file: string, settings: Settings): Location {
	const patterns = settings.themeFiles
		.map(normalizePattern)
		.filter((pattern) => path.posix.matchesGlob(file, pattern));
	for (const pattern of patterns) {
		const folder = folderOf(file, pattern);
		if (folder) return { themeFile: true, folder };
	}
	return { themeFile: patterns.length > 0, folder: undefined };
}

function isThemeFile(file: string, settings: Settings): boolean {
	return settings.themeFiles.some((pattern) => path.posix.matchesGlob(file, normalizePattern(pattern)));
}

/**
 * The themes folder a pattern names and the theme folder the file is in. Only a pattern that ends in `**` (and maybe a
 * file name after it) says where the themes folder ends: `**\/styles/themes/**` makes `src/styles/themes` the themes
 * folder. The nearest folder of the file's that matches is it.
 */
function folderOf(file: string, pattern: string): ThemeFolder | undefined {
	const segments = pattern.split("/");
	const globstar = segments.lastIndexOf("**");
	if (globstar <= 0 || segments.length - globstar > 2) return undefined;
	const prefix = segments.slice(0, globstar).join("/");
	const parts = file.split("/");
	for (let end = 1; end < parts.length; end++) {
		const root = parts.slice(0, end).join("/");
		if (!path.posix.matchesGlob(root, prefix)) continue;
		const rest = parts.slice(end);
		return { root, name: rest.length > 1 ? rest[0] : undefined };
	}
	return undefined;
}

function normalizePattern(pattern: string): string {
	return pattern.replace(/^\.\//, "");
}

/**
 * The path a relative `@import` names: `./espresso/index.css` from `@import "./espresso/index.css" layer(themes)`.
 * Undefined for anything else (a package, an absolute path, a URL), whose file the rule can't know.
 */
function importedUrl(params: string): string | undefined {
	const match = /^\s*(?:url\(\s*)?(["']?)([^"')\s]+)\1/i.exec(params);
	const url = match?.[2];
	return url && /^\.\.?\//.test(url) ? url : undefined;
}

/** The outermost rule a node is written in, itself included: the rule that writes a theme scope's attribute. */
function outermostRule(node: Node): Rule | undefined {
	let found: Rule | undefined;
	for (let current: Node | undefined = node; current; current = current.parent as Node | undefined) {
		if (current.type === "rule") found = current as Rule;
	}
	return found;
}

/** The nearest rule a node is, or is written in. */
function nearestRule(node: Node): Rule | undefined {
	for (let current: Node | undefined = node; current; current = current.parent as Node | undefined) {
		if (current.type === "rule") return current as Rule;
	}
	return undefined;
}

function hasAncestorIn(rule: Rule, rules: Map<Rule, unknown>): boolean {
	for (let current = rule.parent as Node | undefined; current; current = current.parent as Node | undefined) {
		if (current.type === "rule" && rules.has(current as Rule)) return true;
	}
	return false;
}

/** A registration's name, at the start of its parameters. */
function nameAt(registration: Registration): Finding<Key>["at"] {
	const node: AtRule = registration.node;
	const index = Math.max(node.params.indexOf(registration.name), 0);
	return { node, index, endIndex: index + registration.name.length };
}

function sameArgs(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((one, index) => one === b[index]);
}

/** Each distinct text once, joined with "or": `"a"`, `"a" or "b"`, `"a", "b" or "c"`. */
function orList(texts: readonly string[]): string {
	const distinct = [...new Set(texts)];
	return distinct.length < 2
		? distinct.join("")
		: `${distinct.slice(0, -1).join(", ")} or ${distinct.at(-1) ?? ""}`;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
