import { describe, expect } from "vitest";

import type { Model } from "../model.js";
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
/** The reads on a component's own elements that reach no variable: what rule 4 reports as undeclared. */
const unreached = (model: Model) =>
	model.reads
		.filter((read) => read.source === undefined && model.elements[read.element]?.kind !== "foreign")
		.map((read) => read.name);
/** Whether every block steps from the root with `>`, as the placement path rule 9 accepts does. */
const stepsWithChild = (model: Model) =>
	model.blocks.every((block) => block.path.every((step, index) => index === 0 || step.combinator === ">"));

describe("a part named by a selector list", () => {
	const paths = ['& > [data-slot="action"]', '& [data-slot="action"]'];
	for (const list of [paths.join(", "), [...paths].reverse().join(", ")]) {
		inEverySyntax(`a placement path taken twice (${list}) is checked on both blocks`, ({ read }) => {
			const model = read(`.card { & > [data-part="footer"] { ${list} { color: red; } } }`);
			expect(references(model)).toEqual([["footer", "placement-path", false, [0, 1]]]);
			expect(stepsWithChild(model)).toBe(false);
		});
	}

	inEverySyntax("and on both rules, when two rules nested in it take it", ({ read }) => {
		const direct = '& > [data-slot="a"] { color: red; }';
		const descendant = '& [data-slot="b"] { color: red; }';
		for (const rules of [`${direct} ${descendant}`, `${descendant} ${direct}`]) {
			const model = read(`.card { & > [data-part="footer"] { ${rules} } }`);
			expect(references(model)).toEqual([["footer", "placement-path", false, [0, 1]]]);
			expect(stepsWithChild(model)).toBe(false);
		}
	});

	inEverySyntax("a path that steps with > in every block is fine", ({ read }) => {
		const model = read(
			'.card { & > [data-part="footer"] { & > [data-slot="a"], & > [data-slot="b"] { color: red; } } }',
		);
		expect(references(model)).toEqual([["footer", "placement-path", false, [0, 1]]]);
		expect(stepsWithChild(model)).toBe(true);
	});
});

describe("a part named under a list of two components", () => {
	const roots = [".card", ".button"];
	for (const order of [roots, [...roots].reverse()]) {
		const list = order.join(", ");
		inEverySyntax(`belongs to each component for its own blocks (${list})`, ({ read }) => {
			const model = read(`${list} { & > [data-part="x"] { color: red; } }`);
			const owners = model.partReferences.map((reference) => [
				reference.component === undefined ? undefined : model.components[reference.component]?.name,
				reference.blocks.map((id) => keyOf(model, model.blocks[id]?.element)),
			]);
			expect(owners).toEqual(order.map((root) => [root.slice(1), [`${root} [data-part="x"]`]]));
		});

		inEverySyntax(`and so does one inside the root's :has() (${list})`, ({ read }) => {
			const model = read(`${list} { &:has([data-part="input"]) { color: red; } }`);
			expect(
				model.partReferences.map((reference) => [
					reference.component === undefined ? undefined : model.components[reference.component]?.name,
					reference.place,
					reference.blocks,
				]),
			).toEqual(order.map((root, index) => [root.slice(1), "has", [index]]));
		});
	}
});

describe("a list of parts inside :is()", () => {
	const named = ['[data-part="x"]', '[data-part="y"]'];
	for (const list of [named.join(", "), [...named].reverse().join(", ")]) {
		inEverySyntax(`writes on both parts (:is(${list})), as a selector list does`, ({ read }) => {
			const model = read(`
				@scope (.card) to ([data-component]) {
					:is(${list}) { --s-c: red; }
					[data-part="x"] { color: var(--s-c); }
					[data-part="y"] { color: var(--s-c); }
				}
			`);
			const order = list.startsWith('[data-part="x"]') ? ["x", "y"] : ["y", "x"];
			expect(model.blocks.slice(0, 2).map((block) => [keyOf(model, block.element), block.kind])).toEqual(
				order.map((name) => [`.card [data-part="${name}"]`, "own"]),
			);
			expect(sources(model)).toEqual([
				['.card [data-part="x"]', "--s-c", '.card [data-part="x"]'],
				['.card [data-part="y"]', "--s-c", '.card [data-part="y"]'],
			]);
			expect(unreached(model)).toEqual([]);
			expect(model.partReferences.slice(0, 2).map((reference) => [reference.name, reference.place])).toEqual(
				order.map((name) => [name, "scope"]),
			);
		});
	}

	inEverySyntax(
		":where() keeps each part at zero specificity, and other lists stay one condition",
		({ read }) => {
			const model = read(`
			@scope (.card) to ([data-component]) {
				:where([data-part="x"], [data-part="y"]) { color: red; }
				:is([data-part="x"], .other) { color: red; }
			}
		`);
			expect(model.blocks.map((block) => [block.selector, keyOf(model, block.element)])).toEqual([
				['.card :where([data-part="x"])', '.card [data-part="x"]'],
				['.card :where([data-part="y"])', '.card [data-part="y"]'],
				['.card :is([data-part="x"], .other)', ".card *"],
			]);
			expect(model.blocks.slice(0, 2).map((block) => block.path.at(-1)?.inWhere)).toEqual([true, true]);
		},
	);
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
		expect(unreached(model)).toEqual([]);
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
		expect(unreached(model)).toEqual([]);
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

	for (const readable of ['& > [data-part="x"]', "&:hover"]) {
		const branches = [":not(&)", readable];
		for (const list of [branches.join(", "), [...branches].reverse().join(", ")]) {
			inEverySyntax(`in a list (${list}), only that selector is unknown`, ({ read }) => {
				const model = read(`.card { ${list} { color: var(--s-c); } }`);
				expect(model.unknowns.map((unknown) => [unknown.reason, unknown.detail, unknown.elements])).toEqual([
					["unparsable-selector", "& inside :not()", [0]],
				]);
				const resolved = readable.replaceAll("&", ".card");
				expect(model.blocks.map((block) => block.selector)).toEqual([resolved]);
				expect(references(model)).toEqual(
					readable.includes("data-part") ? [["x", "outside", false, [0]]] : [],
				);
				expect(model.reads.map((one) => keyOf(model, one.element))).toEqual([
					readable.includes("data-part") ? '.card [data-part="x"]' : ".card",
				]);
			});
		}
	}

	const top = ["&:hover", ".card"];
	for (const list of [top.join(", "), [...top].reverse().join(", ")]) {
		inEverySyntax(`with no parent rule (${list}), & is unknown on its own`, ({ read }) => {
			const model = read(`${list} { color: red; }`);
			expect(model.unknowns.map((unknown) => [unknown.reason, unknown.detail])).toEqual([
				["unparsable-selector", "& outside a rule"],
			]);
			expect(model.blocks.map((block) => block.selector)).toEqual([".card"]);
		});
	}
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
		expect(unreached(model)).toEqual([]);
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
		expect(unreached(model)).toEqual(["--s-color"]);
	});
});

describe("a rule with no declarations", () => {
	for (const body of ["", "@include theme;"]) {
		inEverySyntax(`names its part through a block with no declarations (${body || "empty"})`, ({ read }) => {
			const model = read(`.card [data-part="x"] { ${body} }`);
			expect(references(model)).toEqual([["x", "outside", false, [0]]]);
			expect(model.blocks.map((block) => [block.selector, block.declarations])).toEqual([
				['.card [data-part="x"]', []],
			]);
			expect(model.partReferences[0]?.at.index).toBe(6);
		});
	}

	inEverySyntax("keeps its selector's facts: the scope's condition, :scope, and the steps", ({ read }) => {
		const model = read(`
			.card { color: red; & > div > [data-part="footer"] > [data-slot="action"] { @include place; } }
			@scope (.card:hover) to ([data-component]) { :scope [data-part="icon"] { @include paint; } }
			@layer utilities { .stack [data-part="icon"] { @include paint; } }
		`);
		// The rule with no declarations doesn't split the Card's run, so its block comes first.
		const [placement, , scoped, utility] = model.blocks;
		expect(placement?.path.map((step) => [step.combinator, step.names])).toEqual([
			[undefined, "root"],
			[">", "other"],
			[">", "part"],
			[">", "slot"],
		]);
		expect(scoped?.conditions.map((condition) => [condition.text, condition.at.node.type])).toEqual([
			[":hover", "atrule"],
		]);
		expect([scoped?.scopeRoot, scoped?.scopeRootAt?.index]).toEqual([":scope", 0]);
		expect(model.elements[utility?.element ?? -1]?.kind).toBe("utility");
		expect(model.blocks.map((block) => block.declarations.length)).toEqual([0, 1, 0, 0]);
	});

	inEverySyntax("names it once more when the same rule declares too", ({ read }) => {
		const model = read('.card [data-part="x"] { @include theme; color: red; }');
		expect(references(model)).toEqual([["x", "outside", false, [0]]]);
	});

	inEverySyntax("but one that only holds nested rules names it through theirs", ({ read }) => {
		const model = read('.card { & > [data-part="footer"] { & > [data-slot="a"] { color: red; } } }');
		expect(references(model)).toEqual([["footer", "placement-path", false, [0]]]);
	});

	inEverySyntax("still names its part, for a variable to be named for", ({ read }) => {
		const model = read(`
			.card { --p-title-color: red; }
			@scope (.card) to ([data-component]) { [data-part="title"] {} }
		`);
		expect(elements(model)).toEqual([
			["root", ".card"],
			["part", '.card [data-part="title"]'],
		]);
		expect(model.elements[1]?.blocks).toEqual([1]);
		expect(model.blocks[1]?.declarations).toEqual([]);
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
		expect(model.blocks.map((block) => [keyOf(model, block.element), block.declarations])).toEqual([
			[".card", []],
			['.card [data-part="icon"]', []],
		]);
	});
});

describe("a foreign subject inside a transparent wrapper", () => {
	inEverySyntax(":where(:global(.x)) is as foreign as :global(.x), and so is a list of them", ({ read }) => {
		const model = read(`
			@scope (.card) to ([data-component]) {
				:global(.x) { color: var(--s-c); }
				:where(:global(.x)) { color: var(--s-c); }
				:is(:global(.x), :deep(.y)) { color: var(--s-c); }
				.local { color: var(--s-c); }
			}
		`);
		expect(model.blocks.map((block) => model.elements[block.element]?.kind)).toEqual([
			"foreign",
			"foreign",
			"foreign",
			"content",
		]);
		expect(unreached(model)).toEqual(["--s-c"]);
	});

	const mixed = [".local", ":global(.y)"];
	for (const list of [mixed.join(", "), [...mixed].reverse().join(", ")]) {
		inEverySyntax(
			`a list with a local selector in it (:is(${list})) stays the Card's, of unknown kind`,
			({ read }) => {
				const model = read(`
				@scope (.card) to ([data-component]) {
					:is(${list}) { color: var(--s-c); }
					:is(.local, .other) { color: var(--s-c); }
				}
			`);
				expect(model.blocks.map((block) => [keyOf(model, block.element), block.kind])).toEqual([
					[".card *", "unknown"],
					[".card :is(.local, .other)", "own"],
				]);
				expect(model.elements.map((element) => element.kind)).not.toContain("foreign");
				expect(unreached(model)).toEqual(["--s-c", "--s-c"]);
			},
		);
	}
});

describe("an escape that only tests something", () => {
	for (const test of [":has(:global(.flag))", ":not(:global(.flag))", ":has(> :deep(.flag))"]) {
		inEverySyntax(`.card${test} leaves the Card local`, ({ read }) => {
			const model = read(`.card${test} { color: var(--s-c); }`);
			expect(elements(model)).toEqual([["root", ".card"]]);
			expect(sources(model)).toEqual([[".card", "--s-c", undefined]]);
			expect(unreached(model)).toEqual(["--s-c"]);
		});
	}
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
		expect(unreached(model)).toEqual([]);
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

// Source: the global-elements decision, clarified 2026-11-15: a scope whose root names no component is context.
describe("a component inside a global @scope", () => {
	const facts = (model: Model) =>
		model.blocks.map((block) => [
			block.selector,
			keyOf(model, block.element),
			block.reach,
			block.scope,
			block.conditions.map((condition) => [condition.text, condition.on]),
		]);

	inEverySyntax("styles the component, with the scope's root as context, like the flat form", ({ read }) => {
		const flat = read(
			'main .card { --s-color: red; color: var(--s-color); } main .card [data-part="x"] { margin: 0; }',
		);
		const scoped = read(
			'@scope (main) { .card { --s-color: red; color: var(--s-color); } .card [data-part="x"] { margin: 0; } }',
		);
		for (const model of [flat, scoped]) {
			expect(elements(model)).toEqual([
				["root", ".card"],
				["part", '.card [data-part="x"]'],
			]);
			expect(model.components.map((component) => [component.name, component.hasRootBlock])).toEqual([
				["card", true],
			]);
			expect(model.blocks.map((block) => block.path.map((step) => step.text))).toEqual([
				[".card"],
				[".card", '[data-part="x"]'],
			]);
			expect(references(model)).toEqual([["x", "outside", false, [1]]]);
			expect(sources(model)).toEqual([[".card", "--s-color", ".card"]]);
			expect(unreached(model)).toEqual([]);
		}
		expect(facts(flat).map(([selector, , reach, scope]) => [selector, reach, scope])).toEqual([
			["main .card", "direct", undefined],
			['main .card [data-part="x"]', "descendant", undefined],
		]);
		expect(facts(scoped).map(([selector, , reach, scope]) => [selector, reach, scope])).toEqual([
			["main .card", "direct", 0],
			['main .card [data-part="x"]', "descendant", 0],
		]);
		expect(scoped.scopes[0]).toMatchObject({ component: undefined, root: "main" });
	});

	inEverySyntax("what a rule nested in it writes before & is context too", ({ read }) => {
		const model = read("@scope (main) { .card { --s-color: red; .dark & { color: var(--s-color); } } }");
		expect(elements(model)).toEqual([["root", ".card"]]);
		expect(facts(model)).toEqual([
			["main .card", ".card", "direct", 0, []],
			[".dark main .card", ".card", "direct", 0, [[".dark", "context"]]],
		]);
		expect(unreached(model)).toEqual([]);
	});

	inEverySyntax("a global element in it stays one", ({ read }) => {
		const model = read("@scope (main) { a { color: red; } .card a { color: blue; } }");
		expect(elements(model)).toEqual([
			["global", "main a"],
			["root", ".card"],
			["content", ".card a"],
		]);
		expect(facts(model).map(([selector, key, reach]) => [selector, key, reach])).toEqual([
			["main a", "main a", "scope"],
			["main .card a", ".card a", "descendant"],
		]);
	});

	inEverySyntax("a component's own scope is unchanged", ({ read }) => {
		const model = read(`
			.card { color: red; }
			@scope (.card) to ([data-component]) { [data-part="x"] { margin: 0; } .dark & { color: blue; } }
		`);
		expect(elements(model)).toEqual([
			["root", ".card"],
			["part", '.card [data-part="x"]'],
		]);
		expect(facts(model)).toEqual([
			[".card", ".card", "direct", undefined, []],
			['.card [data-part="x"]', '.card [data-part="x"]', "scope", 0, []],
			// `.dark &` puts the scope's root after `.dark`: it's still the Card, with `.dark` as context.
			[".dark .card", ".card", "scope", 0, [[".dark", "context"]]],
		]);
		expect(references(model)).toEqual([["x", "scope", false, [1]]]);
		expect(model.scopes[0]).toMatchObject({ component: 0, root: ".card", afterRootBlock: true });
	});
});

// The audit's probe (2.3): `at` is the whole attribute; `nameAt` is the name alone, for a name-only highlight or edit.
describe("where a part's name is written", () => {
	inEverySyntax("inside the attribute, quoted, unquoted or escaped", ({ read }) => {
		const model = read(String.raw`
			@scope (.card) to ([data-component]) {
				[data-part="title"] { color: red; }
				[data-part = 'ti\'tle' i] { color: red; }
				[data-part=ti\74 le] { color: red; }
				:where([data-part="icon"]):not([data-part="item"]) { color: red; }
				[data-part] { color: red; }
				.x:not([data-part^="ico"]) { color: red; }
			}
		`);
		expect(
			model.partReferences.map((reference) => {
				const selector = (reference.at.node as { selector: string }).selector;
				const name = reference.nameAt && selector.slice(reference.nameAt.index, reference.nameAt.endIndex);
				return [reference.name, selector.slice(reference.at.index, reference.at.endIndex), name];
			}),
		).toEqual([
			["title", '[data-part="title"]', "title"],
			["ti'tle", String.raw`[data-part = 'ti\'tle' i]`, String.raw`ti\'tle`],
			["title", String.raw`[data-part=ti\74 le]`, String.raw`ti\74 le`],
			["icon", '[data-part="icon"]', "icon"],
			["item", '[data-part="item"]', "item"],
			[undefined, "[data-part]", undefined],
			[undefined, '[data-part^="ico"]', undefined],
		]);
	});
});
