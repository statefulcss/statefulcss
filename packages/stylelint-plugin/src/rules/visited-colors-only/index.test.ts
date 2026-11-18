import { type ExpectedWarning, testRule } from "../../testing/test-rule.js";
import visitedColorsOnly from "./index.js";

const accepted =
	'color properties, such as "color", "background-color", "fill", "stroke", "caret-color" and the border, outline, column-rule, text-decoration and text-emphasis colors';

/** The advice for a custom property whose color property can't be told. */
const unbound = (name: string): string =>
	`Unexpected "${name}" set in ":visited", where the browser ignores custom properties. Set the color property directly instead: ":visited" applies only ${accepted}.`;

/** The warning for a property `:visited` ignores, on the property written at that line and column. */
function ignored(property: string, place: string, line: number, column: number): ExpectedWarning {
	return {
		message: `Unexpected "${property}" in ${place}, where the browser ignores it. ":visited" applies only ${accepted}.`,
		line,
		column,
		endLine: line,
		endColumn: column + property.length,
	};
}

testRule(visitedColorsOnly, {
	accept: [
		// The README's Fixed case.
		{
			description: ":visited ignores custom properties and text-decoration-line",
			code: `
				.link {
					&:visited { color: purple; }
				}
			`,
		},
		// The README's Not reported cases.
		{
			description: "only color properties",
			code: `
				.link {
					&:visited { color: purple; text-decoration-color: purple; }
				}
			`,
		},
		{
			description: "a hover on a visited link, still colors",
			code: `
				.link {
					&:visited:hover { color: purple; }
				}
			`,
		},
		// Beyond the README's cases.
		{
			description: "every color property :visited applies, logical and prefixed forms included",
			code: `
				.link {
					&:visited {
						color: purple;
						background-color: white;
						border-color: purple;
						border-top-color: purple;
						border-inline-start-color: purple;
						border-block-color: purple;
						outline-color: purple;
						column-rule-color: purple;
						text-decoration-color: purple;
						text-emphasis-color: purple;
						caret-color: purple;
						fill: purple;
						stroke: purple;
						-webkit-text-fill-color: purple;
						-webkit-text-stroke-color: purple;
						-webkit-border-before-color: purple;
						-webkit-border-after-color: purple;
						-webkit-border-start-color: purple;
						-webkit-border-end-color: purple;
					}
				}
			`,
		},
		{
			description: "a link that isn't visited applies everything",
			code: `
				.link:not(:visited) { text-decoration-line: none; }
			`,
		},
		{
			description: "a list that also matches on hover applies everything there",
			code: `
				.link:is(:visited, :hover) { text-decoration-line: none; }
			`,
		},
		{
			description: "a selector list with a branch that isn't visited",
			code: `
				.link:visited, .link:hover { text-decoration-line: none; }
			`,
		},
		{
			description: ":has() never matches :visited",
			code: `
				.card:has(:visited) { opacity: 0.8; }
			`,
		},
		{
			description: "a state variable bound once, with the :visited exception",
			code: `
				.link {
					--s-color: blue;
					color: var(--s-color);
					&:hover { --s-color: navy; }
					&:visited { color: purple; }
				}
			`,
		},
		{
			description: "an @include beside the colors",
			code: `
				.link {
					&:visited { @include visited-look; color: purple; }
				}
			`,
		},
		{
			description: "a property SCSS builds",
			code: `
				.link {
					&:visited { #{$side}-color: purple; }
				}
			`,
			skip: { css: "SCSS interpolation", vue: "SCSS interpolation" },
		},
	],
	reject: [
		// The README's Reported case.
		{
			description: ":visited ignores custom properties and text-decoration-line",
			code: `
				.link {
					&:visited {
						--s-color: purple;
						text-decoration-line: none;
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-color" set in ":visited", where the browser ignores custom properties. Set "color" directly instead.',
					line: 3,
					column: 3,
					endLine: 3,
					endColumn: 12,
				},
				ignored("text-decoration-line", '":visited"', 4, 3),
			],
		},
		// Beyond the README's cases.
		{
			description: "a hover on a visited link that sets more than colors",
			code: `
				.link {
					&:visited:hover { opacity: 0.8; }
				}
			`,
			warnings: [ignored("opacity", '":visited:hover"', 2, 20)],
		},
		{
			description: "a visited link written inside :where()",
			code: `
				.link:where(:visited) { opacity: 0.8; }
			`,
			warnings: [ignored("opacity", '":visited"', 1, 25)],
		},
		// WebKit's logical border colors apply; their widths don't.
		{
			description: "a WebKit logical border width in :visited",
			code: `a:visited { -webkit-border-before-color: purple; -webkit-border-before-width: 3px; }`,
			warnings: [ignored("-webkit-border-before-width", '":visited"', 1, 50)],
		},
		{
			description: "a list whose every selector needs :visited",
			code: `
				.link:is(:visited:hover, :visited:focus) { opacity: 0.8; }
			`,
			warnings: [ignored("opacity", '":is(:visited:hover, :visited:focus)"', 1, 44)],
		},
		{
			description: "an element inside a visited link",
			code: `
				a:visited .icon { opacity: 0.8; }
			`,
			warnings: [ignored("opacity", '":visited"', 1, 19)],
		},
		{
			description: "a visited link's pseudo-element",
			code: `
				.link:visited::after { content: "visited"; }
			`,
			warnings: [ignored("content", '":visited"', 1, 24)],
		},
		{
			description: ":visited in capitals",
			code: `
				.link:VISITED { opacity: 0.8; }
			`,
			warnings: [ignored("opacity", '":visited"', 1, 17)],
		},
		{
			description: "a block with an extra class",
			code: `
				.link.is-external:visited { opacity: 0.8; }
			`,
			warnings: [ignored("opacity", '".is-external:visited"', 1, 29)],
		},
		{
			description: "a utility",
			code: `
				@layer utilities {
					.u-link:visited { opacity: 0.8; }
				}
			`,
			warnings: [ignored("opacity", '":visited"', 2, 20)],
		},
		{
			description: "inside a media query",
			code: `
				@media (hover: hover) {
					.link:visited { opacity: 0.8; }
				}
			`,
			warnings: [ignored("opacity", '":visited"', 2, 18)],
		},
		{
			description: "a part in its component's scope",
			code: `
				.card { }
				@scope (.card) to ([data-component]) {
					[data-part="link"]:visited { opacity: 0.8; }
				}
			`,
			warnings: [ignored("opacity", '":visited"', 3, 31)],
		},
		{
			description: "a shorthand, whose color alone applies",
			code: `
				.link {
					&:visited {
						border: 1px solid purple;
						text-decoration: none;
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "border" in ":visited", where only its color applies and the rest is ignored. Write "border-color" for the color, and set anything else outside ":visited".',
					line: 3,
					column: 3,
					endLine: 3,
					endColumn: 9,
				},
				{
					message:
						'Unexpected "text-decoration" in ":visited", where only its color applies and the rest is ignored. Write "text-decoration-color" for the color, and set anything else outside ":visited".',
					line: 4,
					column: 3,
					endLine: 4,
					endColumn: 18,
				},
			],
		},
		{
			description: "a custom property named for no color property",
			code: `
				.link {
					&:visited { --s-opacity: 0.8; }
				}
			`,
			warnings: [
				{
					message: unbound("--s-opacity"),
					line: 2,
					column: 14,
					endLine: 2,
					endColumn: 25,
				},
			],
		},
		// A custom property's advice names the property it's bound to, never one guessed from its name.
		{
			description: "a private bound to background-color, though its name ends in color",
			code: `
				a { background-color: var(--_badge-color); }
				a:visited { --_badge-color: purple; }
			`,
			warnings: [
				{
					message:
						'Unexpected "--_badge-color" set in ":visited", where the browser ignores custom properties. Set "background-color" directly instead.',
					line: 2,
					column: 13,
					endLine: 2,
					endColumn: 27,
				},
			],
		},
		{
			description: "a private bound through a shorthand to its color",
			code: `
				.badge {
					border: 1px solid var(--_edge);
					&:visited { --_edge: purple; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--_edge" set in ":visited", where the browser ignores custom properties. Set "border-color" directly instead.',
					line: 3,
					column: 14,
					endLine: 3,
					endColumn: 21,
				},
			],
		},
		{
			description: "a private read by no color property, or by two",
			code: `
				.badge {
					color: var(--_tint);
					border-color: var(--_tint);
					&:visited { --_tint: purple; --_badge-color: purple; }
				}
			`,
			warnings: [
				{ message: unbound("--_tint"), line: 4, column: 14, endLine: 4, endColumn: 21 },
				{ message: unbound("--_badge-color"), line: 4, column: 31, endLine: 4, endColumn: 45 },
			],
		},
		{
			description: "a part variable named for a color property",
			code: `
				.link {
					&:visited { --p-after-border-color: purple; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-after-border-color" set in ":visited", where the browser ignores custom properties. Set "border-color" directly instead.',
					line: 2,
					column: 14,
					endLine: 2,
					endColumn: 36,
				},
			],
		},
		{
			description: "a selector list of visited links reports once",
			code: `
				.link:visited, .link:visited:hover { opacity: 0.8; }
			`,
			warnings: [ignored("opacity", '":visited" and ":visited:hover"', 1, 38)],
		},
		{
			description: "a selector list on two components reports once",
			code: `
				.card:visited, .button:visited { opacity: 0.8; }
			`,
			warnings: [ignored("opacity", '":visited"', 1, 34)],
		},
	],
});
