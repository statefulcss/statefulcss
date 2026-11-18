import { testRule } from "../../testing/test-rule.js";
import blockingStatesWin from "./index.js";

const guard = '&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert]))';
const unguarded = (condition: string, element: string, wanted = guard) =>
	`Unexpected "${condition}" on ${element} outside a guard, so a blocked element still reacts to it. Write it inside "${wanted}".`;
const split = (condition: string, interaction: string, rest: string, element = '".button"') =>
	`Unexpected "${condition}" on ${element} outside a guard, so a blocked element still reacts to ${interaction}. Split it: write ${interaction} inside "${guard}", and ${rest} outside it.`;
const incomplete = (element: string, missing: string, one = false) =>
	`Unexpected guard on ${element} leaving out ${missing}, so interaction states still apply while ${one ? "it holds. Add it" : "they hold. Add them"} to its ":not()".`;

const incompleteMixed = (element: string, missing: string) =>
	`Unexpected guard on ${element} leaving out ${missing}, so interaction states still apply while they hold. The guard also holds other styles, which adding them would change: give the interaction states their own guard, listing every blocking state.`;

/**
 * A Tabs whose root block holds what a case puts from line 3, each line at the root's level, and whose tab part's
 * guarded hover waits for `--q-tabs-blocked`.
 */
const tabs = (...body: string[]) => `
	.tabs {
		--q-tabs-blocked: false;
		${body.join("\n\t\t")}
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
		}
	}
`;
/** The tab's hover, when no flag is set by every blocking state of a Tabs whose root block holds `lines` lines. */
const noSharedFlag = (lines: number) => ({
	message:
		'Unexpected ":hover" on part "tab", which applies while ".tabs" is blocked: no query variable is set by every one of its blocking states. Set one, such as "--q-tabs-blocked", in each of them, and write ":hover" inside a style query on its default.',
	line: 10 + lines,
	column: 6,
	endLine: 10 + lines,
	endColumn: 12,
});

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
		// The README's Fixed cases.
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
		// The taught form, and the README's Not reported cases.
		{
			description: "a semantic state with a guard, the taught form",
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
		// The part and its component's query variable, from the README.
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
		// Beyond the README's cases.
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
		// A part's style query checks a flag every blocking state changes, for its default.
		{
			description: "a part's query turned around on the value every blocking state sets",
			code: `
				.tabs {
					--q-tabs-blocked: false;
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&[aria-disabled="true"] { --q-tabs-blocked: true; --s-opacity: 0.5; }
					&[data-loading] { --q-tabs-blocked: true; }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--t-color-text-muted);
						color: var(--s-color);
						${guard} {
							@container not style(--q-tabs-blocked: true) {
								&:hover { --s-color: var(--t-color-text); }
							}
						}
					}
				}
			`,
		},
		{
			description: "a part's query on a flag whose default is computed gets no opinion",
			code: `
				.tabs {
					--q-tabs-blocked: var(--_blocked-at-rest);
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&[aria-disabled="true"] { --q-tabs-blocked: true; --s-opacity: 0.5; }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--t-color-text-muted);
						color: var(--s-color);
						${guard} {
							@container style(--q-tabs-blocked: true) {
								&:hover { --s-color: var(--t-color-text); }
							}
						}
					}
				}
			`,
		},
		// A reader outside the component isn't this component's to judge.
		{
			description: "a third party's element and another component read a blocking query variable",
			code: `
				.tabs {
					--q-busy: false;
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&:disabled { --q-busy: true; --s-opacity: 0.5; }
				}
				.card :deep(.lib) { opacity: var(--q-busy); }
				:global(.lib) { opacity: var(--q-busy); }
				.note { opacity: var(--q-busy); }
			`,
		},
		// A flag is judged per blocking state, however many rules write the state.
		{
			description: "a blocking state written in two rules, one setting the flag",
			code: tabs("&:disabled { --q-tabs-blocked: true; }", "&:disabled { opacity: 0.5; }"),
		},
		{
			description: "a blocking state setting the flag, with a nested @media of its own",
			code: tabs(
				"&:disabled {",
				"\t--q-tabs-blocked: true;",
				"\topacity: 0.5;",
				"\t@media (prefers-contrast: more) { opacity: 0.3; }",
				"}",
			),
		},
		{
			description: "a blocking state whose !important write wins over a later ordinary one",
			code: tabs(
				"&:disabled { --q-tabs-blocked: true !important; }",
				"&:disabled { --q-tabs-blocked: false; opacity: 0.5; }",
			),
		},
		// A class on the document element is a condition of the page, not a component.
		{
			description: "a class on the document element, changed on hover and by a blocking state",
			code: `
				html.dark { --s-opacity: 1; opacity: var(--s-opacity); }
				html.dark:hover { --s-opacity: 0.9; }
				html.dark[inert] { --s-opacity: 0.5; }
				:root.dark { --s-opacity: 1; opacity: var(--s-opacity); }
				:root.dark:hover { --s-opacity: 0.9; }
				:root.dark[inert] { --s-opacity: 0.5; }
			`,
		},
		// The same guard, complete, holds whatever the @include emits.
		{
			description: "a complete guard holding an @include",
			code: button(
				lines(
					`${guard} {`,
					"\t@include selected-look;",
					"\t&:hover { --s-color: var(--_color-hover); }",
					"}",
				),
			).code,
		},
	],
	reject: [
		// The README's Reported cases.
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
		// Beyond the README's cases.
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
						'Unexpected guard on ".field" leaving out ":has(:where([data-part="input"]):disabled)", so interaction states still apply while it holds. Add it to its ":not()".',
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
		// A disable comment keeps its rule where the author wrote it. "hover and active" above is the control.
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

		// Only a selector whose every alternative is an interaction state is guarded whole.
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

		// A guard is completed only when everything inside it is an interaction state of the elements it guards.
		// "an incomplete guard around hover alone, completed" above is a control.
		{
			description: "an incomplete guard holding a semantic state, which --fix doesn't complete",
			code: button(
				lines(
					"&:where(:not(:disabled)) {",
					'\t&[aria-pressed="true"] { --s-color: var(--_color-pressed); }',
					"\t&:hover { --s-color: var(--_color-hover); }",
					"}",
				),
			).code,
			warnings: [
				{
					message: incompleteMixed('".button"', '"[aria-disabled="true"]", "[data-loading]" and "[inert]"'),
					line: 6,
					column: 10,
					endLine: 6,
					endColumn: 25,
				},
			],
		},
		{
			description: "an incomplete guard holding a plain declaration, which --fix doesn't complete",
			code: button(
				lines(
					"&:where(:not(:disabled)) {",
					"\tcursor: pointer;",
					"\t&:hover { --s-color: var(--_color-hover); }",
					"}",
				),
			).code,
			warnings: [
				{
					message: incompleteMixed('".button"', '"[aria-disabled="true"]", "[data-loading]" and "[inert]"'),
					line: 6,
					column: 10,
					endLine: 6,
					endColumn: 25,
				},
			],
		},
		// A class on its own is a component.
		{
			description: "a class on its own, changed on hover and by a blocking state",
			code: `
				.dark { --s-opacity: 1; opacity: var(--s-opacity); }
				.dark:hover { --s-opacity: 0.9; }
				.dark[inert] { --s-opacity: 0.5; }
			`,
			warnings: [{ message: unguarded(":hover", '".dark"'), line: 2, column: 6, endLine: 2, endColumn: 12 }],
		},
		// An @include may emit a semantic state, so a guard holding one isn't completed.
		{
			description: "an incomplete guard holding an @include, which --fix doesn't complete",
			code: button(
				lines(
					"&:where(:not(:disabled)) {",
					"\t@include selected-look;",
					"\t&:hover { --s-color: var(--_color-hover); }",
					"}",
				),
			).code,
			warnings: [
				{
					message: incompleteMixed('".button"', '"[aria-disabled="true"]", "[data-loading]" and "[inert]"'),
					line: 6,
					column: 10,
					endLine: 6,
					endColumn: 25,
				},
			],
		},
		{
			description: "an incomplete guard shared with a link, which --fix doesn't complete",
			code: `
				.button, a {
					&:where(:not(:disabled)) {
						&:hover { color: red; }
					}
				}
				.button:disabled { opacity: 0.5; }
			`,
			warnings: [
				{
					message: incompleteMixed('".button"', '"[aria-disabled="true"]", "[data-loading]" and "[inert]"'),
					line: 2,
					column: 10,
					endLine: 2,
					endColumn: 25,
				},
			],
		},
		{
			description: "an incomplete guard around interaction states only, a pressed one's included, completed",
			...button(
				lines(
					"&:where(:not(:disabled)) {",
					"\t&:hover { --s-color: var(--_color-hover); }",
					'\t&[aria-pressed="true"]:active { --s-color: var(--_color-active); }',
					"}",
				),
				lines(
					'&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {',
					"\t&:hover { --s-color: var(--_color-hover); }",
					'\t&[aria-pressed="true"]:active { --s-color: var(--_color-active); }',
					"}",
				),
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

		// A flag is judged per blocking state. The accepted cases above are the controls.
		{
			description: "a blocking state written in two rules, neither setting the flag",
			code: tabs("&:disabled { --q-tabs-blocked: true; }", "&[data-loading] { opacity: 0.5; }"),
			warnings: [noSharedFlag(2)],
		},
		{
			description: "a blocking state setting the flag only inside a nested @media",
			code: tabs(
				"&:disabled {",
				"\topacity: 0.5;",
				"\t@media (prefers-contrast: more) { --q-tabs-blocked: true; }",
				"}",
			),
			warnings: [noSharedFlag(4)],
		},
		{
			description: "a blocking state whose later !important write sets the flag back",
			code: tabs(
				"&:disabled { --q-tabs-blocked: true; }",
				"&:disabled { --q-tabs-blocked: false !important; opacity: 0.5; }",
			),
			warnings: [noSharedFlag(2)],
		},

		// A disable comment governs its rule's line wherever it sits. "hover and active" above is the control.
		{
			description: "a disabled hover behind another comment on its line stays, and active is wrapped alone",
			...button(
				lines(
					"/* stylelint-disable-next-line statefulcss/blocking-states-win -- keep the tooltip */",
					"/* tooltip */ &:hover { --s-color: var(--_color-hover); }",
					"&:active { --s-color: var(--_color-active); }",
				),
				lines(
					"/* stylelint-disable-next-line statefulcss/blocking-states-win -- keep the tooltip */",
					"/* tooltip */ &:hover { --s-color: var(--_color-hover); }",
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
			description: "a hover with a disable comment inside its selector stays, and active is wrapped alone",
			...button(
				lines(
					"&:hover /* stylelint-disable-line statefulcss/blocking-states-win -- keep the tooltip */ { --s-color: var(--_color-hover); }",
					"&:active { --s-color: var(--_color-active); }",
				),
				lines(
					"&:hover /* stylelint-disable-line statefulcss/blocking-states-win -- keep the tooltip */ { --s-color: var(--_color-hover); }",
					`${guard} {`,
					"\t&:active { --s-color: var(--_color-active); }",
					"}",
				),
			),
			warnings: [
				{ message: unguarded(":active", '".button"'), line: 7, column: 3, endLine: 7, endColumn: 10 },
			],
		},
		{
			description: "a hover after another rule's disabled range, wrapped",
			...button(
				lines(
					"/* stylelint-disable color-no-hex */",
					"&:focus-visible { outline: 1px solid; }",
					"&:hover { --s-color: #fff; }",
				),
				lines(
					"/* stylelint-disable color-no-hex */",
					"&:focus-visible { outline: 1px solid; }",
					`${guard} {`,
					"\t&:hover { --s-color: #fff; }",
					"}",
				),
			),
			warnings: [{ message: unguarded(":hover", '".button"'), line: 8, column: 3, endLine: 8, endColumn: 9 }],
		},

		// A hover on a pseudo-element itself needs its guard on the host, which a wrap where it stands can't write.
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

		// A guard written once for a selector list.
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
					message: incomplete('".a" and ".b"', '":has(:where([data-part="field"]):disabled)"', true),
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
		// A part's style query checks a flag every blocking state changes, for its default.
		{
			description: "a part's query on the value its component's blocking states set",
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
							@container style(--q-tabs-blocked: true) {
								&:hover { --s-color: var(--t-color-text); }
							}
						}
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected ":hover" on part "tab" inside "@container style(--q-tabs-blocked: true)", which doesn\'t keep it off while ".tabs" is blocked. Write it inside "@container style(--q-tabs-blocked: false)".',
					line: 13,
					column: 6,
					endLine: 13,
					endColumn: 12,
				},
			],
		},
		{
			description: "two flags, each set by one blocking state",
			code: `
				.tabs {
					--q-dim: no;
					--q-busy: no;
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&:disabled { --q-dim: yes; --s-opacity: 0.5; }
					&[data-loading] { --q-busy: yes; }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--t-color-text-muted);
						color: var(--s-color);
						${guard} {
							@container style(--q-dim: no) {
								&:hover { --s-color: var(--t-color-text); }
							}
							&:active { --s-color: var(--t-color-text-strong); }
						}
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected ":hover" on part "tab", which applies while ".tabs" is blocked: no query variable is set by every one of its blocking states. Set one, such as "--q-tabs-blocked", in each of them, and write ":hover" inside a style query on its default.',
					line: 15,
					column: 6,
					endLine: 15,
					endColumn: 12,
				},
				{
					message:
						'Unexpected ":active" on part "tab", which applies while ".tabs" is blocked: no query variable is set by every one of its blocking states. Set one, such as "--q-tabs-blocked", in each of them, and write ":active" inside a style query on its default.',
					line: 17,
					column: 5,
					endLine: 17,
					endColumn: 12,
				},
			],
		},
		{
			description: "a flag one blocking state leaves at its default, beside one every blocking state sets",
			code: `
				.tabs {
					--q-dim: no;
					--q-tabs-blocked: false;
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&:disabled { --q-dim: yes; --q-tabs-blocked: true; --s-opacity: 0.5; }
					&[data-loading] { --q-dim: no; --q-tabs-blocked: true; }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						--s-color: var(--t-color-text-muted);
						color: var(--s-color);
						${guard} {
							@container style(--q-dim: no) {
								&:hover { --s-color: var(--t-color-text); }
							}
							&:active { --s-color: var(--t-color-text-strong); }
						}
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected ":hover" on part "tab" inside "@container style(--q-dim: no)", which doesn\'t keep it off while ".tabs" is blocked. Write it inside "@container style(--q-tabs-blocked: false)".',
					line: 15,
					column: 6,
					endLine: 15,
					endColumn: 12,
				},
				{
					message:
						'Unexpected ":active" on part "tab" outside a style query on "--q-dim" and "--q-tabs-blocked", so it applies while ".tabs" is blocked. Write it inside "@container style(--q-tabs-blocked: false)".',
					line: 17,
					column: 5,
					endLine: 17,
					endColumn: 12,
				},
			],
		},
		// The control for a reader outside the component: the component's own element reading it is reported.
		{
			description: "the component's own part reads its blocking query variable with var()",
			code: `
				.tabs {
					--q-busy: false;
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&:disabled { --q-busy: true; --s-opacity: 0.5; }
				}
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] { opacity: var(--q-busy); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--q-busy" read with "var()". A query variable that blocking states set is only queried, with "@container style()".',
					line: 8,
					column: 31,
					endLine: 8,
					endColumn: 44,
				},
			],
		},
		// One state writing the variable a blocking state sets back.
		{
			description: "a blocking state sets back what one interaction state writes",
			code: `
				.button {
					--s-background-color: var(--_background-color);
					--s-opacity: 1;
					background-color: var(--s-background-color);
					opacity: var(--s-opacity);
					${guard} {
						&:hover { --s-background-color: var(--_background-color-hover); }
					}
					&:disabled { --s-background-color: var(--_background-color); --s-opacity: 0.5; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-background-color" set back to its default in ":disabled", which ":hover" also writes. Remove it: the guard keeps interaction states off, and a blocking state sets only its own look.',
					line: 9,
					column: 15,
					endLine: 9,
					endColumn: 62,
				},
			],
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

// With no blocking states configured there's nothing to guard against, in either level. The strict level's
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

// The settings' own blocking states, compared as written in the config.
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
						'Unexpected guard on ".row" leaving out "[data-busy]", so interaction states still apply while it holds. Add it to its ":not()".',
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
