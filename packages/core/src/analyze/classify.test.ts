import { defaults, type Settings } from "@statefulcss/config";
import type { Document, Root } from "postcss";
import { describe, expect } from "vitest";

import type { Condition } from "../model.js";
import { inEverySyntax } from "../testing/syntaxes.js";
import { type Classified, classify, vocabularyFrom } from "./classify.js";
import { type Names, namesFrom } from "./names.js";
import { walk } from "./walk.js";

/** Every block of a stylesheet, classified. */
function classifyAll(root: Root | Document, settings: Settings = defaults, names?: Names): Classified[] {
	const vocabulary = vocabularyFrom(settings, names ?? namesFrom(settings));
	return walk(root).blocks.map((block) => classify(block, vocabulary));
}

const kinds = (blocks: Classified[]) => blocks.map((block) => [block.kind, block.groups]);
const conditions = (block: Classified | undefined) =>
	block?.conditions.map((condition) => [condition.text, condition.kind, condition.group, condition.on]);
const steps = (block: Classified | undefined) =>
	block?.path.map((step) => [step.combinator, step.names, step.name ?? step.text]);
const guardOf = (block: Classified | undefined): Condition | undefined =>
	block?.conditions.find((condition) => condition.kind === "guard");

describe("what a condition is", () => {
	// Sources: the selector-classification and state-vocabulary decisions; the methodology's "Markup defines state".
	const rows: [selector: string, kind: string, groups: string[]][] = [
		// Variants: an attribute with a value, an ARIA property, a position
		['[data-size="small"]', "variant", []],
		['[type="checkbox"]', "variant", []],
		['[dir="rtl"]', "variant", []],
		['[aria-orientation="vertical"]', "variant", []],
		['[aria-level="2"]', "variant", []],
		['[aria-haspopup="menu"]', "variant", []],
		[":first-child", "variant", []],
		[":nth-child(2n + 1)", "variant", []],
		[":only-of-type", "variant", []],
		[":empty", "variant", []],
		[":dir(rtl)", "variant", []],
		[":lang(en)", "variant", []],
		['[data-intent="danger"][data-emphasis="primary"]', "variant", []],
		// Interaction states
		[":hover", "state", ["interaction"]],
		[":active", "state", ["interaction"]],
		[":focus-visible", "state", ["interaction"]],
		[":focus-within", "state", ["interaction"]],
		// Semantic states: ARIA states, presence attributes, and every state not listed elsewhere
		['[aria-pressed="true"]', "state", ["semantic"]],
		['[aria-selected="true"]', "state", ["semantic"]],
		['[aria-expanded="true"]', "state", ["semantic"]],
		['[aria-checked="mixed"]', "state", ["semantic"]],
		['[aria-current="page"]', "state", ["semantic"]],
		['[aria-invalid="true"]', "state", ["semantic"]],
		['[aria-disabled="false"]', "state", ["semantic"]],
		["[hidden]", "state", ["semantic"]],
		["[open]", "state", ["semantic"]],
		["[data-active]", "state", ["semantic"]],
		[":checked", "state", ["semantic"]],
		[":user-invalid", "state", ["semantic"]],
		[":popover-open", "state", ["semantic"]],
		[":target", "state", ["semantic"]],
		// Blocking states
		[":disabled", "state", ["blocking"]],
		['[aria-disabled="true"]', "state", ["blocking"]],
		["[aria-disabled='true']", "state", ["blocking"]],
		["[data-loading]", "state", ["blocking"]],
		["[inert]", "state", ["blocking"]],
		// The platform exception
		[":visited", "state", ["visited"]],
		[":visited:hover", "state", ["interaction", "visited"]],
		// A variant combined with a state is a state
		['[data-emphasis="primary"]:hover', "state", ["interaction"]],
		['[aria-pressed="true"]:where(:hover)', "state", ["interaction", "semantic"]],
		["[hidden]:where(:not([hidden='until-found' i]))", "state", ["semantic"]],
		// :is(), :not() and :has() take the kind of what's inside
		[":is(:hover, :focus-visible)", "state", ["interaction"]],
		[":not(:hover)", "state", ["interaction"]],
		[':not([data-size="small"])', "variant", []],
		[":is(a, button)", "variant", []],
		[":has(> img)", "variant", []],
		[":has(:checked)", "state", ["semantic"]],
		// An extra class is unknown, wherever it's written
		[".is-active", "unknown", []],
		[":not(.is-active)", "unknown", []],
		[":is(.card *)", "unknown", []],
	];

	inEverySyntax("by its shape and the settings' lists", ({ parse }) => {
		const css = rows.map(([selector]) => `.button${selector} { color: red; }`).join("\n");
		expect(kinds(classifyAll(parse(css)))).toEqual(rows.map(([, kind, groups]) => [kind, groups]));
	});

	inEverySyntax("an attribute the settings list as a state", ({ parse }) => {
		const css = '.dialog[data-state="open"] { opacity: 1; }';
		expect(kinds(classifyAll(parse(css)))).toEqual([["variant", []]]);
		const settings = { ...defaults, stateAttributes: ["data-state"] };
		expect(kinds(classifyAll(parse(css), settings))).toEqual([["state", ["semantic"]]]);
	});

	inEverySyntax("the blocking and interaction states come from the settings", ({ parse }) => {
		const css = '.button[aria-busy="true"] { opacity: 0.5; } .button:disabled { opacity: 0.5; }';
		const settings = { ...defaults, blockingStates: ['[aria-busy="true"]'], interactionStates: [":hover"] };
		expect(kinds(classifyAll(parse(css), settings))).toEqual([
			["state", ["blocking"]],
			["state", ["semantic"]],
		]);
		const focus = classifyAll(parse(".button:focus-visible { outline: 0; }"), settings);
		expect(conditions(focus[0])).toEqual([[":focus-visible", "state", "semantic", "subject"]]);
	});

	inEverySyntax("each condition, with what it's written on", ({ parse }) => {
		const [pressed] = classifyAll(
			parse('.button[data-emphasis="primary"][aria-pressed="true"]:where(:hover) { color: red; }'),
		);
		expect(conditions(pressed)).toEqual([
			['[data-emphasis="primary"]', "variant", undefined, "subject"],
			['[aria-pressed="true"]', "state", "semantic", "subject"],
			[":hover", "state", "interaction", "subject"],
		]);
		expect(pressed?.conditions.map((condition) => condition.inWhere)).toEqual([false, false, true]);
		expect(pressed?.conditions.map((condition) => condition.attribute)).toEqual([
			{ name: "data-emphasis", operator: "=", value: "primary" },
			{ name: "aria-pressed", operator: "=", value: "true" },
			undefined,
		]);
	});

	inEverySyntax("focus is marked, so a rule can leave it out of the guard", ({ parse }) => {
		const blocks = classifyAll(
			parse(
				".button:hover { color: red; } .button:focus-visible { outline: 0; } .button:focus { outline: 0; }",
			),
		);
		expect(blocks.map((block) => block.conditions[0]?.focus)).toEqual([false, true, true]);
	});

	inEverySyntax("where a condition was written", ({ parse }) => {
		const [variant, hover] = classifyAll(
			parse('.button[data-size="small"] { gap: 0; } .button { &:hover { color: red; } }'),
		);
		const at = variant?.conditions[0]?.at;
		expect([at?.node.type === "rule" && at.node.selector, at?.index, at?.endIndex]).toEqual([
			'.button[data-size="small"]',
			7,
			26,
		]);
		const nested = hover?.conditions[0]?.at;
		expect([nested?.node.type === "rule" && nested.node.selector, nested?.index, nested?.endIndex]).toEqual([
			"&:hover",
			1,
			7,
		]);
	});
});

describe("queries", () => {
	// Sources: the rules page's "Shared pieces" (block kind) and rule 3's cases.
	inEverySyntax("a query is a context state, and @supports is neither", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				.card {
					padding: 1rem;
					@container --card (inline-size < 20rem) { padding: 0.5rem; }
					@supports (padding: 1cap) { padding: 1cap; }
					@starting-style { opacity: 0; }
					&[data-size="large"] { @supports (gap: 1cap) { gap: 1cap; } }
				}
				@media (width > 40rem) { .card { padding: 2rem; } }
				@supports (gap: 1cap) { @media (width > 40rem) { .card { gap: 1cap; } } }
			`),
		);
		expect(kinds(blocks)).toEqual([
			["own", []],
			["state", ["context"]],
			["supports", []],
			["state", ["context"]],
			["variant", []],
			["state", ["context"]],
			["state", ["context"]],
		]);
		expect(blocks[1]?.queries.map((query) => [query.name, query.params])).toEqual([
			["container", "--card (inline-size < 20rem)"],
		]);
		expect(blocks[6]?.queries.map((query) => query.name)).toEqual(["supports", "media"]);
	});

	inEverySyntax("hover inside @media (hover: hover) is still an interaction", ({ parse }) => {
		const blocks = classifyAll(parse(".button { @media (hover: hover) { &:hover { color: red; } } }"));
		expect(kinds(blocks)).toEqual([["state", ["context", "interaction"]]]);
	});

	// Source: the parts page, "A part with states of its own".
	inEverySyntax("style queries, with what they ask", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				@scope (.tabs) to ([data-component]) {
					[data-part="tab"] {
						@container style(--q-tabs-blocked: false) { &:hover { color: red; } }
						@container --tabs (inline-size > 30rem) and style(--q-tabs-dense) { padding: 0; }
						@container not style(--q-tabs-blocked: true) { cursor: pointer; }
						@container style((--q-a: 1) and (not (--q-b: calc(1px + 2px)))) { margin: 0; }
						@container (inline-size > 30rem) { gap: 0; }
					}
				}
			`),
		);
		expect(blocks.map((block) => block.queries.flatMap((query) => query.styleQueries))).toEqual([
			[{ name: "--q-tabs-blocked", value: "false", negated: false }],
			[{ name: "--q-tabs-dense", value: undefined, negated: false }],
			[{ name: "--q-tabs-blocked", value: "true", negated: true }],
			[
				{ name: "--q-a", value: "1", negated: false },
				{ name: "--q-b", value: "calc(1px + 2px)", negated: true },
			],
			[],
		]);
	});
});

describe("guards", () => {
	// Sources: the rules page, rule 7's cases; the methodology's "Combinations of variants and states".
	inEverySyntax("a :not() that lists a blocking state is a guard, not a state", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				.button {
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
						&:hover { color: red; }
						&:active { color: blue; }
						&:focus-visible { outline: 0; }
						@media (hover: hover) { &:hover { color: green; } }
					}
					&[aria-pressed="true"] { color: purple; }
					&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
						&[aria-pressed="true"]:where(:hover) { color: pink; }
					}
				}
			`),
		);
		expect(kinds(blocks)).toEqual([
			["state", ["interaction"]],
			["state", ["interaction"]],
			["state", ["interaction"]],
			["state", ["context", "interaction"]],
			["state", ["semantic"]],
			["state", ["interaction", "semantic"]],
		]);
		expect(blocks.map((block) => guardOf(block)?.text)).toEqual([
			':not(:disabled, [aria-disabled="true"], [data-loading], [inert])',
			':not(:disabled, [aria-disabled="true"], [data-loading], [inert])',
			':not(:disabled, [aria-disabled="true"], [data-loading], [inert])',
			':not(:disabled, [aria-disabled="true"], [data-loading], [inert])',
			undefined,
			':not(:disabled, [aria-disabled="true"], [data-loading], [inert])',
		]);
		const guard = guardOf(blocks[0]);
		expect(guard).toMatchObject({ kind: "guard", group: undefined, inWhere: true, on: "subject" });
		expect(guard?.inner.map((inner) => [inner.text, inner.group])).toEqual([
			[":disabled", "blocking"],
			['[aria-disabled="true"]', "blocking"],
			["[data-loading]", "blocking"],
			["[inert]", "blocking"],
		]);
	});

	inEverySyntax("a guard that leaves states out, or isn't in :where(), is still a guard", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				.button {
					&:where(:not(:disabled, [aria-disabled="true"])) { &:hover { color: red; } }
					&:not(:disabled):hover { color: blue; }
				}
			`),
		);
		expect(blocks.map((block) => [guardOf(block)?.inner.length, guardOf(block)?.inWhere])).toEqual([
			[2, true],
			[1, false],
		]);
		expect(kinds(blocks)).toEqual([
			["state", ["interaction"]],
			["state", ["interaction"]],
		]);
	});

	inEverySyntax("a block with only a guard is a state with no group", ({ parse }) => {
		const blocks = classifyAll(parse(".button { &:where(:not(:disabled)) { cursor: pointer; } }"));
		expect(kinds(blocks)).toEqual([["state", []]]);
	});

	// Source: the methodology's "States that live on a part".
	inEverySyntax("a :has() state that joins the guard", ({ parse }) => {
		const [hover] = classifyAll(
			parse(`
				.field {
					&:where(:not(:disabled, [inert], :has(:where([data-part="input"]):disabled))) {
						&:hover { color: red; }
					}
				}
			`),
		);
		const joined = guardOf(hover)?.inner.at(-1);
		expect(joined).toMatchObject({ kind: "state", group: "blocking" });
		expect(joined?.has?.path.map((step) => [step.combinator, step.part, step.inWhere])).toEqual([
			[" ", "input", true],
		]);
		expect(kinds([hover as Classified])).toEqual([["state", ["interaction"]]]);
	});
});

describe(":has()", () => {
	// Sources: the methodology's "States that live on a part" and "How values reach parts".
	inEverySyntax("a state or a variant that lives on a part", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				.field {
					&:has(:where([data-part="input"]):disabled) { opacity: 0.6; }
					&:has(:where([data-part="input"])[aria-invalid="true"]) { color: red; }
					&:has(> :where([data-part="control"]) > :where([data-part="input"]):disabled) { opacity: 0.6; }
					&:has(:disabled) { opacity: 0.6; }
					&:has([data-part="input"]:disabled) { opacity: 0.6; }
					&:has(:where([data-part="list"])[aria-orientation="vertical"]) { gap: 0; }
				}
			`),
		);
		expect(kinds(blocks)).toEqual([
			["state", ["blocking"]],
			["state", ["semantic"]],
			["state", ["blocking"]],
			["state", ["blocking"]],
			["state", ["blocking"]],
			["variant", []],
		]);
		expect(
			blocks.map((block) =>
				block.conditions[0]?.has?.path.map((step) => [step.combinator, step.part, step.inWhere]),
			),
		).toEqual([
			[[" ", "input", true]],
			[[" ", "input", true]],
			[
				[">", "control", true],
				[">", "input", true],
			],
			[[" ", undefined, false]],
			[[" ", "input", false]],
			[[" ", "list", true]],
		]);
		expect(
			blocks.map((block) => block.conditions[0]?.has?.conditions.map((condition) => condition.text)),
		).toEqual([
			[":disabled"],
			['[aria-invalid="true"]'],
			[":disabled"],
			[":disabled"],
			[":disabled"],
			['[aria-orientation="vertical"]'],
		]);
	});

	inEverySyntax("where the part is named", ({ parse }) => {
		const [block] = classifyAll(parse('.field:has(:where([data-part="input"]):disabled) { opacity: 0.6; }'));
		const at = block?.conditions[0]?.has?.path[0]?.at;
		expect([at?.index, at?.endIndex]).toEqual([18, 37]);
	});

	inEverySyntax("with a list, what the selectors ask is in inner", ({ parse }) => {
		const [block] = classifyAll(parse(".field:has(:disabled, [aria-invalid='true']) { opacity: 0.6; }"));
		expect(block?.conditions[0]?.has).toBeUndefined();
		expect(block?.conditions[0]?.inner.map((inner) => [inner.text, inner.group])).toEqual([
			[":disabled", "blocking"],
			['[aria-invalid="true"]', "semantic"],
		]);
		expect(kinds([block as Classified])).toEqual([["state", ["semantic", "blocking"]]]);
	});
});

describe("the path from the component root to the subject", () => {
	// Sources: the parts page, "One example"; the methodology's "Composition and placement".
	inEverySyntax("a root named by its class or by its component attribute", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				.card { color: red; }
				[data-component="button"] { color: red; }
				[data-component="button"][data-size="small"] { gap: 0; }
				.button[data-component="button"] { color: red; }
				button.button { color: red; }
			`),
		);
		expect(blocks.map((block) => block.root && { ...block.root, at: undefined })).toEqual([
			{ kind: "class", className: "card", at: undefined },
			{ kind: "attribute", value: "button", at: undefined },
			{ kind: "attribute", value: "button", at: undefined },
			{ kind: "class", className: "button", at: undefined },
			{ kind: "class", className: "button", at: undefined },
		]);
		expect(blocks.map(steps)).toEqual([
			[[undefined, "root", ".card"]],
			[[undefined, "root", '[data-component="button"]']],
			[[undefined, "root", '[data-component="button"]']],
			[[undefined, "root", ".button"]],
			[[undefined, "root", "button.button"]],
		]);
		expect(kinds(blocks)).toEqual([
			["own", []],
			["own", []],
			["variant", []],
			["own", []],
			["own", []],
		]);
	});

	inEverySyntax("a placement path through a part into a slot", ({ parse }) => {
		const [block] = classifyAll(
			parse('.card { & > [data-part="footer"] > [data-slot="action"] { justify-self: end; } }'),
		);
		expect(steps(block)).toEqual([
			[undefined, "root", ".card"],
			[">", "part", "footer"],
			[">", "slot", "action"],
		]);
		expect(block).toMatchObject({ kind: "own", pseudoElement: undefined, foreign: false });
	});

	inEverySyntax("parts and content inside a scope", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				@scope (.card) to ([data-component]) {
					[data-part="title"] { font-weight: 600; }
					:scope > [data-part="icon"] { inline-size: 1em; }
					[data-part="body"] p { margin: 0; }
					[data-part="body"] > * { margin: 0; }
					.hljs-keyword { color: red; }
					svg[data-part="icon"] { fill: red; }
					:scope { padding: 0; }
				}
			`),
		);
		expect(blocks.map(steps)).toEqual([
			[
				[undefined, "root", ".card"],
				[" ", "part", "title"],
			],
			[
				[undefined, "root", ".card"],
				[">", "part", "icon"],
			],
			[
				[undefined, "root", ".card"],
				[" ", "part", "body"],
				[" ", "other", "p"],
			],
			[
				[undefined, "root", ".card"],
				[" ", "part", "body"],
				[">", "other", "*"],
			],
			[
				[undefined, "root", ".card"],
				[" ", "other", ".hljs-keyword"],
			],
			[
				[undefined, "root", ".card"],
				[" ", "part", "icon"],
			],
			[[undefined, "root", ".card"]],
		]);
		expect(blocks.every((block) => block.kind === "own")).toBe(true);
		expect(blocks[5]?.path[1]?.text).toBe('svg[data-part="icon"]');
	});

	inEverySyntax("a scope whose root is a component attribute, or no component at all", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { display: flex; } }
				@scope (main) { a { color: red; } }
			`),
		);
		expect(blocks.map((block) => block.root?.kind)).toEqual(["attribute", undefined]);
		expect(blocks.map(steps)).toEqual([
			[
				[undefined, "root", '[data-component="tabs"]'],
				[" ", "part", "list"],
			],
			[
				[undefined, "root", "main"],
				[" ", "other", "a"],
			],
		]);
	});

	// Sources: the rules page, rule 9's cases and `variants-set-values`.
	inEverySyntax("a condition on the root, when the subject is something else", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				@scope (.button) to ([data-component]) {
					:scope[data-size="small"] [data-part="icon"] { inline-size: 12px; }
				}
				.button:hover [data-part="icon"] { color: red; }
				.button { &[data-size="small"] { & [data-part="label"] > span { font-size: 12px; } } }
			`),
		);
		expect(blocks.map(conditions)).toEqual([
			[['[data-size="small"]', "variant", undefined, "root"]],
			[[":hover", "state", "interaction", "root"]],
			[['[data-size="small"]', "variant", undefined, "root"]],
		]);
		expect(kinds(blocks)).toEqual([
			["variant", []],
			["state", ["interaction"]],
			["variant", []],
		]);
		const [between] = classifyAll(
			parse('.card [data-part="list"][aria-orientation="vertical"] li { margin: 0; }'),
		);
		expect(conditions(between)).toEqual([['[aria-orientation="vertical"]', "variant", undefined, "path"]]);
	});

	// Source: the methodology's "Markup defines state": a tab in a position, not another element.
	inEverySyntax("a sibling before the subject is a position, not a step", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				@scope (.tabs) to ([data-component]) { [data-part="tab"] + [data-part="tab"] { margin: 0; } }
				.stack > * + * { margin-block-start: 1rem; }
			`),
		);
		expect(blocks.map(steps)).toEqual([
			[
				[undefined, "root", ".tabs"],
				[" ", "part", "tab"],
			],
			[
				[undefined, "root", ".stack"],
				[">", "other", "*"],
			],
		]);
		expect(blocks.map(conditions)).toEqual([
			[['[data-part="tab"] +', "variant", undefined, "subject"]],
			[["* +", "variant", undefined, "subject"]],
		]);
	});

	// Sources: the rules page, rules 3 and 4; the parts page, the tab's `::after`.
	inEverySyntax("a pseudo-element, and the conditions on its host", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				.link::after { opacity: 0; }
				.link[aria-current="page"]::after { opacity: 1; }
				.link:after { opacity: 0; }
				.link::after:hover { opacity: 1; }
				@scope (.tabs) to ([data-component]) { [data-part="tab"]::after { content: ""; } }
				.field ::placeholder { color: gray; }
			`),
		);
		expect(blocks.map((block) => block.pseudoElement)).toEqual([
			"after",
			"after",
			"after",
			"after",
			"after",
			"placeholder",
		]);
		expect(blocks.map(conditions)).toEqual([
			[],
			[['[aria-current="page"]', "state", "semantic", "host"]],
			[],
			[[":hover", "state", "interaction", "subject"]],
			[],
			[],
		]);
		expect(steps(blocks[4])).toEqual([
			[undefined, "root", ".tabs"],
			[" ", "part", "tab"],
		]);
		expect(steps(blocks[5])).toEqual([
			[undefined, "root", ".field"],
			[" ", "other", "*"],
		]);
	});

	// Source: the global-elements decision.
	inEverySyntax("what comes before the root is context", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				.button { [dir="rtl"] & { padding-inline-start: 0; } }
				[data-theme="espresso"] .button { color: brown; }
				#checkout .button { color: red; }
				html .button { color: red; }
			`),
		);
		expect(blocks.map(steps)).toEqual(blocks.map(() => [[undefined, "root", ".button"]]));
		expect(blocks.map(conditions)).toEqual([
			[['[dir="rtl"]', "variant", undefined, "context"]],
			[['[data-theme="espresso"]', "variant", undefined, "context"]],
			[],
			[],
		]);
		expect(blocks[1]?.conditions[0]?.attribute?.name).toBe("data-theme");
		expect(blocks.map((block) => block.themeScope)).toEqual([undefined, undefined, undefined, undefined]);
	});

	inEverySyntax("the attribute names come from the names", ({ parse }) => {
		const names = { ...namesFrom(defaults), componentAttribute: "data-widget", partAttribute: "data-area" };
		const blocks = classifyAll(
			parse(`
				[data-widget="card"] { color: red; }
				@scope ([data-widget="card"]) to ([data-widget]) {
					[data-area="title"] { color: red; }
					[data-part="title"] { color: red; }
				}
			`),
			defaults,
			names,
		);
		expect(blocks.map((block) => block.root?.kind)).toEqual(["attribute", "attribute", "attribute"]);
		expect(steps(blocks[1])?.[1]).toEqual([" ", "part", "title"]);
		expect(steps(blocks[2])?.[1]).toEqual([" ", "other", "*"]);
		expect(conditions(blocks[2])).toEqual([['[data-part="title"]', "variant", undefined, "subject"]]);
	});

	inEverySyntax("where a step was written", ({ parse }) => {
		const [block] = classifyAll(
			parse('.card { & > [data-part="footer"] > [data-slot="action"] { justify-self: end; } }'),
		);
		expect(
			block?.path.map((step) => [
				step.at.node.type === "rule" && step.at.node.selector,
				step.at.index,
				step.at.endIndex,
			]),
		).toEqual([
			[".card", 0, 5],
			['& > [data-part="footer"] > [data-slot="action"]', 4, 24],
			['& > [data-part="footer"] > [data-slot="action"]', 27, 47],
		]);
	});
});

describe("selectors that name no component", () => {
	// Sources: the global-elements decision; the rules page, rule 2's cases.
	inEverySyntax("global elements, with their states", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				a { color: red; }
				a:hover { color: blue; }
				[hidden] { display: none; }
				:root { color-scheme: light dark; }
				[data-component] { box-sizing: border-box; }
				::selection { color: red; }
				main [data-part="title"] { color: red; }
			`),
		);
		expect(blocks.map((block) => block.root)).toEqual(blocks.map(() => undefined));
		expect(blocks.map(steps)).toEqual([
			[[undefined, "other", "a"]],
			[[undefined, "other", "a"]],
			[[undefined, "other", "*"]],
			[[undefined, "other", ":root"]],
			[[undefined, "other", "[data-component]"]],
			[[undefined, "other", "*"]],
			[
				[undefined, "other", "main"],
				[" ", "part", "title"],
			],
		]);
		expect(kinds(blocks)).toEqual([
			["own", []],
			["state", ["interaction"]],
			["state", ["semantic"]],
			["own", []],
			["own", []],
			["own", []],
			["own", []],
		]);
		expect(blocks[5]?.pseudoElement).toBe("selection");
	});

	inEverySyntax("theme scopes and color-scheme selectors", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				[data-theme] { --t-space-4: 1rem; }
				[data-theme="espresso"] { --t-space-4: 1.25rem; }
				html[data-theme='espresso'] { --t-space-4: 1.5rem; }
				[data-theme="espresso"] a { color: red; }
				[data-color-scheme="dark"] { color-scheme: dark; }
				[data-theme="espresso"] { @media (prefers-reduced-motion: reduce) { --t-duration-fast: 0s; } }
				.card[data-theme="espresso"] { --t-space-4: 1rem; }
			`),
		);
		expect(blocks.map((block) => [block.path.at(-1)?.text, block.themeScope, block.colorScheme])).toEqual([
			["[data-theme]", { theme: undefined }, false],
			['[data-theme="espresso"]', { theme: "espresso" }, false],
			['html[data-theme="espresso"]', { theme: "espresso" }, false],
			["a", undefined, false],
			['[data-color-scheme="dark"]', undefined, true],
			['[data-theme="espresso"]', { theme: "espresso" }, false],
			[".card", undefined, false],
		]);
		expect(kinds(blocks)).toEqual([
			["own", []],
			["own", []],
			["own", []],
			["own", []],
			["own", []],
			["state", ["context"]],
			["variant", []],
		]);
	});

	inEverySyntax("the theme attribute comes from the settings", ({ parse }) => {
		const settings = { ...defaults, themeAttribute: "data-brand" };
		const [block] = classifyAll(parse('[data-brand="espresso"] { --t-space-4: 1rem; }'), settings);
		expect(block?.themeScope).toEqual({ theme: "espresso" });
	});

	// Source: the vue-styles decision.
	inEverySyntax("what :deep() and :global() select is foreign", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				.card :deep(.button) { color: red; }
				:global(.tooltip) { color: blue; }
				.card :deep(.button) [data-part="icon"] { color: red; }
				.card { color: red; }
			`),
		);
		expect(blocks.map((block) => block.foreign)).toEqual([true, true, true, false]);
	});
});

describe("where a selector names a part", () => {
	// Sources: the rules page, rule 9; the correction that an element is a component or a part, never both.
	inEverySyntax("on the subject, a step, the root, before the root, in :has() or in :not()", ({ parse }) => {
		const blocks = classifyAll(
			parse(`
				.card > [data-part="footer"] > [data-slot="action"] { justify-self: end; }
				.card [data-part="title"] { color: red; }
				.tab[data-part="tab"] { color: red; }
				[data-part="panel"] .card { margin: 0; }
				.field:has(:where([data-part="input"]):disabled) { opacity: 0.6; }
				.field:where(:not(:disabled, :has(:where([data-part="input"]):disabled))):hover { color: red; }
				.menu:not([data-part="item"]) { color: red; }
				.menu [data-part] { margin: 0; }
				.card { color: red; }
			`),
		);
		expect(
			blocks.map((block) => block.partMentions.map((mention) => [mention.name, mention.where, mention.on])),
		).toEqual([
			[["footer", "step", undefined]],
			[["title", "subject", undefined]],
			[["tab", "root", undefined]],
			[["panel", "context", undefined]],
			[["input", "has", "subject"]],
			[["input", "has", "subject"]],
			[["item", "condition", "subject"]],
			[[undefined, "subject", undefined]],
			[],
		]);
	});

	inEverySyntax(
		"on a root's own compound it is no condition, so the kind comes from the rest",
		({ parse }) => {
			const blocks = classifyAll(
				parse(
					'.tab[data-part="tab"] { color: red; } .tab[data-part="tab"][aria-selected="true"] { color: blue; }',
				),
			);
			expect(blocks.map(conditions)).toEqual([
				[],
				[['[aria-selected="true"]', "state", "semantic", "subject"]],
			]);
			expect(kinds(blocks)).toEqual([
				["own", []],
				["state", ["semantic"]],
			]);
			expect(steps(blocks[0])).toEqual([[undefined, "root", ".tab"]]);
		},
	);
});

describe("never throws", () => {
	const samples = [
		".a::after::before { color: red; }",
		".a { &::after { &:hover { color: red; } } }",
		".a, { color: red; }",
		":is(.a, .b) .c { color: red; }",
		":where(.a) { color: red; }",
		"* { margin: 0; }",
		".a:not() { color: red; }",
		".a:has() { color: red; }",
		".a:is(:has(> .b, + .c), :not(:where())) { color: red; }",
		".a + .b ~ .c > .d + .e { color: red; }",
		"@scope (.a) { :scope + :scope { color: red; } & + & { color: red; } }",
		"@scope (.a) { + .b { color: red; } }",
		".a { > .b { color: red; } + .c { color: red; } }",
		"[data-part] [data-slot] { color: red; }",
		'[data-part="x"] .a [data-part=""] { color: red; }',
		"@container style() { .a { color: red; } }",
		"@container style(not) { .a { color: red; } }",
		"@container style((--a: 1) or) { .a { color: red; } }",
		"@container not style(--a: 1) and style(--b > 2) { .a { color: red; } }",
	];

	inEverySyntax("on selectors and queries of any shape", ({ parse }) => {
		for (const css of samples) expect(() => classifyAll(parse(css))).not.toThrow();
	});

	inEverySyntax("what comes before the root is kept as context", ({ parse }) => {
		const [block] = classifyAll(parse('[data-part="panel"] > .button { color: red; }'));
		expect(block?.context.map((step) => [step.combinator, step.names, step.name])).toEqual([
			[undefined, "part", "panel"],
		]);
		expect(steps(block)).toEqual([[undefined, "root", ".button"]]);
	});
});
