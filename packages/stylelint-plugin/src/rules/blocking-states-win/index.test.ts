import { testRule } from "../../testing/test-rule.js";
import blockingStatesWin from "./index.js";

const guard = '&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert]))';
const unguarded = (condition: string, element: string, wanted = guard) =>
	`Unexpected "${condition}" on ${element} outside a guard, so a blocked element still reacts to it. Write it inside "${wanted}".`;
const split = (condition: string, interaction: string, rest: string, element = '".button"') =>
	`Unexpected "${condition}" on ${element} outside a guard, so a blocked element still reacts to ${interaction}. Split it: write ${interaction} inside "${guard}", and ${rest} outside it.`;
const incomplete = (element: string, missing: string) =>
	`Unexpected guard on ${element} leaving out ${missing}, so interaction states still apply while they hold. Add them to its ":not()".`;

/** Lines that a case puts in the Button, each at the Button's level. */
const lines = (...each: string[]) => each.join("\n\t\t\t");

/** A blocked Button around what a case puts at line 6. */
const button = (body: string, fixed = body) => ({
	code: `
		.button {
			--s-color: var(--_color);
			--s-opacity: 1;
			color: var(--s-color);
			opacity: var(--s-opacity);
			${body}
			&:disabled { --s-opacity: 0.5; }
		}
	`,
	fixed: `
		.button {
			--s-color: var(--_color);
			--s-opacity: 1;
			color: var(--s-color);
			opacity: var(--s-opacity);
			${fixed}
			&:disabled { --s-opacity: 0.5; }
		}
	`,
});

testRule(blockingStatesWin, {
	accept: [
		// The rules page's Fixed cases.
		{
			description: "hover isn't guarded",
			code: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-background-color: var(--_background-color-hover); }
					}
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "a blocking state that sets back what hover changed",
			code: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-background-color: var(--_background-color-hover); }
					}
					&[aria-pressed="true"] { --s-background-color: var(--_background-color-pressed); }
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "focus written inside the guard",
			code: `
				.button {
					--s-outline-width: 0;
					--s-opacity: 1;
					outline-width: var(--s-outline-width);
					opacity: var(--s-opacity);
					&:focus-visible { --s-outline-width: 2px; }
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		// The decided form, and the rules page's Not reported cases.
		{
			description: "a semantic state with a guard, the decided form",
			code: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-background-color: var(--_background-color-hover); }
					}
					&[aria-pressed="true"] { --s-background-color: var(--_background-color-pressed); }
					&:disabled, &[aria-disabled="true"], &[data-loading] { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "by default, an element with interaction states and no blocking state block",
			code: `
				.link {
					--s-color: var(--t-color-link);
					color: var(--s-color);
					&:hover { --s-color: var(--t-color-link-hover); }
					&:active { --s-color: var(--t-color-link-active); }
				}
			`,
		},
		{
			description: "hover inside @media (hover: hover), inside or around the guard",
			code: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					@media (hover: hover) {
						${guard} {
							&:hover { --s-background-color: var(--_background-color-hover); }
						}
					}
					${guard} {
						@media (hover: hover) {
							&:active { --s-background-color: var(--_background-color-active); }
						}
					}
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		// The part and its component's query variable, from the rules page.
		{
			description: "a part whose component has blocking states waits for its query variable",
			code: `
				.tabs {
					--q-tabs-blocked: false;
					--s-opacity: 1;
					--p-tab-color: var(--t-color-text-muted);
					opacity: var(--s-opacity);
					&[aria-disabled="true"] { --q-tabs-blocked: true; --s-opacity: 0.5; --p-tab-color: var(--t-color-text-disabled); }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--p-tab-color);
						color: var(--s-color);
						${guard} {
							@container style(--q-tabs-blocked: false) {
								&:hover { --s-color: var(--t-color-text); }
							}
						}
					}
				}
			`,
		},
		{
			description: "a blocking state reached through :has(), listed in the root's guard",
			code: `
				.field {
					--p-label-color: var(--t-color-foreground-base);
					--s-opacity: 1;
					--q-field-blocked: false;
					opacity: var(--s-opacity);
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert], :has(:where([data-part="input"]):disabled))) {
						&:hover { --p-label-color: var(--t-color-foreground-strong); }
					}
					&:has(:where([data-part="input"]):disabled) { --s-opacity: 0.6; --q-field-blocked: true; }
				}
			`,
		},
		// Beyond the rules page.
		{
			description: "a :has() state in the guard, quoted differently from its block",
			code: `
				.field {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert], :has(:where([data-part=input]):disabled))) {
						&:hover { --s-color: var(--_color-hover); }
					}
					&:has(:where([data-part="input"]):disabled) { --s-opacity: 0.6; }
				}
			`,
		},
		{
			description: "a guard written in a flat selector",
			code: `
				.button:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])):hover { --s-color: red; }
				.button { --s-color: blue; color: var(--s-color); }
				.button:disabled { --s-opacity: 0.5; }
			`,
		},
		{
			description: "a pseudo-element's interaction state, guarded on its host",
			code: `
				.button {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					${guard} {
						&:hover::after { --s-opacity: 1; }
					}
					&:disabled { --s-opacity: 0.5; }
					&::after { --s-opacity: 0; content: ""; opacity: var(--s-opacity); }
				}
			`,
		},
		{
			description: "a hover on a pseudo-element, guarded on its host",
			code: button(lines(`${guard}::file-selector-button {`, "\t&:hover { color: red; }", "}")).code,
		},
		{
			description: "a blocking state whose value differs from the default changes its own look",
			code: `
				.button {
					--s-color: var(--_color);
					color: var(--s-color);
					${guard} {
						&:hover { --s-color: var(--_color-hover); }
					}
					&:disabled { --s-color: var(--_color-disabled); }
				}
			`,
		},
		{
			description: "a utility and a global element are left alone",
			code: `
				a:hover { color: red; }
				a:disabled { opacity: 0.5; }
				@layer utilities {
					.u-link:hover { color: red; }
					.u-link:disabled { opacity: 0.5; }
				}
			`,
		},
		{
			description: "the look at rest, written with :not(:hover)",
			code: `
				.button {
					--s-opacity: 1;
					--s-color: var(--_color);
					color: var(--s-color);
					opacity: var(--s-opacity);
					&:not(:hover) { --s-color: var(--_color-rest); }
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "a guard on the root doesn't make a part's focus sit inside a guard",
			code: `
				.tabs { --s-opacity: 1; opacity: var(--s-opacity); }
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-outline-width: 0;
						outline-width: var(--s-outline-width);
						&:focus-visible { --s-outline-width: 2px; }
					}
				}
			`,
		},
	],
	reject: [
		// The rules page's Reported cases.
		{
			description: "hover isn't guarded",
			code: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					&:hover { --s-background-color: var(--_background-color-hover); }
					&:disabled { --s-opacity: 0.5; }
				}
			`,
			warnings: [{ message: unguarded(":hover", '".button"'), line: 6, column: 3, endLine: 6, endColumn: 9 }],
			fixed: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-background-color: var(--_background-color-hover); }
					}
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "the guard leaves a blocking state out",
			code: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					&:where(:not(:disabled, [aria-disabled="true"])) {
						&:hover { --s-background-color: var(--_background-color-hover); }
					}
					&:disabled { --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected guard on ".button" leaving out "[data-loading]" and "[inert]", so interaction states still apply while they hold. Add them to its ":not()".',
					line: 6,
					column: 10,
					endLine: 6,
					endColumn: 49,
				},
			],
			fixed: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-background-color: var(--_background-color-hover); }
					}
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "a blocking state that sets back what hover changed",
			code: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-background-color: var(--_background-color-hover); }
					}
					&[aria-pressed="true"] { --s-background-color: var(--_background-color-pressed); }
					&:disabled { --s-background-color: var(--_background-color); --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-background-color" set back to its default in ":disabled", which ":hover" and "[aria-pressed="true"]" also write. Remove it: the guard keeps interaction states off, and a blocking state sets only its own look.',
					line: 10,
					column: 15,
					endLine: 10,
					endColumn: 62,
				},
			],
		},
		{
			description: "focus written inside the guard",
			code: `
				.button {
					--s-outline-width: 0;
					--s-opacity: 1;
					outline-width: var(--s-outline-width);
					opacity: var(--s-opacity);
					${guard} {
						&:focus-visible { --s-outline-width: 2px; }
					}
					&:disabled { --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected ":focus-visible" inside a guard on ".button": a blocked element that stays focusable loses its focus style. Write it outside the guard.',
					line: 7,
					column: 4,
					endLine: 7,
					endColumn: 18,
				},
			],
		},
		// Beyond the rules page.
		{
			description: "hover and active, which move into one guard in their order",
			code: `
				.button {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					&:hover { --s-color: var(--_color-hover); }
					&:active { --s-color: var(--_color-active); }
					&[data-loading] { --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{ message: unguarded(":hover", '".button"'), line: 6, column: 3, endLine: 6, endColumn: 9 },
				{ message: unguarded(":active", '".button"'), line: 7, column: 3, endLine: 7, endColumn: 10 },
			],
			fixed: `
				.button {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-color: var(--_color-hover); }
						&:active { --s-color: var(--_color-active); }
					}
					&[data-loading] { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "hover in @media (hover: hover) with no guard, wrapped inside the query",
			code: `
				.button {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					@media (hover: hover) {
						&:hover { --s-color: var(--_color-hover); }
					}
					&:disabled { --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{ message: unguarded(":hover", '".button"'), line: 7, column: 4, endLine: 7, endColumn: 10 },
			],
			fixed: `
				.button {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					@media (hover: hover) {
						${guard} {
							&:hover { --s-color: var(--_color-hover); }
						}
					}
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "a flat selector with no guard, which --fix leaves to the author",
			code: `
				.button { --s-color: var(--_color); --s-opacity: 1; color: var(--s-color); opacity: var(--s-opacity); }
				.button:hover { --s-color: var(--_color-hover); }
				.button:disabled { --s-opacity: 0.5; }
			`,
			warnings: [
				{ message: unguarded(":hover", '".button"'), line: 2, column: 8, endLine: 2, endColumn: 14 },
			],
		},
		{
			description: "a rule that lists hover with focus, which --fix leaves to the author",
			code: `
				.button {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					&:hover, &:focus-visible { --s-color: var(--_color-hover); }
					&:disabled { --s-opacity: 0.5; }
				}
			`,
			warnings: [{ message: unguarded(":hover", '".button"'), line: 6, column: 3, endLine: 6, endColumn: 9 }],
		},
		{
			description: "a list that holds hover and focus, which --fix leaves to the author",
			code: `
				.button {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					&:is(:hover, :focus-visible) { --s-color: var(--_color-hover); }
					&:disabled { --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{
					message: split(":is(:hover, :focus-visible)", '":hover"', '":focus-visible"'),
					line: 6,
					column: 3,
					endLine: 6,
					endColumn: 30,
				},
			],
		},
		{
			description: "a pseudo-element's hover on a blocked host",
			code: `
				.button {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&::after { --s-opacity: 0; content: ""; opacity: var(--s-opacity); }
					&:hover::after { --s-opacity: 1; }
					&:disabled { --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{
					message: unguarded(":hover", '".button::after"'),
					line: 5,
					column: 3,
					endLine: 5,
					endColumn: 9,
				},
			],
			fixed: `
				.button {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&::after { --s-opacity: 0; content: ""; opacity: var(--s-opacity); }
					${guard} {
						&:hover::after { --s-opacity: 1; }
					}
					&:disabled { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "a selector list of two components, reported once",
			code: `
				.card, .note {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					&:hover { --s-color: var(--_color-hover); }
					&[inert] { --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{
					message: unguarded(":hover", '".card" and ".note"'),
					line: 6,
					column: 3,
					endLine: 6,
					endColumn: 9,
				},
			],
			fixed: `
				.card, .note {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-color: var(--_color-hover); }
					}
					&[inert] { --s-opacity: 0.5; }
				}
			`,
		},
		{
			description: "a blocking state reached through :has() that the root's guard leaves out",
			code: `
				.field {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-color: var(--_color-hover); }
					}
					&:has(:where([data-part="input"]):disabled) { --s-opacity: 0.6; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected guard on ".field" leaving out ":has(:where([data-part="input"]):disabled)", so interaction states still apply while they hold. Add them to its ":not()".',
					line: 6,
					column: 10,
					endLine: 6,
					endColumn: 74,
				},
			],
			fixed: `
				.field {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert], :has(:where([data-part="input"]):disabled))) {
						&:hover { --s-color: var(--_color-hover); }
					}
					&:has(:where([data-part="input"]):disabled) { --s-opacity: 0.6; }
				}
			`,
		},
		{
			description: "a part's guarded hover outside a style query on its component's query variable",
			code: `
				.tabs {
					--q-tabs-blocked: false;
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&[aria-disabled="true"] { --q-tabs-blocked: true; --s-opacity: 0.5; }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--t-color-text-muted);
						color: var(--s-color);
						${guard} {
							&:hover { --s-color: var(--t-color-text); }
						}
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected ":hover" on part "tab" outside a style query on "--q-tabs-blocked", so it applies while ".tabs" is blocked. Write it inside "@container style(--q-tabs-blocked: false)".',
					line: 12,
					column: 5,
					endLine: 12,
					endColumn: 11,
				},
			],
		},
		{
			description: "a part's hover with no guard, whose component's blocking states set no query variable",
			code: `
				.tabs {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&[aria-disabled="true"] { --s-opacity: 0.5; }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--t-color-text-muted);
						color: var(--s-color);
						&:hover { --s-color: var(--t-color-text); }
					}
				}
			`,
			warnings: [
				{ message: unguarded(":hover", 'part "tab"'), line: 10, column: 4, endLine: 10, endColumn: 10 },
				{
					message:
						'Unexpected ":hover" on part "tab", which applies while ".tabs" is blocked: its blocking states set no query variable. Set "--q-tabs-blocked" in them, and write ":hover" inside a style query on it.',
					line: 10,
					column: 4,
					endLine: 10,
					endColumn: 10,
				},
			],
			fixed: `
				.tabs {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&[aria-disabled="true"] { --s-opacity: 0.5; }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--t-color-text-muted);
						color: var(--s-color);
						${guard} {
							&:hover { --s-color: var(--t-color-text); }
						}
					}
				}
			`,
		},
		{
			description: "a blocking query variable read with var(), and one with no default on the root",
			code: `
				.tabs {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&[aria-disabled="true"] { --q-tabs-blocked: true; --s-opacity: 0.5; }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--t-color-text-muted);
						color: var(--s-color);
						${guard} {
							@container style(--q-tabs-blocked: false) {
								&:hover { --s-color: var(--t-color-text); }
							}
						}
						&::after { content: var(--q-tabs-blocked); }
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--q-tabs-blocked" set in "[aria-disabled="true"]" with no default on ".tabs". Declare its default in the block of ".tabs", so a nested component never inherits an outer one\'s value.',
					line: 4,
					column: 28,
					endLine: 4,
					endColumn: 44,
				},
				{
					message:
						'Unexpected "--q-tabs-blocked" read with "var()". A query variable that blocking states set is only queried, with "@container style()".',
					line: 15,
					column: 23,
					endLine: 15,
					endColumn: 44,
				},
			],
		},
		// B01: a disable comment keeps its rule where the author wrote it. "hover and active" above is the control.
		{
			description: "a hover kept on purpose with a disable comment stays, and active is wrapped alone",
			...button(
				lines(
					"/* stylelint-disable-next-line statefulcss/blocking-states-win -- keep the tooltip */",
					"&:hover { --s-color: var(--_color-hover); }",
					"&:active { --s-color: var(--_color-active); }",
				),
				lines(
					"/* stylelint-disable-next-line statefulcss/blocking-states-win -- keep the tooltip */",
					"&:hover { --s-color: var(--_color-hover); }",
					`${guard} {`,
					"\t&:active { --s-color: var(--_color-active); }",
					"}",
				),
			),
			warnings: [
				{ message: unguarded(":active", '".button"'), line: 8, column: 3, endLine: 8, endColumn: 10 },
			],
		},
		{
			description: "a hover under another rule's disable-next-line comment, which --fix leaves to the author",
			code: button(lines("/* stylelint-disable-next-line color-no-hex */", "&:hover { --s-color: #fff; }"))
				.code,
			warnings: [{ message: unguarded(":hover", '".button"'), line: 7, column: 3, endLine: 7, endColumn: 9 }],
		},
		{
			description: "the same hover with no disable comment, wrapped",
			...button("&:hover { --s-color: #fff; }", lines(`${guard} {`, "\t&:hover { --s-color: #fff; }", "}")),
			warnings: [{ message: unguarded(":hover", '".button"'), line: 6, column: 3, endLine: 6, endColumn: 9 }],
		},
		{
			description: "a hover followed by a disable-line comment on its line, which --fix leaves to the author",
			code: button("&:hover { --s-color: #fff; } /* stylelint-disable-line color-no-hex */").code,
			warnings: [{ message: unguarded(":hover", '".button"'), line: 6, column: 3, endLine: 6, endColumn: 9 }],
		},
		{
			description: "a hover holding a disable comment, which --fix leaves to the author",
			code: button(
				lines("&:hover {", "\t/* stylelint-disable-next-line color-no-hex */", "\t--s-color: #fff;", "}"),
			).code,
			warnings: [{ message: unguarded(":hover", '".button"'), line: 6, column: 3, endLine: 6, endColumn: 9 }],
		},

		// B02: only a selector whose every alternative is an interaction state is guarded whole.
		{
			description: "a list of hover and a semantic state, which --fix leaves to the author",
			code: button('&:is(:hover, [aria-pressed="true"]) { --s-color: var(--_color-hover); }').code,
			warnings: [
				{
					message: split(':is(:hover, [aria-pressed="true"])', '":hover"', '"[aria-pressed="true"]"'),
					line: 6,
					column: 3,
					endLine: 6,
					endColumn: 37,
				},
			],
		},
		{
			description: "the same list in the other order, reported the same",
			code: button('&:is([aria-pressed="true"], :hover) { --s-color: var(--_color-hover); }').code,
			warnings: [
				{
					message: split(':is([aria-pressed="true"], :hover)', '":hover"', '"[aria-pressed="true"]"'),
					line: 6,
					column: 3,
					endLine: 6,
					endColumn: 37,
				},
			],
		},
		{
			description: "a :where() list of hover and a semantic state, which --fix leaves to the author",
			code: button('&:where(:hover, [aria-pressed="true"]) { --s-color: var(--_color-hover); }').code,
			warnings: [
				{
					message: split(':where(:hover, [aria-pressed="true"])', '":hover"', '"[aria-pressed="true"]"'),
					line: 6,
					column: 3,
					endLine: 6,
					endColumn: 40,
				},
			],
		},
		{
			description: "a :where() list of interaction states only, wrapped",
			...button(
				"&:where(:hover, :active) { --s-color: var(--_color-hover); }",
				lines(`${guard} {`, "\t&:where(:hover, :active) { --s-color: var(--_color-hover); }", "}"),
			),
			warnings: [
				{
					message: unguarded(":where(:hover, :active)", '".button"'),
					line: 6,
					column: 3,
					endLine: 6,
					endColumn: 26,
				},
			],
		},
		{
			description: "an incomplete guard around hover or focus, which --fix doesn't complete",
			code: button("&:where(:not(:disabled)):is(:hover, :focus-visible) { --s-color: var(--_color-hover); }")
				.code,
			warnings: [
				{
					message: incomplete('".button"', '"[aria-disabled="true"]", "[data-loading]" and "[inert]"'),
					line: 6,
					column: 10,
					endLine: 6,
					endColumn: 25,
				},
				{
					message:
						'Unexpected ":is(:hover, :focus-visible)" inside a guard on ".button": a blocked element that stays focusable loses its ":focus-visible" style. Split it: keep ":hover" inside the guard, and write ":focus-visible" outside it.',
					line: 6,
					column: 26,
					endLine: 6,
					endColumn: 53,
				},
			],
		},
		{
			description: "an incomplete guard around hover alone, completed",
			...button(
				"&:where(:not(:disabled)):hover { --s-color: var(--_color-hover); }",
				'&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])):hover { --s-color: var(--_color-hover); }',
			),
			warnings: [
				{
					message: incomplete('".button"', '"[aria-disabled="true"]", "[data-loading]" and "[inert]"'),
					line: 6,
					column: 10,
					endLine: 6,
					endColumn: 25,
				},
			],
		},

		// B04: a hover on a pseudo-element itself needs its guard on the host, which a wrap where it stands can't write.
		// "a pseudo-element's hover on a blocked host" above is the control.
		{
			description: "a hover nested in a pseudo-element, which --fix leaves to the author",
			code: button(lines("&::file-selector-button {", "\t&:hover { color: red; }", "}")).code,
			warnings: [
				{
					message: unguarded(":hover", '".button::file-selector-button"'),
					line: 7,
					column: 4,
					endLine: 7,
					endColumn: 10,
				},
			],
		},

		// B05: a guard written once for a selector list.
		{
			description:
				"a guard shared by components whose blocking states differ, which --fix leaves to the author",
			code: `
				.a, .b {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-color: var(--_color-hover); }
					}
				}
				.a { &:has(:where([data-part="field"]):disabled) { --s-opacity: 0.5; } }
				.b { &:has(:where([data-part="control"]):disabled) { --s-opacity: 0.5; } }
			`,
			warnings: [
				{
					message:
						'Unexpected guard on ".a" and ".b" leaving out ":has(:where([data-part="field"]):disabled)" and ":has(:where([data-part="control"]):disabled)", so interaction states still apply while they hold. The elements sharing it have different blocking states: write a guard for each, listing its own.',
					line: 6,
					column: 10,
					endLine: 6,
					endColumn: 74,
				},
			],
		},
		{
			description: "a guard shared by components with the same blocking states, completed for both",
			code: `
				.a, .b {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-color: var(--_color-hover); }
					}
				}
				.a { &:has(:where([data-part="field"]):disabled) { --s-opacity: 0.5; } }
				.b { &:has(:where([data-part="field"]):disabled) { --s-opacity: 0.5; } }
			`,
			warnings: [
				{
					message: incomplete('".a" and ".b"', '":has(:where([data-part="field"]):disabled)"'),
					line: 6,
					column: 10,
					endLine: 6,
					endColumn: 74,
				},
			],
			fixed: `
				.a, .b {
					--s-color: var(--_color);
					--s-opacity: 1;
					color: var(--s-color);
					opacity: var(--s-opacity);
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert], :has(:where([data-part="field"]):disabled))) {
						&:hover { --s-color: var(--_color-hover); }
					}
				}
				.a { &:has(:where([data-part="field"]):disabled) { --s-opacity: 0.5; } }
				.b { &:has(:where([data-part="field"]):disabled) { --s-opacity: 0.5; } }
			`,
		},
	],
});

// The strict level: every element with an interaction state, whether or not it has a blocking state block.
testRule(blockingStatesWin, {
	settings: { strict: true },
	accept: [
		{
			description: "in strict mode, a guarded hover with no blocking state block",
			code: `
				.link {
					--s-color: var(--t-color-link);
					color: var(--s-color);
					${guard} {
						&:hover { --s-color: var(--t-color-link-hover); }
					}
					&:focus-visible { --s-color: var(--t-color-link-focus); }
				}
			`,
		},
	],
	reject: [
		{
			description: "in strict mode, hover with no guard and no blocking state block",
			code: `
				.link {
					--s-color: var(--t-color-link);
					color: var(--s-color);
					&:hover { --s-color: var(--t-color-link-hover); }
				}
			`,
			warnings: [{ message: unguarded(":hover", '".link"'), line: 4, column: 3, endLine: 4, endColumn: 9 }],
			fixed: `
				.link {
					--s-color: var(--t-color-link);
					color: var(--s-color);
					${guard} {
						&:hover { --s-color: var(--t-color-link-hover); }
					}
				}
			`,
		},
	],
});

// B03: with no blocking states configured there's nothing to guard against, in either level. The strict level's
// reported hover above, with the default list, is the control.
const nothingToGuard = {
	description: "hover with no guard, when no blocking state is configured",
	code: `
		.button {
			--s-color: var(--_color);
			color: var(--s-color);
			&:hover { --s-color: var(--_color-hover); }
			&:disabled { --s-opacity: 0.5; }
		}
	`,
};
testRule(blockingStatesWin, { settings: { strict: true, blockingStates: [] }, accept: [nothingToGuard] });
testRule(blockingStatesWin, { settings: { blockingStates: [] }, accept: [nothingToGuard] });

// The settings' own blocking states, compared as written in the config (core's B16).
testRule(blockingStatesWin, {
	settings: { blockingStates: [":nth-child(2n+1)", "[data-busy]"] },
	accept: [
		{
			description: "a guard that lists the configured entry with other spacing",
			code: `
				.row {
					--s-color: var(--_color);
					color: var(--s-color);
					&:where(:not(:nth-child(2n + 1), [data-busy])) {
						&:hover { --s-color: var(--_color-hover); }
					}
					&[data-busy] { --s-opacity: 0.5; }
				}
			`,
		},
	],
	reject: [
		{
			description: "a guard that leaves out a configured state",
			code: `
				.row {
					--s-color: var(--_color);
					color: var(--s-color);
					&:where(:not(:nth-child(2n + 1))) {
						&:hover { --s-color: var(--_color-hover); }
					}
					&[data-busy] { --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected guard on ".row" leaving out "[data-busy]", so interaction states still apply while they hold. Add them to its ":not()".',
					line: 4,
					column: 10,
					endLine: 4,
					endColumn: 34,
				},
			],
			fixed: `
				.row {
					--s-color: var(--_color);
					color: var(--s-color);
					&:where(:not(:nth-child(2n + 1), [data-busy])) {
						&:hover { --s-color: var(--_color-hover); }
					}
					&[data-busy] { --s-opacity: 0.5; }
				}
			`,
		},
	],
});
