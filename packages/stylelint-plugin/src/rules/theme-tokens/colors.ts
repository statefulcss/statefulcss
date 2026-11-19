// Whether a token holds one color, so `light-dark()` can give it both values. Judged from its registration, its value
// and, for a lone `var()`, the token it reads; a token the rule can't tell is treated as no color.
import type { Declaration, Model } from "@statefulcss/core";

/**
 * Whether a token declaration holds one color, the whole value: `light-dark()` takes two colors, so a shadow, a border
 * shorthand or a duration moves as it is, whatever its name says. A registration decides; then the value. A lone
 * `var()` is a color when the token it reads is one: judged the same way where this file declares or registers it,
 * and by that token's name otherwise. The token's own name is no evidence: `--t-color-transition-duration` is a
 * duration.
 */
export function isColorToken(model: Model, declaration: Declaration): boolean {
	return isColorValue(model, declaration.property, declaration.value, new Set());
}

function isColorValue(model: Model, property: string, written: string, seen: Set<string>): boolean {
	const value = written.trim();
	const syntax = registered(model, property);
	if (syntax !== undefined) return /^\s*<color>\s*$/i.test(syntax);
	if (isColor(value)) return true;
	const read = wholeCall(value) === "var" ? /^var\(\s*(--[\w-]+)/i.exec(value)?.[1] : undefined;
	if (read === undefined || seen.has(read)) return false;
	seen.add(read);
	if (registered(model, read) !== undefined) return isColorValue(model, read, "", seen);
	const declared = model.declarations.filter((one) => one.property === read);
	if (declared.length === 0) return namesColor(read);
	return declared.every((one) => isColorValue(model, read, one.value, new Set(seen)));
}

function registered(model: Model, name: string): string | undefined {
	return model.registrations.find((registration) => registration.name === name)?.syntax;
}

/** A name with `color` (or `colour`) among its words: `--t-color-text`, `--t-border-color`. */
function namesColor(name: string): boolean {
	return name
		.toLowerCase()
		.split(/[-_]+/)
		.some((word) => word === "color" || word === "colour");
}

/** A whole value that is one color: a hex color, a color function or a named color. */
function isColor(value: string): boolean {
	if (/^#[\da-f]{3,8}$/i.test(value)) return true;
	const call = wholeCall(value);
	if (call !== undefined && colorFunctions.has(call)) return true;
	return named.has(value.toLowerCase());
}

const colorFunctions: ReadonlySet<string> = new Set(
	"rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix light-dark contrast-color".split(" "),
);

/** The function's name, in lowercase, when the whole value is one call: `rgb(0 0 0 / 0.2)`, not `rgb(…) 0 2px`. */
function wholeCall(value: string): string | undefined {
	const name = /^([a-z-]+)\(/i.exec(value)?.[1];
	if (name === undefined) return undefined;
	let depth = 0;
	for (let index = name.length; index < value.length; index++) {
		const char = value[index];
		if (char === "(") depth++;
		else if (char === ")" && --depth === 0)
			return index === value.length - 1 ? name.toLowerCase() : undefined;
	}
	return undefined;
}

/** CSS's named colors, with `transparent`, `currentcolor` and the system colors. */
const named: ReadonlySet<string> = new Set(
	[
		"transparent currentcolor canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight highlighttext selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue",
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
