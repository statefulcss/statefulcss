import { testRule } from "../../testing/test-rule.js";
import bindThroughStateVariables from "./index.js";

testRule(bindThroughStateVariables, {
	accept: [
		// The README's Fixed cases.
		{
			description: "a variant changes a private that a property reads directly",
			code: `
				.button {
					--_background-color: var(--t-color-background-raised);
					--s-background-color: var(--_background-color);
					background-color: var(--s-background-color);
					&[data-emphasis="primary"] { --_background-color: var(--t-color-background-accent); }
				}
			`,
		},
		{
			description: "a variant and a state write the same state variable",
			code: `
				.button {
					--_padding-inline: var(--t-space-3);
					--s-padding-inline: var(--_padding-inline);
					padding-inline: var(--s-padding-inline);
					&[data-size="large"] { --_padding-inline: var(--t-space-4); }
					@container (inline-size < 12rem) { --s-padding-inline: var(--t-space-1); }
				}
			`,
		},
		{
			description: "a change that arrives through a chain of privates",
			code: `
				.card {
					--_gap: var(--t-space-4);
					--s-margin-block: calc(var(--_gap) / 2);
					margin-block: var(--s-margin-block);
					&[data-density="compact"] { --_gap: var(--t-space-2); }
				}
			`,
		},
		// The README's Not reported cases.
		{
			description: "a variant-only property writes its state variable",
			code: `
				.button {
					--s-gap: var(--t-space-1);
					gap: var(--s-gap);
					&[data-size="large"] { --s-gap: var(--t-space-2); }
				}
			`,
		},
		{
			description: "a private nothing changes is static",
			code: `
				.card {
					--_gap: var(--t-space-4);
					gap: var(--_gap);
				}
			`,
		},
		{
			description: "the change goes through the state variable",
			code: `
				.card {
					--_gap: var(--t-space-4);
					--s-padding-inline: var(--_gap);
					padding-inline: var(--s-padding-inline);
					&[data-density="compact"] { --_gap: var(--t-space-2); }
				}
			`,
		},
		// Beyond the README's cases.
		{
			description: "a part reads the part variable whose default reads the root's changing private",
			code: `
				.card {
					--_icon-color: var(--t-color-foreground-base);
					--p-icon-color: var(--_icon-color);
					&[data-tone="danger"] { --_icon-color: var(--t-color-foreground-danger); }
				}
				@scope (.card) to ([data-component]) {
					[data-part="icon"] { color: var(--p-icon-color); }
				}
			`,
		},
		{
			description: "a variant combined with a state outranks another state writing the same variable",
			code: `
				.button {
					--_background-color-hover: var(--t-color-background-raised-strong);
					--s-background-color: var(--t-color-background-raised);
					background-color: var(--s-background-color);
					&[data-emphasis="primary"] { --_background-color-hover: var(--t-color-background-accent); }
					&:hover { --s-background-color: var(--_background-color-hover); }
					&:active { --s-background-color: var(--t-color-background-pressed); }
				}
			`,
		},
		{
			description: "two states write one state variable, and no variant does",
			code: `
				.button {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&:hover { --s-opacity: 0.9; }
					&:active { --s-opacity: 0.8; }
					@media (prefers-reduced-motion: reduce) { --s-opacity: 1; }
				}
			`,
		},
		{
			description: "a variant combined with a state, with no other state writing the variable",
			code: `
				.button {
					--s-background-color: var(--t-color-background-raised);
					background-color: var(--s-background-color);
					&[data-emphasis="primary"]:hover { --s-background-color: var(--t-color-background-accent); }
				}
			`,
		},
		{
			description: "two variants combined with the same state, which no plain state writes",
			code: `
				.button {
					--s-background-color: var(--t-color-background-raised);
					background-color: var(--s-background-color);
					&[data-emphasis="primary"]:hover { --s-background-color: var(--t-color-background-accent); }
					&[data-emphasis="quiet"]:hover { --s-background-color: var(--t-color-background-base); }
				}
			`,
		},
		{
			description: "a variant and a visited link write one state variable, which :visited ignores",
			code: `
				.link {
					--s-color: var(--t-color-foreground-accent);
					color: var(--s-color);
					&[data-tone="quiet"] { --s-color: var(--t-color-foreground-base); }
					&:visited { --s-color: var(--t-color-foreground-visited); }
				}
			`,
		},
		// A private set in :visited doesn't change, since the browser ignores it there; only visited-colors-only reports it.
		{
			description: "a private set in :visited, read by color",
			code: `
				a { --_ink: navy; color: var(--_ink); }
				a:visited { --_ink: purple; }
				.link { --_ink: navy; color: var(--_ink); &:visited { --_ink: purple; } &:visited:hover { --_ink: red; } }
			`,
		},
		{
			description: "a private changed in a block of unknown kind",
			code: `
				.tab {
					--_color: var(--t-color-foreground-base);
					color: var(--_color);
					&.is-active { --_color: var(--t-color-foreground-strong); }
				}
			`,
		},
		{
			description: "a utility reads a private its hover changes",
			code: `
				@layer utilities {
					.u-fade { --_opacity: 1; opacity: var(--_opacity); &:hover { --_opacity: 0.5; } }
				}
			`,
		},
		{
			description: "a variant and a state write a private",
			code: `
				.button {
					--_gap: var(--t-space-1);
					--s-gap: var(--_gap);
					gap: var(--s-gap);
					&[data-size="large"] { --_gap: var(--t-space-2); }
					&:hover { --_gap: var(--t-space-3); }
				}
			`,
		},
		// Rule 3's advice, followed, brings no error here.
		{
			description: "rule 3's fix for a selector list of two pseudo-elements",
			code: `
				.a {
					--p-after-opacity: 0;
					--p-before-opacity: 0;
					&::after { opacity: var(--p-after-opacity); }
					&::before { opacity: var(--p-before-opacity); }
					&:hover { --p-after-opacity: 1; --p-before-opacity: 1; }
				}
			`,
		},
		{
			description: "rule 3's fix for a pseudo-element a variant and a state change",
			code: `
				.a {
					--_after-opacity: 0.5;
					--p-after-opacity: var(--_after-opacity);
					&::after { opacity: var(--p-after-opacity); }
					&:hover { --p-after-opacity: 1; }
					&[data-size="l"] { --_after-opacity: 0.8; }
				}
			`,
		},
		{
			description: "rule 3's fix for a global element's pseudo-element",
			code: `
				a {
					--p-after-opacity: 0.5;
					&:hover { --p-after-opacity: 1; }
				}
				a::after { opacity: var(--p-after-opacity); }
			`,
		},
	],
	reject: [
		// The README's Reported cases.
		{
			description: "a variant changes a private that a property reads directly",
			code: `
				.button {
					--_background-color: var(--t-color-background-raised);
					background-color: var(--_background-color);
					&[data-emphasis="primary"] { --_background-color: var(--t-color-background-accent); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "background-color" reading "--_background-color", which changes in "[data-emphasis="primary"]". Move this value into the default of "--s-background-color" on ".button", and read "var(--s-background-color)" instead.',
					line: 3,
					column: 20,
					endLine: 3,
					endColumn: 44,
				},
			],
		},
		// The same private set on hover does change.
		{
			description: "a private set on hover, read by color",
			code: `
				.link { --_ink: navy; color: var(--_ink); &:visited { --_ink: purple; } &:hover { --_ink: red; } }
			`,
			warnings: [
				{
					message:
						'Unexpected "color" reading "--_ink", which changes in ":hover". Move this value into the default of "--s-color" on ".link", and read "var(--s-color)" instead.',
					line: 1,
					column: 30,
					endLine: 1,
					endColumn: 41,
				},
			],
		},
		{
			description: "a variant and a state write the same state variable",
			code: `
				.button {
					--s-padding-inline: var(--t-space-3);
					padding-inline: var(--s-padding-inline);
					&[data-size="large"] { --s-padding-inline: var(--t-space-4); }
					@container (inline-size < 12rem) { --s-padding-inline: var(--t-space-1); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-padding-inline" written by the variant "[data-size="large"]" while a state writes it too, in "@container (inline-size < 12rem)". Set "--_padding-inline" in the variant instead, and give "--s-padding-inline" the default "var(--_padding-inline)".',
					line: 4,
					column: 25,
					endLine: 4,
					endColumn: 43,
				},
			],
		},
		{
			description: "a change that arrives through a chain of privates",
			code: `
				.card {
					--_gap: var(--t-space-4);
					--_half: calc(var(--_gap) / 2);
					margin-block: var(--_half);
					&[data-density="compact"] { --_gap: var(--t-space-2); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "margin-block" reading "--_half", which reads "--_gap", which changes in "[data-density="compact"]". Move this value into the default of "--s-margin-block" on ".card", and read "var(--s-margin-block)" instead.',
					line: 4,
					column: 16,
					endLine: 4,
					endColumn: 28,
				},
			],
		},
		// Beyond the README's cases.
		{
			description: "a three-step chain names every private on the way",
			code: `
				.card {
					--_gap: var(--t-space-4);
					--_half: calc(var(--_gap) / 2);
					--_inset: calc(var(--_half) + 1px);
					padding: var(--_inset);
					&[data-density="compact"] { --_gap: var(--t-space-2); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "padding" reading "--_inset", which reads "--_half", which reads "--_gap", which changes in "[data-density="compact"]". Move this value into the default of "--s-padding" on ".card", and read "var(--s-padding)" instead.',
					line: 5,
					column: 11,
					endLine: 5,
					endColumn: 24,
				},
			],
		},
		{
			description: "a state changes a private that a property reads inside a function",
			code: `
				.button {
					--_scale: 1;
					transform: scale(var(--_scale));
					&:active { --_scale: 0.98; }
					@media (prefers-reduced-motion: reduce) { --_scale: 1; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "transform" reading "--_scale", which changes in ":active" and "@media (prefers-reduced-motion: reduce)". Move this value into the default of "--s-transform" on ".button", and read "var(--s-transform)" instead.',
					line: 3,
					column: 13,
					endLine: 3,
					endColumn: 33,
				},
			],
		},
		{
			description:
				"a part, its pseudo-element and the root's pseudo-element read the root's changing private",
			code: `
				.card {
					--_icon-color: var(--t-color-foreground-base);
					&:hover { --_icon-color: var(--t-color-foreground-strong); }
					&::after { color: var(--_icon-color); }
				}
				@scope (.card) to ([data-component]) {
					[data-part="icon"] {
						color: var(--_icon-color);
						&::before { color: var(--_icon-color); }
					}
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" reading "--_icon-color", which changes in ":hover". Move this value into the default of "--p-after-color" on ".card", and read "var(--p-after-color)" instead.',
					line: 4,
					column: 20,
					endLine: 4,
					endColumn: 38,
				},
				{
					message:
						'Unexpected "color" reading "--_icon-color", which changes in ":hover". Move this value into the default of "--p-icon-color" on ".card", and read "var(--p-icon-color)" instead.',
					line: 8,
					column: 10,
					endLine: 8,
					endColumn: 28,
				},
				{
					message:
						'Unexpected "color" reading "--_icon-color", which changes in ":hover". Move this value into the default of "--p-icon-before-color" on ".card", and read "var(--p-icon-before-color)" instead.',
					line: 9,
					column: 22,
					endLine: 9,
					endColumn: 40,
				},
			],
		},
		{
			description: "a part takes the root's changing private with inherit and reads it",
			code: `
				.card {
					--_accent: var(--t-color-foreground-accent);
					&[data-tone="danger"] { --_accent: var(--t-color-foreground-danger); }
				}
				@scope (.card) to ([data-component]) {
					[data-part="label"] { --_accent: inherit; color: var(--_accent); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" reading "--_accent", which changes in "[data-tone="danger"]". Move this value into the default of "--p-label-color" on ".card", and read "var(--p-label-color)" instead.',
					line: 6,
					column: 51,
					endLine: 6,
					endColumn: 65,
				},
			],
		},
		{
			description: "a slot at the end of the placement path reads the root's changing private",
			code: `
				.card {
					--_gap: var(--t-space-2);
					&[data-density="compact"] { --_gap: var(--t-space-1); }
					& > [data-part="footer"] > [data-slot="action"] { margin-block: var(--_gap); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "margin-block" reading "--_gap", which changes in "[data-density="compact"]". Move this value into the default of "--p-action-margin-block" on ".card", and read "var(--p-action-margin-block)" instead.',
					line: 4,
					column: 66,
					endLine: 4,
					endColumn: 77,
				},
			],
		},
		{
			description: "a variant and a state write the same part variable on the root",
			code: `
				.card {
					--p-icon-color: var(--t-color-foreground-base);
					&[data-tone="danger"] { --p-icon-color: var(--t-color-foreground-danger); }
					&:hover { --p-icon-color: var(--t-color-foreground-strong); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--p-icon-color" written by the variant "[data-tone="danger"]" while a state writes it too, in ":hover". Set "--_icon-color" in the variant instead, and give "--p-icon-color" the default "var(--_icon-color)".',
					line: 3,
					column: 26,
					endLine: 3,
					endColumn: 40,
				},
			],
		},
		{
			description: "a variant written after the states still collides with them",
			code: `
				.button {
					--s-padding-inline: var(--t-space-3);
					padding-inline: var(--s-padding-inline);
					&:hover { --s-padding-inline: var(--t-space-2); }
					&:active { --s-padding-inline: var(--t-space-1); }
					&[data-size="large"] { --s-padding-inline: var(--t-space-4); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-padding-inline" written by the variant "[data-size="large"]" while a state writes it too, in ":hover" and ":active". Set "--_padding-inline" in the variant instead, and give "--s-padding-inline" the default "var(--_padding-inline)".',
					line: 6,
					column: 25,
					endLine: 6,
					endColumn: 43,
				},
			],
		},
		{
			description: "a variant inside a media query and a state write the same state variable",
			code: `
				.button {
					--s-gap: var(--t-space-1);
					gap: var(--s-gap);
					@media (width > 40rem) { &[data-size="large"] { --s-gap: var(--t-space-2); } }
					&:hover { --s-gap: var(--t-space-3); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-gap" written by the variant "[data-size="large"]" in "@media (width > 40rem)" while a state writes it too, in ":hover". Set "--_gap" in the variant instead, and give "--s-gap" the default "var(--_gap)".',
					line: 4,
					column: 50,
					endLine: 4,
					endColumn: 57,
				},
			],
		},
		{
			description: "a variant combined with a state outranks another state writing the same variable",
			code: `
				.button {
					--s-background-color: var(--t-color-background-raised);
					background-color: var(--s-background-color);
					&[data-emphasis="primary"]:hover { --s-background-color: var(--t-color-background-accent); }
					&:active { --s-background-color: var(--t-color-background-pressed); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-background-color" written by "[data-emphasis="primary"]:hover", a variant combined with a state, while another state writes it too, in ":active". Set a private in "[data-emphasis="primary"]" instead, and let ":hover" set "--s-background-color" from it.',
					line: 4,
					column: 37,
					endLine: 4,
					endColumn: 57,
				},
			],
		},
		{
			description: "a selector list of two variants is reported once",
			code: `
				.button {
					--s-gap: var(--t-space-1);
					gap: var(--s-gap);
					&[data-size="large"], &[data-size="huge"] { --s-gap: var(--t-space-2); }
					&:hover { --s-gap: var(--t-space-3); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-gap" written by the variant "[data-size="large"]" and "[data-size="huge"]" while a state writes it too, in ":hover". Set "--_gap" in the variant instead, and give "--s-gap" the default "var(--_gap)".',
					line: 4,
					column: 46,
					endLine: 4,
					endColumn: 53,
				},
			],
		},
		{
			description: "a selector list of two components reading a changing private is reported once",
			code: `
				.card, .note {
					--_opacity: 1;
					opacity: var(--_opacity);
					&:hover { --_opacity: 0.9; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "opacity" reading "--_opacity", which changes in ":hover". Move this value into the default of "--s-opacity" on ".card" and ".note", and read "var(--s-opacity)" instead.',
					line: 3,
					column: 11,
					endLine: 3,
					endColumn: 26,
				},
			],
		},
		{
			description: "a page element's pseudo-element reads the element's changing private",
			code: `
				a {
					--_color: var(--t-color-foreground-accent);
					&:hover { --_color: var(--t-color-foreground-strong); }
					&::after { border-color: var(--_color); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "border-color" reading "--_color", which changes in ":hover". Move this value into the default of "--p-after-border-color" on "a", and read "var(--p-after-border-color)" instead.',
					line: 4,
					column: 27,
					endLine: 4,
					endColumn: 40,
				},
			],
		},
		{
			description: "a page element reads a private its hover changes",
			code: `
				a {
					--_color: var(--t-color-foreground-accent);
					color: var(--_color);
					&:hover { --_color: var(--t-color-foreground-strong); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "color" reading "--_color", which changes in ":hover". Move this value into the default of "--s-color" on "a", and read "var(--s-color)" instead.',
					line: 3,
					column: 9,
					endLine: 3,
					endColumn: 22,
				},
			],
		},
		// A selector list of pseudo-elements gets one instruction for each binding.
		{
			description: "a selector list of two pseudo-elements reading a changing private",
			code: `
				.a {
					--_opacity: 0;
					&:hover { --_opacity: 1; }
					&::after, &::before { opacity: var(--_opacity); }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "opacity" reading "--_opacity", which changes in ":hover". Move this value into the default of "--p-after-opacity" on ".a", and read "var(--p-after-opacity)" instead.',
					line: 4,
					column: 33,
					endLine: 4,
					endColumn: 48,
				},
				{
					message:
						'Unexpected "opacity" reading "--_opacity", which changes in ":hover". Move this value into the default of "--p-before-opacity" on ".a", and read "var(--p-before-opacity)" instead.',
					line: 4,
					column: 33,
					endLine: 4,
					endColumn: 48,
				},
			],
		},
		{
			description: "a state attribute the settings don't name is a variant",
			code: `
				.disclosure {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&[data-state="open"] { --s-opacity: 0.9; }
					&:hover { --s-opacity: 0.8; }
				}
			`,
			warnings: [
				{
					message:
						'Unexpected "--s-opacity" written by the variant "[data-state="open"]" while a state writes it too, in ":hover". Set "--_opacity" in the variant instead, and give "--s-opacity" the default "var(--_opacity)".',
					line: 4,
					column: 25,
					endLine: 4,
					endColumn: 36,
				},
			],
		},
	],
});

// The settings that tell a state from a variant change the result (the README's Options).
testRule(bindThroughStateVariables, {
	settings: { stateAttributes: ["data-state"] },
	accept: [
		{
			description: "a state attribute the settings name is a state, not a variant",
			code: `
				.disclosure {
					--s-opacity: 1;
					opacity: var(--s-opacity);
					&[data-state="open"] { --s-opacity: 0.9; }
					&:hover { --s-opacity: 0.8; }
				}
			`,
		},
	],
});
