import { describe, expect } from "vitest";

import type { Model } from "../model.js";
import { noUndeclaredStateVariables } from "../testing/no-undeclared-state-variables.js";
import { partsInScope } from "../testing/parts-in-scope.js";
import { inEverySyntax } from "../testing/syntaxes.js";

const keyOf = (model: Model, id: number | undefined) =>
	id === undefined ? undefined : model.elements[id]?.key;
const elements = (model: Model) => model.elements.map((element) => [element.kind, element.key]);
const references = (model: Model) =>
	model.partReferences.map((reference) => [
		reference.name,
		reference.place,
		reference.inHas,
		reference.blocks,
	]);
const sources = (model: Model) =>
	model.reads.map((read) => [
		keyOf(model, read.element),
		read.name,
		read.source === undefined ? undefined : keyOf(model, model.variables[read.source]?.element),
	]);
const placement = (model: Model) => partsInScope(model).map((finding) => finding.problem);
const undeclared = (model: Model) => noUndeclaredStateVariables(model).map((finding) => finding.problem);

describe("a part named by a selector list", () => {
	const paths = ['& > [data-slot="action"]', '& [data-slot="action"]'];
	for (const list of [paths.join(", "), [...paths].reverse().join(", ")]) {
		inEverySyntax(`a placement path taken twice (${list}) is checked on both blocks`, ({ read }) => {
			const model = read(`.card { & > [data-part="footer"] { ${list} { color: red; } } }`);
			expect(references(model)).toEqual([["footer", "placement-path", false, [0, 1]]]);
			expect(placement(model)).toEqual(["placement-path-not-direct"]);
		});
	}

	inEverySyntax("and on both rules, when two rules nested in it take it", ({ read }) => {
		const direct = '& > [data-slot="a"] { color: red; }';
		const descendant = '& [data-slot="b"] { color: red; }';
		for (const rules of [`${direct} ${descendant}`, `${descendant} ${direct}`]) {
			const model = read(`.card { & > [data-part="footer"] { ${rules} } }`);
			expect(references(model)).toEqual([["footer", "placement-path", false, [0, 1]]]);
			expect(placement(model)).toEqual(["placement-path-not-direct"]);
		}
	});

	inEverySyntax("a path that steps with > in every block is fine", ({ read }) => {
		const model = read(
			'.card { & > [data-part="footer"] { & > [data-slot="a"], & > [data-slot="b"] { color: red; } } }',
		);
		expect(references(model)).toEqual([["footer", "placement-path", false, [0, 1]]]);
		expect(placement(model)).toEqual([]);
	});
});

describe("a part named inside a selector function", () => {
	const states = ['[data-part="input"]:disabled', '[data-part="control"]:disabled'];
	for (const list of [states.join(", "), [...states].reverse().join(", ")]) {
		inEverySyntax(`:has(${list}) names both parts`, ({ read }) => {
			const model = read(`.field:has(${list}) { opacity: 0.6; }`);
			const [first, second] = list.startsWith('[data-part="input"]')
				? ["input", "control"]
				: ["control", "input"];
			expect(references(model)).toEqual([
				[first, "has", true, [0]],
				[second, "has", true, [0]],
			]);
			expect(elements(model)).toEqual([
				["root", ".field"],
				["part", `.field [data-part="${first}"]`],
				["part", `.field [data-part="${second}"]`],
			]);
			expect(model.blocks[0]).toMatchObject({ kind: "state", groups: ["blocking"] });
			expect(placement(model)).toEqual([]);
		});
	}

	inEverySyntax(
		"a part attribute with no value, or one that matches several names, is a reference with no name",
		({ read }) => {
			const model = read(`
			.field:has([data-part]) { color: red; }
			.card:not([data-part^="ico"]) { color: red; }
		`);
			expect(references(model)).toEqual([
				[undefined, "has", true, [0]],
				[undefined, "outside", false, [1]],
			]);
			expect(elements(model)).toEqual([
				["root", ".field"],
				["root", ".card"],
			]);
		},
	);

	inEverySyntax(
		"a part in :nth-child(… of …) or in a path inside :not() is still named, outside the scope",
		({ read }) => {
			const model = read(`
			.card:nth-child(2 of [data-part="secret"]) { color: red; }
			.card:not([data-part="secret"] > span) { color: red; }
		`);
			expect(references(model)).toEqual([
				["secret", "outside", false, [0]],
				["secret", "outside", false, [1]],
			]);
			expect(model.blocks.map((block) => block.kind)).toEqual(["variant", "unknown"]);
			expect(placement(model)).toEqual(["part-outside-scope", "part-outside-scope"]);
		},
	);

	inEverySyntax(
		"a sibling before a slot is a position, and its part is named outside a placement path",
		({ read }) => {
			const model = read('.card > [data-part="footer"] + [data-slot="action"] { color: red; }');
			expect(references(model)).toEqual([["footer", "outside", false, [0]]]);
			expect(elements(model)).toEqual([
				["root", ".card"],
				["slot", '.card [data-slot="action"]'],
			]);
			expect(model.blocks[0]?.conditions.map((condition) => [condition.text, condition.kind])).toEqual([
				['[data-part="footer"] +', "variant"],
			]);
			expect(placement(model)).toEqual(["part-outside-scope"]);
		},
	);

	inEverySyntax("inside a scope, a part named as a sibling is in its place", ({ read }) => {
		const model = read(
			'@scope (.tabs) to ([data-component]) { [data-part="tab"] + [data-part="tab"] { margin: 0; } }',
		);
		expect(references(model)).toEqual([
			["tab", "scope", false, [0]],
			["tab", "scope", false, [0]],
		]);
		expect(placement(model)).toEqual([]);
	});
});

describe("the :has() exception is for a block that writes on the root", () => {
	const has = '.field:has(:where([data-part="input"]):disabled)';
	inEverySyntax("on the root it holds; before a descendant or a pseudo-element it doesn't", ({ read }) => {
		const model = read(`
			${has} { opacity: 0.6; }
			${has} .label { color: gray; }
			${has}::after { opacity: 1; }
		`);
		expect(references(model)).toEqual([
			["input", "has", true, [0]],
			["input", "outside", true, [1]],
			["input", "outside", true, [2]],
		]);
		expect(model.blocks.map((block) => keyOf(model, block.element))).toEqual([
			".field",
			".field .label",
			".field::after",
		]);
		expect(placement(model)).toEqual(["part-outside-scope", "part-outside-scope"]);
	});
});

describe("a part named inside :where()", () => {
	inEverySyntax("is the same part as written alone, with no specificity of its own", ({ read }) => {
		const model = read(`
			.card { --p-icon-color: red; &:hover { --p-icon-color: blue; } }
			@scope (.card) to ([data-component]) {
				:where([data-part="icon"]) { color: var(--p-icon-color); }
				[data-part="icon"] { fill: var(--p-icon-color); }
				:where([data-part="icon"]):hover { color: red; }
				:where([data-part="icon"]:hover) { color: blue; }
			}
		`);
		expect(elements(model)).toEqual([
			["root", ".card"],
			["part", '.card [data-part="icon"]'],
		]);
		expect(
			model.blocks.slice(2).map((block) => [block.selector, block.kind, block.path[1]?.inWhere]),
		).toEqual([
			['.card :where([data-part="icon"])', "own", true],
			['.card [data-part="icon"]', "own", false],
			['.card :where([data-part="icon"]):hover', "state", true],
			['.card :where([data-part="icon"]:hover)', "state", true],
		]);
		expect(
			model.blocks.slice(4).map((block) => block.conditions.map((condition) => condition.inWhere)),
		).toEqual([[false], [true]]);
		const [variable] = model.variables;
		expect(variable?.namedFor.map((id) => keyOf(model, id))).toEqual(['.card [data-part="icon"]']);
		expect(sources(model)).toEqual([
			['.card [data-part="icon"]', "--p-icon-color", ".card"],
			['.card [data-part="icon"]', "--p-icon-color", ".card"],
		]);
		expect(references(model).map(([name, place]) => [name, place])).toEqual([
			["icon", "scope"],
			["icon", "scope"],
			["icon", "scope"],
			["icon", "scope"],
		]);
		expect(undeclared(model)).toEqual([]);
	});

	inEverySyntax("a component named inside :where() or :is() is that component", ({ read }) => {
		const model = read(":where(.card) { color: red; } :is(.card):hover { color: blue; }");
		expect(elements(model)).toEqual([["root", ".card"]]);
		expect(model.blocks.map((block) => [block.selector, block.kind])).toEqual([
			[":where(.card)", "own"],
			[":is(.card):hover", "state"],
		]);
	});
});

describe("& inside a selector function", () => {
	inEverySyntax(":is(&) and :where(&) are the enclosing rule's element", ({ read }) => {
		const model = read(`
			.card {
				--s-color: red;
				:is(&):hover { color: var(--s-color); }
				:where(&)[data-tone="muted"] { color: var(--s-color); }
				:is(&.x) > [data-slot="action"] { margin: 0; }
			}
		`);
		expect(model.unknowns).toEqual([]);
		expect(model.blocks.map((block) => [block.selector, keyOf(model, block.element), block.kind])).toEqual([
			[".card", ".card", "own"],
			[".card:hover", ".card", "state"],
			['.card[data-tone="muted"]', ".card", "variant"],
			['.card.x > [data-slot="action"]', '.card [data-slot="action"]', "unknown"],
		]);
		expect(sources(model)).toEqual([
			[".card", "--s-color", ".card"],
			[".card", "--s-color", ".card"],
		]);
		expect(undeclared(model)).toEqual([]);
	});

	inEverySyntax(
		"inside :not(), :has() or a list, & doesn't say whose rule it is, so the rule is unknown",
		({ read }) => {
			const model = read(`
			.card {
				color: red;
				:not(&) { color: blue; }
				.other:has(&) { color: blue; }
				:is(&, .other):hover { color: blue; }
				&:hover { color: green; }
			}
		`);
			expect(model.unknowns.map((unknown) => [unknown.reason, unknown.detail, unknown.elements])).toEqual([
				["unparsable-selector", "& inside :not()", [0]],
				["unparsable-selector", "& inside :has()", [0]],
				["unparsable-selector", "& inside :is()", [0]],
			]);
			expect(model.blocks.map((block) => block.selector)).toEqual([".card", ".card:hover"]);
		},
	);
});

describe("what a nested rule writes before &", () => {
	inEverySyntax("is context: the rule still styles the component it's nested in", ({ read }) => {
		const model = read(`
			.card {
				--s-color: red;
				.dark & { color: var(--s-color); &:hover { color: var(--s-color); } }
				.dark & > [data-slot="action"] { margin: 0; }
			}
		`);
		expect(elements(model)).toEqual([
			["root", ".card"],
			["slot", '.card [data-slot="action"]'],
		]);
		expect(model.blocks.map((block) => [block.selector, keyOf(model, block.element), block.kind])).toEqual([
			[".card", ".card", "own"],
			[".dark .card", ".card", "unknown"],
			[".dark .card:hover", ".card", "unknown"],
			['.dark .card > [data-slot="action"]', '.card [data-slot="action"]', "unknown"],
		]);
		expect(
			model.blocks[1]?.conditions.map((condition) => [condition.text, condition.kind, condition.on]),
		).toEqual([[".dark", "unknown", "context"]]);
		expect(sources(model)).toEqual([
			[".card", "--s-color", ".card"],
			[".card", "--s-color", ".card"],
		]);
		expect(undeclared(model)).toEqual([]);
	});

	inEverySyntax("written flat, the same selector starts from the class it starts with", ({ read }) => {
		const model = read(".card { --s-color: red; } .dark .card { color: var(--s-color); }");
		expect(elements(model)).toEqual([
			["root", ".card"],
			["root", ".dark"],
			["content", ".dark .card"],
		]);
		expect(model.blocks[1]).toMatchObject({ selector: ".dark .card", kind: "own", reach: "descendant" });
		expect(sources(model)).toEqual([[".dark .card", "--s-color", undefined]]);
		expect(undeclared(model)).toEqual(["undeclared"]);
	});
});

describe("a rule with no declarations", () => {
	inEverySyntax("still names its part, for a variable to be named for", ({ read }) => {
		const model = read(`
			.card { --p-title-color: red; }
			@scope (.card) to ([data-component]) { [data-part="title"] {} }
		`);
		expect(elements(model)).toEqual([
			["root", ".card"],
			["part", '.card [data-part="title"]'],
		]);
		expect(model.elements[1]?.blocks).toEqual([]);
		expect(model.variables[0]?.namedFor.map((id) => keyOf(model, id))).toEqual(['.card [data-part="title"]']);
	});

	inEverySyntax("and an unknown in it names that part", ({ read }) => {
		const model = read(`
			.card {}
			@scope (.card) to ([data-component]) { [data-part="icon"] { @include stuff; } }
		`);
		expect(model.unknowns.map((unknown) => unknown.elements.map((id) => keyOf(model, id)))).toEqual([
			['.card [data-part="icon"]'],
		]);
		expect(model.blocks).toEqual([]);
	});
});

describe("a foreign subject inside a transparent wrapper", () => {
	inEverySyntax(
		":where(:global(.x)) is as foreign as :global(.x), and a list with one in it too",
		({ read }) => {
			const model = read(`
			@scope (.card) to ([data-component]) {
				:global(.x) { color: var(--s-c); }
				:where(:global(.x)) { color: var(--s-c); }
				:is(.local, :global(.y)) { color: var(--s-c); }
				.local { color: var(--s-c); }
			}
		`);
			expect(model.blocks.map((block) => model.elements[block.element]?.kind)).toEqual([
				"foreign",
				"foreign",
				"foreign",
				"content",
			]);
			expect(undeclared(model)).toEqual(["undeclared"]);
		},
	);
});

describe("an attribute scope and class roots of its name", () => {
	const roots = [".fooBar { --_icon-color: red; }", ".foo-bar {}"];
	const scope =
		'@scope ([data-component="foo-bar"]) to ([data-component]) { [data-part="icon"] { color: var(--_icon-color); } }';
	for (const order of [roots, [...roots].reverse()]) {
		inEverySyntax(
			`with two candidates (${order.map((rule) => rule.split(" ")[0]).join(", ")}), the scope joins neither`,
			({ read }) => {
				const model = read(`${order.join("\n")}\n${scope}`);
				expect(
					model.components
						.map((component) => [component.identity.kind, component.name, component.hasRootBlock])
						.sort(),
				).toEqual([
					["attribute", "foo-bar", false],
					["class", "foo-bar", true],
					["class", "foo-bar", true],
				]);
				const [attributeScope] = model.scopes;
				expect(model.components[attributeScope?.component ?? -1]?.identity.kind).toBe("attribute");
				expect(model.elements.find((element) => element.kind === "part")?.key).toBe(
					'[data-component="foo-bar"] [data-part="icon"]',
				);
				expect(sources(model)).toEqual([
					['[data-component="foo-bar"] [data-part="icon"]', "--_icon-color", undefined],
				]);
			},
		);
	}

	inEverySyntax("with one candidate, the scope joins it", ({ read }) => {
		const model = read(`${roots[0] ?? ""}\n${scope}`);
		expect(model.components.map((component) => [component.identity.kind, component.name])).toEqual([
			["class", "foo-bar"],
		]);
		expect(sources(model)).toEqual([['.fooBar [data-part="icon"]', "--_icon-color", ".fooBar"]]);
		expect(undeclared(model)).toEqual([]);
	});
});

describe("a doc comment above a selector list", () => {
	const comment = "/**\n * Widget\n * @sets --vendor-gap\n */";
	for (const list of ["a, .widget", ".widget, a"]) {
		inEverySyntax(`above ${list}, it belongs to the one component the list names`, ({ read }) => {
			const model = read(`${comment}\n${list} { --vendor-gap: 1; }`);
			const widget = model.components.find((component) => component.name === "widget");
			expect(model.docComments.map((one) => one.component)).toEqual([widget?.id]);
			expect(widget?.docComment).toBe(0);
			expect(
				model.declarations
					.map((declaration) => [keyOf(model, model.blocks[declaration.block]?.element), declaration.role])
					.sort(),
			).toEqual([
				[".widget", "library"],
				["a", "none"],
			]);
		});
	}

	inEverySyntax("above a list that names two components, it belongs to neither", ({ read }) => {
		for (const list of [".card, .note", ".note, .card"]) {
			const model = read(`${comment}\n${list} { --vendor-gap: 1; }`);
			expect(model.docComments.map((one) => one.component)).toEqual([undefined]);
			expect(model.declarations.map((declaration) => declaration.role)).toEqual(["none", "none"]);
		}
	});
});
