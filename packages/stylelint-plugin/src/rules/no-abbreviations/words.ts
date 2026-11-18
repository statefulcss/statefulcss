// The deny list: abbreviations `no-abbreviations` knows, each with the full word it suggests. A deny list, not a
// dictionary, so a brand name or a made-up word is never reported. Most come from Tailwind's vocabulary, where the
// habit comes from. Left out on purpose: HTML element names (`nav`, `img`, `col`, `p`), CSS's own words and units
// (`min`, `max`, `rgb`, `px`, `rad`, `grad`, `lh`), established terms (`id`, `url`, `aria`, `ui`), coordinates (`x`, `y`,
// `z`), and anything a project could mean as a full word (`act`, `pos`, `warn`, `wrap`).

/** Each abbreviation, lowercase, with its full word. */
const single: ReadonlyMap<string, string> = new Map([
	// Colors and surfaces
	["bg", "background"],
	["fg", "foreground"],
	["clr", "color"],
	["txt", "text"],
	["brd", "border"],
	["bdr", "border"],
	["shdw", "shadow"],
	["opac", "opacity"],
	// Emphasis and states
	["prim", "primary"],
	["prm", "primary"],
	["tert", "tertiary"],
	["emph", "emphasis"],
	["hov", "hover"],
	["hvr", "hover"],
	["err", "error"],
	["dflt", "default"],
	// Space and size
	["pad", "padding"],
	["mrg", "margin"],
	["mgn", "margin"],
	["sp", "space"],
	["spc", "space"],
	["w", "width"],
	["h", "height"],
	["sz", "size"],
	["len", "length"],
	["dur", "duration"],
	["anim", "animation"],
	["num", "number"],
	["idx", "index"],
	// Things a component is made of
	["btn", "button"],
	["lbl", "label"],
	["lnk", "link"],
	["ico", "icon"],
	["msg", "message"],
	["hdr", "header"],
	["ftr", "footer"],
	["itm", "item"],
	["elem", "element"],
	["ctl", "control"],
	["ctrl", "control"],
	["dlg", "dialog"],
	["tbl", "table"],
]);

/**
 * Abbreviations with more than one common meaning, lowercase, with the full words they could stand for, the likeliest
 * first. The message lists them all rather than guess: `[data-sort="desc"]` is "descending", `.acc-panel` may be an
 * accordion.
 */
const several: ReadonlyMap<string, readonly string[]> = new Map([
	["acc", ["accent", "accordion", "account"]],
	["sec", ["secondary", "section", "second"]],
	["sel", ["selected", "select", "selection"]],
	["desc", ["description", "descending"]],
	["dis", ["disabled", "display"]],
]);

/** Each abbreviation, lowercase, with the full words it could stand for: one, or several when it's ambiguous. */
export const abbreviations: ReadonlyMap<string, readonly string[]> = new Map([
	...[...single].map(([word, full]): [string, readonly string[]] => [word, [full]]),
	...several,
]);

/**
 * Abbreviations reported only in a custom property's name: elsewhere they're often a full word. `.signature-pad` and
 * `[data-kind="pad"]` name a pad; `--c-card-pad` is the card's padding.
 */
export const propertyOnly: ReadonlySet<string> = new Set(["pad"]);

/**
 * The full form of a T-shirt size, in CSS's own words for font sizes (`x-small`, `xx-large`), or undefined for a word
 * that isn't one: `sm` is `small`, `xl` is `x-large`, and `2xl` and `xxl` are both `xx-large`.
 */
export function fullSize(word: string): string | undefined {
	const named = sizes.get(word);
	if (named) return named;
	const match = /^(?:(\d+)|(x*))x([sl])$/.exec(word);
	if (!match) return undefined;
	const [, count, letters, end] = match;
	const times = count === undefined ? (letters ?? "").length + 1 : Number(count);
	if (times < 1 || times > 9) return undefined;
	return `${"x".repeat(times)}-${end === "s" ? "small" : "large"}`;
}

const sizes = new Map([
	["sm", "small"],
	["md", "medium"],
	["lg", "large"],
]);
