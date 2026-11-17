import { defaults } from "@statefulcss/config";
import { describe, expect } from "vitest";

import type { Model } from "../model.js";
import { inEverySyntax } from "../testing/syntaxes.js";

const keyOf = (model: Model, id: number | undefined) =>
	id === undefined ? undefined : model.elements[id]?.key;
const guards = (model: Model) =>
	model.guards.map((guard) => [keyOf(model, guard.element), guard.blocking, guard.blocks]);
const kinds = (model: Model) =>
	model.blocks.map((block) => (block.kind === "state" ? block.groups : block.kind));

const four = [":disabled", '[aria-disabled="true"]', "[data-loading]", "[inert]"];

describe("what a guard excludes", () => {
	inEverySyntax(
		"a compound in :not() excludes none of its states on its own, a list each of them",
		({ read }) => {
			const model = read(`
			.button:where(:not(:disabled[aria-disabled="true"][data-loading][inert])):hover { color: red; }
			.button:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])):hover { color: red; }
			.button:where(:not(:disabled, [data-loading][inert])):hover { color: red; }
		`);
			expect(guards(model)).toEqual([
				[".button", [], [0]],
				[".button", four, [1]],
				[".button", [":disabled"], [2]],
			]);
			const [compound] = model.guards[0]?.condition.inner ?? [];
			expect(compound).toMatchObject({ compound: true, kind: "state" });
			expect(compound?.inner.map((inner) => inner.text)).toEqual(four);
			expect(model.guards[1]?.condition.inner.map((inner) => inner.compound)).toEqual([
				false,
				false,
				false,
				false,
			]);
			expect(kinds(model)).toEqual([["interaction"], ["interaction"], ["interaction"]]);
			expect(model.blocks.map((block) => block.guard)).toEqual([0, 1, 2]);
		},
	);

	inEverySyntax(
		":is() inside the exclusion excludes each alternative, and :not() inside turns it around",
		({ read }) => {
			const model = read(`
			.button:not(:is(:disabled, [inert])):hover { color: red; }
			.button:not(:not(:disabled)):hover { color: red; }
		`);
			expect(guards(model)).toEqual([[".button", [":disabled", "[inert]"], [0]]]);
			expect(model.blocks.map((block) => block.guard)).toEqual([0, undefined]);
		},
	);

	const states = [":focus", ":disabled"];
	for (const list of [states.join(", "), [...states].reverse().join(", ")]) {
		inEverySyntax(`:not(:is(${list})) excludes :disabled, in either order`, ({ read }) => {
			const model = read(`.card:not(:is(${list})):hover { color: red; }`);
			expect(guards(model)).toEqual([[".card", [":disabled"], [0]]]);
			expect(model.blocks.map((block) => block.guard)).toEqual([0]);
		});
	}

	inEverySyntax("what names the element makes the exclusion a compound, which covers nothing", ({ read }) => {
		const model = read(`
			.button:where(:not(:root:disabled)):hover { color: red; }
			.button:not(:where(:root:disabled)):hover { color: red; }
			@scope (.button) to ([data-component]) {
				:scope:not(:scope:disabled):hover { color: red; }
			}
		`);
		expect(guards(model)).toEqual([
			[".button", [], [0]],
			[".button", [], [1]],
			[".button", [], [2]],
		]);
	});

	const alternatives = [":scope", ":not(:disabled)"];
	for (const list of [alternatives.join(", "), [...alternatives].reverse().join(", ")]) {
		inEverySyntax(`a list that the scope's root can match (:where(${list})) excludes nothing`, ({ read }) => {
			const model = read(`
				@scope (.button) to ([data-component]) {
					:scope:where(${list}):hover { color: red; }
				}
				.button:is(${list.replace(":scope", ":root")}):hover { color: red; }
				.button:is(${list.replace(":scope", "*")}):hover { color: red; }
			`);
			expect(guards(model)).toEqual([]);
			expect(kinds(model)).toEqual([["interaction"], ["interaction"], ["interaction"]]);
		});
	}

	inEverySyntax("it lists the settings' entries as the settings write them", ({ read }) => {
		const settings = {
			...defaults,
			blockingStates: [":nth-child(2n+1)", ":DISABLED", ":disabled", "[aria-busy='true']"],
		};
		const model = read(
			`
			.button:not(:nth-child(2n + 1)):hover { color: red; }
			.button:where(:not(:disabled, [aria-busy="true"], :Disabled)):hover { color: red; }
			.button:not(:nth-child(2n + 2)):hover { color: red; }
		`,
			{ settings },
		);
		expect(guards(model)).toEqual([
			[".button", [":nth-child(2n+1)"], [0]],
			[".button", [":DISABLED", ":disabled", "[aria-busy='true']"], [1]],
		]);
		// The condition keeps the text as written.
		expect(model.guards[0]?.condition.inner.map((inner) => inner.text)).toEqual([":nth-child(2n + 1)"]);
	});

	inEverySyntax("a :has() state that joined the guard stays its own entry", ({ read }) => {
		const model = read(`
			.field {
				&:where(:not(:disabled, [inert], :has(:where([data-part="input"]):disabled))) {
					&:hover { color: red; }
				}
			}
		`);
		expect(guards(model)).toEqual([[".field", [":disabled", "[inert]"], [0]]]);
		expect(
			model.guards[0]?.condition.inner.map((inner) => [inner.text.slice(0, 5), inner.has !== undefined]),
		).toEqual([
			[":disa", false],
			["[iner", false],
			[":has(", true],
		]);
	});
});

describe("whose guard it is", () => {
	for (const list of [".button, .link", ".link, .button"]) {
		inEverySyntax(`written once for ${list}, a guard is one for each element`, ({ read }) => {
			const model = read(`${list} { &:where(:not(:disabled)):hover { color: red; } }`);
			const [first, second] = list.split(", ");
			expect(guards(model)).toEqual([
				[first, [":disabled"], [0]],
				[second, [":disabled"], [1]],
			]);
			expect(model.blocks.map((block) => [keyOf(model, block.element), block.guard])).toEqual([
				[first, 0],
				[second, 1],
			]);
			expect(model.blocks.map((block) => block.conditions[0]?.guard)).toEqual([0, 1]);
		});
	}

	inEverySyntax("the blocks nested in one written guard on one element share it", ({ read }) => {
		const model = read(`
			.button {
				&:where(:not(:disabled)) { &:hover { color: red; } &:active { color: blue; } }
				&:where(:not(:disabled)) { &[aria-pressed="true"]:where(:hover) { color: green; } }
			}
		`);
		expect(guards(model)).toEqual([
			[".button", [":disabled"], [0, 1]],
			[".button", [":disabled"], [2]],
		]);
	});

	inEverySyntax(
		"a guard on a step before the subject is that step's, and doesn't guard the subject",
		({ read }) => {
			const model = read(`
			@scope (.tabs) to ([data-component]) {
				[data-part="panel"]:where(:not(:disabled)) > [data-part="tab"]:hover { color: red; }
				[data-part="panel"] > [data-part="tab"]:where(:not(:disabled)):hover { color: red; }
				p:not(:disabled) > [data-part="tab"]:hover { color: red; }
			}
		`);
			expect(guards(model)).toEqual([
				['.tabs [data-part="panel"]', [":disabled"], [0]],
				['.tabs [data-part="tab"]', [":disabled"], [1]],
				[undefined, [":disabled"], [2]],
			]);
			expect(model.blocks.map((block) => block.guard)).toEqual([undefined, 1, undefined]);
			expect(
				model.blocks[0]?.conditions.map((condition) => [
					condition.kind,
					condition.on,
					condition.step,
					condition.guard,
				]),
			).toEqual([
				["guard", "path", 1, 0],
				["state", "subject", 2, undefined],
			]);
			// A disabled tab in an enabled panel still matches the first block: the tab's hover has no guard of its own.
			expect(model.blocks.map((block) => keyOf(model, block.element))).toEqual([
				'.tabs [data-part="tab"]',
				'.tabs [data-part="tab"]',
				'.tabs [data-part="tab"]',
			]);
		},
	);

	inEverySyntax("a guard before the root, on the root, and on a pseudo-element's host", ({ read }) => {
		const model = read(`
			:not(:disabled) .button:hover { color: red; }
			.button:where(:not(:disabled)):hover [data-part="icon"] { color: red; }
			.button:where(:not(:disabled)):hover::after { opacity: 1; }
		`);
		expect(guards(model)).toEqual([
			[undefined, [":disabled"], [0]],
			[".button", [":disabled"], [1]],
			[".button", [":disabled"], [2]],
		]);
		expect(model.blocks.map((block) => [keyOf(model, block.element), block.guard])).toEqual([
			[".button", undefined],
			['.button [data-part="icon"]', undefined],
			[".button::after", 2],
		]);
		expect(model.blocks[0]?.conditions[0]).toMatchObject({ kind: "guard", on: "context", step: undefined });
	});
});

describe("a guard that only one alternative holds", () => {
	for (const where of [":where(:not(:disabled), [data-force])", ":where([data-force], :not(:disabled))"]) {
		inEverySyntax(`${where} guards nothing: the other alternative matches a disabled element`, ({ read }) => {
			const model = read(`.button${where}:hover { color: red; }`);
			expect(model.guards).toEqual([]);
			expect(model.blocks[0]).toMatchObject({
				kind: "state",
				groups: ["interaction", "semantic"],
				guard: undefined,
			});
			const [alternatives, hover] = model.blocks[0]?.conditions ?? [];
			expect(alternatives).toMatchObject({
				kind: "state",
				group: "semantic",
				inWhere: true,
				compound: false,
			});
			expect(alternatives?.inner.map((inner) => inner.kind).sort()).toEqual(["guard", "state"]);
			expect(hover).toMatchObject({ text: ":hover", inWhere: false });
		});
	}

	inEverySyntax(
		"with every blocking state in the exclusion, an alternative still gets around it",
		({ read }) => {
			const model = read(`
			.button:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert]), [data-force]):hover { color: red; }
			.button:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])):hover { color: red; }
			.button:is(:not(:disabled)):hover { color: red; }
		`);
			expect(guards(model)).toEqual([
				[".button", four, [1]],
				[".button", [":disabled"], [2]],
			]);
			expect(model.blocks.map((block) => block.guard)).toEqual([undefined, 0, 1]);
			expect(
				model.blocks.map((block) => block.conditions.find((one) => one.kind === "guard")?.inWhere),
			).toEqual([undefined, true, false]);
		},
	);
});
