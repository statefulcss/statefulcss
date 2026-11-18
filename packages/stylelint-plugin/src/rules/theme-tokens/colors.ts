// Whether a token holds a color, so `light-dark()` can give it both values. Judged from its name, its value and its
// registration; a token the rule can't tell is treated as no color.
import type { Declaration, Model } from "@statefulcss/core";

/** Whether a token declaration holds a color. */
export function isColorToken(model: Model, declaration: Declaration): boolean {
	const { property, value } = declaration;
	if (namesColor(property)) return true;
	const syntax = model.registrations.find((registration) => registration.name === property)?.syntax;
	if (syntax !== undefined && /<color>/i.test(syntax)) return true;
	return isColor(value.trim());
}

/** A name with `color` (or `colour`) among its words: `--t-color-text`, `--t-border-color`. */
function namesColor(name: string): boolean {
	return name
		.toLowerCase()
		.split(/[-_]+/)
		.some((word) => word === "color" || word === "colour");
}

/** A value that is a color: a hex color, a color function, a named color, or a `var()` of a color token. */
function isColor(value: string): boolean {
	if (/^#[\da-f]{3,8}$/i.test(value)) return true;
	if (/^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|contrast-color)\(/i.test(value))
		return true;
	const variable = /^var\(\s*(--[\w-]+)/i.exec(value)?.[1];
	if (variable !== undefined) return namesColor(variable);
	return named.has(value.toLowerCase());
}

/** CSS's named colors, with `transparent` and `currentcolor`. */
const named: ReadonlySet<string> = new Set(
	[
		"transparent currentcolor aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue",
		"blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue",
		"darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid",
		"darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink",
		"deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold",
		"goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush",
		"lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey",
		"lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime",
		"limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen",
		"mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin",
		"navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise",
		"palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue",
		"saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow",
		"springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen",
	]
		.join(" ")
		.split(" "),
);
