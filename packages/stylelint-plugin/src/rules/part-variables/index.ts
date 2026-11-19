// `part-variables` (rule 10): a part variable is written only by the owner of the element it names, and read only by
// that element: a part, its pseudo-elements and the content under it, a slot at the end of the root block's
// placement path, or an owner's pseudo-element.
import type { Block, Declaration, Id, Model } from "@statefulcss/core";

import { listOf, nameOf } from "../names.js";
import { ownershipOf } from "../ownership.js";
import { defineRule, type Finding } from "../rule.js";

const messages = {
	ownWrite: (name: string, writer: string, owner: string) =>
		`Unexpected "${name}" written on ${writer}, its own part variable. Only ${owner} writes it, so give ${writer} a plain value or its own state variable.`,
	otherWrite: (name: string, writer: string, target: string, owner: string) =>
		`Unexpected "${name}" written on ${writer}, but it's the part variable for ${target}. Only ${owner} writes it, in its own block, variants, states and queries.`,
	partWrite: (name: string, writer: string) =>
		`Unexpected "${name}" written on ${writer}, which writes only the part variables for its own pseudo-elements, such as "--p-after-*". Give ${writer} a plain value or its own state variable.`,
	ownerlessWrite: (name: string, writer: string) =>
		`Unexpected "${name}" written on ${writer}, which declares no part variables. Only a component's root, and a part for its own pseudo-elements, write them, so give ${writer} a plain value or its own state variable.`,
	otherRead: (name: string, reader: string, target: string, instead: string) =>
		`Unexpected "${name}" read on ${reader}, but it's the part variable for ${target}. Read ${instead}, instead.`,
	unnamedRead: (name: string, reader: string, instead: string) =>
		`Unexpected "${name}" read on ${reader}, which reads only the part variables named for it. Read ${instead}, instead.`,
	contentRead: (name: string, reader: string) =>
		`Unexpected "${name}" read on ${reader}, which is under no part. Only a part, its pseudo-elements, the content under a part and a slot at the end of the root block's placement path read part variables.`,
	slotRead: (name: string, reader: string, placement: string) =>
		`Unexpected "${name}" read on ${reader} outside the root block's placement path. The scope's limit leaves the slotted component out, so read it in the root block, at "${placement}" or through parts with ">".`,
	slotPseudoRead: (name: string, reader: string) =>
		`Unexpected "${name}" read on ${reader}, which belongs to the slotted component. A slot reads its part variables only at the end of the root block's placement path, and the slotted component styles its own pseudo-elements.`,
	rootRead: (name: string, root: string) =>
		`Unexpected "${name}" read on ${root}, which declares part variables for its parts. Bind the root's own value with a state variable instead.`,
};

type Key = keyof typeof messages;

/**
 * The pseudo-elements a part may write part variables for, whether or not this file styles them: `--p-before-content`
 * for its own `::before`. A functional pseudo-element (`::highlight(search)`) has no part-variable spelling.
 */
const pseudoElements = [
	"after",
	"backdrop",
	"before",
	"checkmark",
	"column",
	"cue",
	"details-content",
	"file-selector-button",
	"first-letter",
	"first-line",
	"grammar-error",
	"marker",
	"picker-icon",
	"placeholder",
	"scroll-marker",
	"scroll-marker-group",
	"search-text",
	"selection",
	"spelling-error",
	"target-text",
];

/** What one branch of a written declaration says, kept whole until the sentence is built. */
type Said =
	| {
			readonly kind: "write";
			readonly writer: Id;
			readonly target: readonly Id[];
			readonly owner: Id;
			readonly own: boolean;
	  }
	| { readonly kind: "partWrite" | "ownerlessWrite"; readonly writer: Id }
	| {
			readonly kind: "otherRead";
			readonly reader: Id;
			readonly target: readonly Id[];
			readonly instead: Instead;
	  }
	| { readonly kind: "unnamedRead"; readonly reader: Id; readonly instead: Instead }
	| { readonly kind: "contentRead" | "slotPseudoRead" | "rootRead"; readonly reader: Id }
	| { readonly kind: "slotRead"; readonly reader: Id; readonly placement: string };

/** What a reader may read instead: its own prefix, and who declares it. */
interface Instead {
	readonly prefix: string;
	readonly owner: Id;
}

interface Branch {
	readonly said: Said;
	readonly at: Finding<Key>["at"];
}

export default defineRule<Record<never, never>, Key>({
	name: "part-variables",
	severity: "error",
	fixable: false,
	messages,
	check(model, { settings }) {
		const ownership = ownershipOf(model);
		const name = (id: Id): string => nameOf(model, settings, id);
		const names = (ids: readonly Id[]): string => listOf(ids.map(name));
		/** Inside a component: a global element, a utility and what `:deep()` or `:global()` selects have no parts. */
		const inComponent = (id: Id): boolean => ownership.component(model.elements[id]) !== undefined;
		/** The nearest owner above an element that names something by this name, and what it names. */
		const namedAbove = (id: Id, variable: string): { owner: Id; targets: readonly Id[] } | undefined => {
			for (const owner of ownership.owners(id)) {
				const targets = ownership.named(owner, variable);
				if (targets.length > 0) return { owner, targets };
			}
			return undefined;
		};

		// One finding for each written declaration, name and repair. A selector list writes a declaration once, and
		// what its branches say is gathered first, each with its own reader, target and owner, so the sentence pairs
		// them. An illegal write of a named variable is one repair, whichever branch the variable is for.
		const groups = new Map<string, Branch[]>();
		const report = (declaration: Declaration, variable: string, said: Said, at: Finding<Key>["at"]): void => {
			const repair = said.kind === "write" ? "write" : said.kind;
			const key = `${declaration.written}\n${variable}\n${repair}`;
			const group = groups.get(key);
			if (group) group.push({ said, at });
			else groups.set(key, [{ said, at }]);
		};

		// Writes: only an owner, by its own name for the element. A root's name that matches nothing is left to
		// `no-undeclared-state-variables`' rename warning, and an `inherit` to its "taken with inherit" error. A part
		// writes for its own pseudo-elements, styled here or elsewhere; content, a slot and a pseudo-element own none.
		for (const variable of model.variables) {
			if (variable.role !== "part" || !inComponent(variable.element)) continue;
			const writer = model.elements[variable.element];
			if (!writer || writer.kind === "root") continue;
			if (ownership.named(writer.id, variable.name).length > 0) continue;
			const above = namedAbove(writer.id, variable.name);
			if (!above && writer.kind === "part" && namesPseudoElement(variable.name)) continue;
			const said: Said = above
				? {
						kind: "write",
						writer: writer.id,
						target: above.targets,
						owner: above.owner,
						own: above.targets.includes(writer.id),
					}
				: { kind: writer.kind === "part" ? "partWrite" : "ownerlessWrite", writer: writer.id };
			for (const id of variable.writes) {
				const write = model.declarations[id];
				if (!write || write.inherits) continue;
				report(write, variable.name, said, { node: write.node, part: "property" });
			}
		}

		/**
		 * What a reader may read instead, and who declares it: a pseudo-element of a part or a root reads
		 * `--p-{pseudo}-*` from its host; a part, a slot and content under a part read the part's from the root.
		 * Content under no part reads none.
		 */
		const insteadOf = (id: Id): Instead | undefined => {
			const element = model.elements[id];
			if (element?.kind === "pseudo-element") {
				const host = model.elements[element.host];
				if (host?.kind === "part" || host?.kind === "root")
					return { prefix: `"--p-${element.name}-*"`, owner: host.id };
			}
			const root = ownership.component(element)?.root;
			for (const one of ownership.chain(id)) {
				const named = model.elements[one];
				if (root !== undefined && (named?.kind === "part" || named?.kind === "slot"))
					return { prefix: `"--p-${named.name}-*"`, owner: root };
			}
			return undefined;
		};

		// Reads: only the element an owner names it for, or one that stands in it (its pseudo-elements, content under a
		// part). A slot reads only at the end of the root block's placement path; where that path goes through a part,
		// `parts-in-scope` reports a wrong path. The message names what it's for when the component has it.
		for (const read of model.reads) {
			if (read.role !== "part" || read.via !== "var" || read.declaration === undefined) continue;
			const declaration = model.declarations[read.declaration];
			const reader = model.elements[read.element];
			const block = model.blocks[read.block];
			if (!declaration || !reader || !block || !inComponent(reader.id)) continue;
			const at = { node: declaration.node, part: "value" } as const;
			const host = reader.kind === "pseudo-element" ? model.elements[reader.host] : undefined;
			if (host?.kind === "slot") {
				// At the end of a path through parts, `parts-in-scope` reports the pseudo-element.
				if (!throughParts(model, block))
					report(declaration, read.name, { kind: "slotPseudoRead", reader: reader.id }, at);
				continue;
			}
			if (reader.kind === "slot" && !atPlacement(block)) {
				if (throughParts(model, block)) continue;
				const placement = `& > [${settings.slotAttribute}="${reader.name}"]`;
				report(declaration, read.name, { kind: "slotRead", reader: reader.id, placement }, at);
				continue;
			}
			if (ownership.namedOwner(reader.id, read.name) !== undefined) continue;
			if (reader.kind === "root") {
				report(declaration, read.name, { kind: "rootRead", reader: reader.id }, at);
				continue;
			}
			const instead = insteadOf(reader.id);
			if (!instead) {
				report(declaration, read.name, { kind: "contentRead", reader: reader.id }, at);
				continue;
			}
			const above = namedAbove(reader.id, read.name);
			report(
				declaration,
				read.name,
				above
					? { kind: "otherRead", reader: reader.id, target: above.targets, instead }
					: { kind: "unnamedRead", reader: reader.id, instead },
				at,
			);
		}

		return [...groups.entries()].flatMap(([key, group]) => {
			const [first] = group;
			if (!first) return [];
			const variable = key.split("\n")[1] ?? "";
			return [
				{
					...sentenceOf(
						variable,
						first.said,
						group.map((one) => one.said),
					),
					at: first.at,
				},
			];
		});

		/** The finding a group's branches make, each element, target and owner named once. */
		function sentenceOf(
			variable: string,
			first: Said,
			said: readonly Said[],
		): Pick<Finding<Key>, "message" | "args"> {
			const all = <Kind extends Said["kind"]>(kind: Kind): Extract<Said, { kind: Kind }>[] =>
				said.filter((one): one is Extract<Said, { kind: Kind }> => one.kind === kind);
			switch (first.kind) {
				case "write": {
					const writes = all("write");
					const writers = names(writes.map((one) => one.writer));
					const owners = names(writes.map((one) => one.owner));
					if (writes.every((one) => one.own))
						return { message: "ownWrite", args: [variable, writers, owners] };
					const targets = names(writes.flatMap((one) => one.target));
					return { message: "otherWrite", args: [variable, writers, targets, owners] };
				}
				case "partWrite":
				case "ownerlessWrite":
					return {
						message: first.kind,
						args: [variable, names(all(first.kind).map((one) => one.writer))],
					};
				case "otherRead": {
					const reads = all("otherRead");
					return {
						message: "otherRead",
						args: [
							variable,
							names(reads.map((one) => one.reader)),
							names(reads.flatMap((one) => one.target)),
							insteadText(reads.map((one) => one.instead)),
						],
					};
				}
				case "unnamedRead": {
					const reads = all("unnamedRead");
					return {
						message: "unnamedRead",
						args: [
							variable,
							names(reads.map((one) => one.reader)),
							insteadText(reads.map((one) => one.instead)),
						],
					};
				}
				case "slotRead": {
					const reads = all("slotRead");
					return {
						message: "slotRead",
						args: [
							variable,
							names(reads.map((one) => one.reader)),
							listOf(reads.map((one) => one.placement)),
						],
					};
				}
				case "contentRead":
				case "slotPseudoRead":
				case "rootRead":
					return { message: first.kind, args: [variable, names(all(first.kind).map((one) => one.reader))] };
			}
		}

		/**
		 * Each prefix with the owner that declares it: one owner or one prefix is said once (`"--p-badge-*" and
		 * "--p-meta-*", declared on ".card"`); otherwise each pair is said whole.
		 */
		function insteadText(pairs: readonly Instead[]): string {
			const prefixes = [...new Set(pairs.map((pair) => pair.prefix))];
			const owners = [...new Set(pairs.map((pair) => pair.owner))];
			if (prefixes.length === 1 || owners.length === 1)
				return `${listOf(prefixes)}, declared on ${names(owners)}`;
			const each = [...new Set(pairs.map((pair) => `${pair.prefix}, declared on ${name(pair.owner)}`))];
			return `${each.slice(0, -1).join(", ")}, and ${each.at(-1) ?? ""}`;
		}
	},
});

/** Whether a part variable's name starts with a pseudo-element's: `--p-before-content`. */
function namesPseudoElement(variable: string): boolean {
	const rest = variable.slice("--p-".length);
	return pseudoElements.some((pseudo) => rest === pseudo || rest.startsWith(`${pseudo}-`));
}

/**
 * Whether a block is the end of the root block's placement path: written from the root, outside any scope, through
 * parts each with `>`, and onto the slot with `>`.
 */
function atPlacement(block: Block): boolean {
	const last = block.path.length - 1;
	return (
		block.reach === "descendant" &&
		last >= 1 &&
		block.path[0]?.names === "root" &&
		block.path.every(
			(step, index) =>
				index === 0 || (step.combinator === ">" && step.names === (index === last ? "slot" : "part")),
		)
	);
}

/** A placement path through a part, which `parts-in-scope` checks and reports where it goes wrong. */
function throughParts(model: Model, block: Block): boolean {
	return model.partReferences.some(
		(reference) => reference.place === "placement-path" && reference.blocks.includes(block.id),
	);
}
