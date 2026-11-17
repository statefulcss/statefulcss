// `part-variables` (rule 10): a part variable is written only by the owner of the element it names, and read only by
// that element: a part, its pseudo-elements and the content under it, a slot, or an owner's pseudo-element.
import type { Declaration, Id } from "@statefulcss/core";

import { listOf, nameOf } from "../names.js";
import { ownershipOf } from "../ownership.js";
import { defineRule, type Finding } from "../rule.js";

const messages = {
	ownWrite: (name: string, writer: string, owner: string) =>
		`Unexpected "${name}" written on ${writer}, its own part variable. Only ${owner} writes it, so give ${writer} a plain value or its own state variable.`,
	otherWrite: (name: string, writer: string, target: string, owner: string) =>
		`Unexpected "${name}" written on ${writer}, but it's the part variable for ${target}. Only ${owner} writes it, in its own block, variants, states and queries.`,
	otherRead: (name: string, reader: string, target: string, prefix: string, owner: string) =>
		`Unexpected "${name}" read on ${reader}, but it's the part variable for ${target}. Read ${prefix}, declared on ${owner}, instead.`,
	unnamedRead: (name: string, reader: string, prefix: string, owner: string) =>
		`Unexpected "${name}" read on ${reader}, which reads only the part variables named for it. Read ${prefix}, declared on ${owner}, instead.`,
	contentRead: (name: string, reader: string) =>
		`Unexpected "${name}" read on ${reader}, which is under no part. Only a part, its pseudo-elements and the content under a part read part variables.`,
	rootRead: (name: string, root: string) =>
		`Unexpected "${name}" read on ${root}, which declares part variables for its parts. Bind the root's own value with a state variable instead.`,
};

type Key = keyof typeof messages;

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

		// One finding for each written declaration, name and reason. A selector list writes a declaration once, and
		// what its branches say is gathered first: a reason they share names every element it holds for.
		const groups = new Map<string, Finding<Key>[]>();
		const report = (declaration: Declaration, variable: string, finding: Finding<Key>): void => {
			const key = `${declaration.written}\n${variable}\n${finding.message}`;
			groups.set(key, [...(groups.get(key) ?? []), finding]);
		};

		// Writes: only an owner, by its own name for the element. A root's name that matches nothing is left to
		// `no-undeclared-state-variables`' rename warning, and an `inherit` to its "taken with inherit" error.
		for (const variable of model.variables) {
			if (variable.role !== "part" || !inComponent(variable.element)) continue;
			if (ownership.named(variable.element, variable.name).length > 0) continue;
			if (model.elements[variable.element]?.kind === "root") continue;
			const above = namedAbove(variable.element, variable.name);
			if (!above) continue;
			const own = above.targets.includes(variable.element);
			for (const id of variable.writes) {
				const write = model.declarations[id];
				if (!write || write.inherits) continue;
				const at = { node: write.node, part: "property" } as const;
				report(
					write,
					variable.name,
					own
						? { message: "ownWrite", args: [variable.name, name(variable.element), name(above.owner)], at }
						: {
								message: "otherWrite",
								args: [variable.name, name(variable.element), names(above.targets), name(above.owner)],
								at,
							},
				);
			}
		}

		/**
		 * What a reader may read instead, and who declares it: a pseudo-element of a part, a slot or a root reads
		 * `--p-{pseudo}-*` from its host; a part, a slot and content under a part read the part's from the root.
		 * Content under no part reads none.
		 */
		const ownOf = (id: Id): { prefix: string; owner: Id } | undefined => {
			const element = model.elements[id];
			if (element?.kind === "pseudo-element") {
				const host = model.elements[element.host];
				if (host?.kind === "part" || host?.kind === "slot" || host?.kind === "root")
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
		// part). The message names what it's for when the component has it.
		for (const read of model.reads) {
			if (read.role !== "part" || read.via !== "var" || read.declaration === undefined) continue;
			const declaration = model.declarations[read.declaration];
			const reader = model.elements[read.element];
			if (!declaration || !reader || !inComponent(reader.id)) continue;
			if (ownership.namedOwner(reader.id, read.name) !== undefined) continue;
			const at = { node: declaration.node, part: "value" } as const;
			if (reader.kind === "root") {
				report(declaration, read.name, { message: "rootRead", args: [read.name, name(reader.id)], at });
				continue;
			}
			const above = namedAbove(reader.id, read.name);
			const own = ownOf(reader.id);
			if (!own) {
				report(declaration, read.name, { message: "contentRead", args: [read.name, name(reader.id)], at });
				continue;
			}
			report(
				declaration,
				read.name,
				above
					? {
							message: "otherRead",
							args: [read.name, name(reader.id), names(above.targets), own.prefix, name(own.owner)],
							at,
						}
					: { message: "unnamedRead", args: [read.name, name(reader.id), own.prefix, name(own.owner)], at },
			);
		}

		return [...groups.values()].flatMap((group) => {
			const [first] = group;
			if (!first) return [];
			const args = first.args.map((_, index) => listOf(group.map((finding) => finding.args[index] ?? "")));
			return [{ ...first, args }];
		});
	},
});
