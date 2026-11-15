// What each shorthand sets, and which properties set the same thing. A table behind two functions: it isn't part of
// the model, and a shorthand it doesn't list is left alone, never guessed at.

const sides = ["top", "right", "bottom", "left"] as const;
const flow = ["block-start", "block-end", "inline-start", "inline-end"] as const;
const borderParts = ["width", "style", "color"] as const;

/** A shorthand's direct parts, which may be shorthands themselves. */
const shorthands: Record<string, readonly string[]> = {
	...box("margin"),
	...box("padding"),
	...box("scroll-margin"),
	...box("scroll-padding"),
	inset: [...sides],
	"inset-block": ["inset-block-start", "inset-block-end"],
	"inset-inline": ["inset-inline-start", "inset-inline-end"],

	border: [...sides.map((side) => `border-${side}`), "border-image"],
	"border-block": ["border-block-start", "border-block-end"],
	"border-inline": ["border-inline-start", "border-inline-end"],
	...Object.fromEntries(
		[...sides, ...flow].map((side) => [
			`border-${side}`,
			borderParts.map((part) => `border-${side}-${part}`),
		]),
	),
	...Object.fromEntries(
		borderParts.flatMap((part) => [
			[`border-${part}`, sides.map((side) => `border-${side}-${part}`)],
			[`border-block-${part}`, [`border-block-start-${part}`, `border-block-end-${part}`]],
			[`border-inline-${part}`, [`border-inline-start-${part}`, `border-inline-end-${part}`]],
		]),
	),
	"border-radius": [
		"border-top-left-radius",
		"border-top-right-radius",
		"border-bottom-right-radius",
		"border-bottom-left-radius",
	],
	"border-image": [
		"border-image-source",
		"border-image-slice",
		"border-image-width",
		"border-image-outset",
		"border-image-repeat",
	],
	outline: ["outline-width", "outline-style", "outline-color"],
	"column-rule": ["column-rule-width", "column-rule-style", "column-rule-color"],
	columns: ["column-width", "column-count"],

	background: [
		"background-color",
		"background-image",
		"background-position",
		"background-size",
		"background-repeat",
		"background-attachment",
		"background-origin",
		"background-clip",
	],
	"background-position": ["background-position-x", "background-position-y"],
	mask: [
		"mask-image",
		"mask-mode",
		"mask-repeat",
		"mask-position",
		"mask-clip",
		"mask-origin",
		"mask-size",
		"mask-composite",
	],

	// `font` also resets the properties it can't set (CSS Fonts, "reset-only sub-properties"), so it overlaps them too.
	font: [
		"font-style",
		"font-variant",
		"font-weight",
		"font-stretch",
		"font-size",
		"line-height",
		"font-family",
		"font-feature-settings",
		"font-kerning",
		"font-language-override",
		"font-optical-sizing",
		"font-size-adjust",
		"font-variation-settings",
	],
	"font-variant": [
		"font-variant-ligatures",
		"font-variant-position",
		"font-variant-caps",
		"font-variant-numeric",
		"font-variant-alternates",
		"font-variant-east-asian",
		"font-variant-emoji",
	],
	"text-decoration": [
		"text-decoration-line",
		"text-decoration-style",
		"text-decoration-color",
		"text-decoration-thickness",
	],
	"text-emphasis": ["text-emphasis-style", "text-emphasis-color"],
	"list-style": ["list-style-type", "list-style-position", "list-style-image"],

	flex: ["flex-grow", "flex-shrink", "flex-basis"],
	"flex-flow": ["flex-direction", "flex-wrap"],
	gap: ["row-gap", "column-gap"],
	grid: ["grid-template", "grid-auto-rows", "grid-auto-columns", "grid-auto-flow"],
	"grid-template": ["grid-template-rows", "grid-template-columns", "grid-template-areas"],
	"grid-area": ["grid-row-start", "grid-column-start", "grid-row-end", "grid-column-end"],
	"grid-row": ["grid-row-start", "grid-row-end"],
	"grid-column": ["grid-column-start", "grid-column-end"],
	"place-content": ["align-content", "justify-content"],
	"place-items": ["align-items", "justify-items"],
	"place-self": ["align-self", "justify-self"],

	overflow: ["overflow-x", "overflow-y"],
	"overscroll-behavior": ["overscroll-behavior-x", "overscroll-behavior-y"],
	"contain-intrinsic-size": ["contain-intrinsic-width", "contain-intrinsic-height"],
	container: ["container-name", "container-type"],

	transition: [
		"transition-property",
		"transition-duration",
		"transition-timing-function",
		"transition-delay",
		"transition-behavior",
	],
	animation: [
		"animation-name",
		"animation-duration",
		"animation-timing-function",
		"animation-delay",
		"animation-iteration-count",
		"animation-direction",
		"animation-fill-mode",
		"animation-play-state",
		"animation-timeline",
	],
};

/** `margin`, `margin-block` and `margin-inline`, for any property with four sides. */
function box(name: string): Record<string, readonly string[]> {
	return {
		[name]: sides.map((side) => `${name}-${side}`),
		[`${name}-block`]: [`${name}-block-start`, `${name}-block-end`],
		[`${name}-inline`]: [`${name}-inline-start`, `${name}-inline-end`],
	};
}

/**
 * Longhands that set the same thing in two ways: by physical side and by flow. Which side `inline-start` is depends
 * on the writing mode, so a logical property overlaps every physical one of its kind.
 */
const kinds: readonly { readonly physical: readonly string[]; readonly logical: readonly string[] }[] = [
	...["margin", "padding", "scroll-margin", "scroll-padding"].map((name) => ({
		physical: sides.map((side) => `${name}-${side}`),
		logical: flow.map((side) => `${name}-${side}`),
	})),
	{ physical: [...sides], logical: flow.map((side) => `inset-${side}`) },
	...borderParts.map((part) => ({
		physical: sides.map((side) => `border-${side}-${part}`),
		logical: flow.map((side) => `border-${side}-${part}`),
	})),
	{
		physical: shorthands["border-radius"] ?? [],
		logical: [
			"border-start-start-radius",
			"border-start-end-radius",
			"border-end-start-radius",
			"border-end-end-radius",
		],
	},
	...["", "min-", "max-"].map((prefix) => ({
		physical: [`${prefix}width`, `${prefix}height`],
		logical: [`${prefix}inline-size`, `${prefix}block-size`],
	})),
	{ physical: ["overflow-x", "overflow-y"], logical: ["overflow-inline", "overflow-block"] },
	{
		physical: ["overscroll-behavior-x", "overscroll-behavior-y"],
		logical: ["overscroll-behavior-inline", "overscroll-behavior-block"],
	},
	{
		physical: ["contain-intrinsic-width", "contain-intrinsic-height"],
		logical: ["contain-intrinsic-inline-size", "contain-intrinsic-block-size"],
	},
];

const kindOf = new Map<string, { kind: number; logical: boolean }>(
	kinds.flatMap(({ physical, logical }, kind) => [
		...physical.map((property): [string, { kind: number; logical: boolean }] => [
			property,
			{ kind, logical: false },
		]),
		...logical.map((property): [string, { kind: number; logical: boolean }] => [
			property,
			{ kind, logical: true },
		]),
	]),
);

// Looked up by the table's own keys only: `constructor` is a property name like any other, not a shorthand.
const table = new Map(Object.entries(shorthands));

/**
 * Every longhand a shorthand sets, through the shorthands under it: `border` sets `border-top-width`. Empty for a
 * longhand, a custom property, and a shorthand this table doesn't list.
 */
export function longhandsOf(property: string): readonly string[] {
	return (table.get(property.trim().toLowerCase()) ?? []).flatMap((part) =>
		table.has(part) ? longhandsOf(part) : [part],
	);
}

/**
 * Whether two properties set the same thing: they are the same property, one is a shorthand of the other, they are
 * shorthands that share a longhand, or one is logical and the other physical (`padding` with `padding-inline-start`).
 */
export function overlaps(a: string, b: string): boolean {
	const first = leavesOf(a);
	const second = leavesOf(b);
	return first.some((one) =>
		second.some((other) => {
			if (one === other) return true;
			const [left, right] = [kindOf.get(one), kindOf.get(other)];
			return (
				left !== undefined &&
				right !== undefined &&
				left.kind === right.kind &&
				left.logical !== right.logical
			);
		}),
	);
}

/** A shorthand's longhands, or the property itself. */
function leavesOf(property: string): readonly string[] {
	// A custom property's name is case-sensitive, and it overlaps nothing but itself.
	const name = property.trim().startsWith("--") ? property.trim() : property.trim().toLowerCase();
	const longhands = longhandsOf(name);
	return longhands.length > 0 ? longhands : [name];
}
