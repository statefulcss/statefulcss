import type { Block, Element, Model, Variable } from "../model.js";

/**
 * A short, readable summary of a model, for snapshots: a change in how core reads CSS shows up as a small diff. Paths
 * and syntax don't appear in it, so one summary holds for every syntax.
 */
export function summarize(model: Model): string {
	const keyOf = (id: number): string => model.elements[id]?.key ?? "?";
	const lines: string[] = [];

	for (const component of model.components) {
		const identity =
			component.identity.kind === "class"
				? `.${component.identity.className}`
				: `attribute "${component.identity.value}"`;
		lines.push(
			`component ${component.name} (${identity}; name from its ${component.nameFrom}${component.hasRootBlock ? "" : "; no root block in this file"})`,
		);
		for (const id of component.scopes) {
			const scope = model.scopes[id];
			if (!scope) continue;
			const notes = [
				scope.nested ? "nested in a rule" : undefined,
				scope.afterRootBlock === false ? "before the root block" : undefined,
				scope.limitIsComponents ? undefined : "not limited by components",
			].filter(Boolean);
			lines.push(
				`  scope (${scope.root ?? ""}) to (${scope.limit ?? ""})${notes.length > 0 ? `: ${notes.join(", ")}` : ""}`,
			);
		}
		const comment = component.docComment === undefined ? undefined : model.docComments[component.docComment];
		if (comment) {
			const lists = (["sets", "reads", "queries"] as const)
				.filter((tag) => comment[tag].length > 0)
				.map((tag) => `, ${tag} ${comment[tag].join(" ")}`);
			lines.push(`  doc comment "${comment.title ?? ""}"${lists.join("")}`);
		}
	}

	for (const element of model.elements) {
		lines.push("", describeElement(element));
		for (const id of element.blocks) {
			const block = model.blocks[id];
			if (block) lines.push(`  ${describeBlock(block)}`);
		}
		for (const id of element.variables) {
			const variable = model.variables[id];
			if (variable) lines.push(`  ${describeVariable(variable, model, keyOf)}`);
		}
	}

	if (model.guards.length > 0) lines.push("");
	for (const guard of model.guards) {
		const joined = guard.condition.inner.filter((inner) => inner.has).length;
		const has = joined > 0 ? ` and ${joined} state through :has()` : "";
		lines.push(
			`guard on ${keyOf(guard.element)}: ${guard.blocking.join(", ")}${has}; around ${guard.blocks.map((id) => `#${id}`).join(" ")}`,
		);
	}

	if (model.partReferences.length > 0) lines.push("");
	for (const reference of model.partReferences)
		lines.push(`part ${reference.name ?? "(unnamed)"} named in #${reference.block}: ${reference.place}`);

	if (model.unknowns.length > 0) lines.push("");
	for (const unknown of model.unknowns) lines.push(`unknown ${unknown.reason}: ${unknown.detail ?? ""}`);
	return lines.join("\n");
}

function describeElement(element: Element): string {
	if (element.kind !== "global") return `${element.kind} ${element.key}`;
	const notes = [
		element.themeScope ? `theme ${element.themeScope.theme ?? "(unnamed)"}` : undefined,
		element.colorScheme ? "color scheme" : undefined,
	].filter(Boolean);
	return `global ${element.key}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`;
}

function describeBlock(block: Block): string {
	const kind = block.kind === "state" ? ["state", ...block.groups].join(" ") : block.kind;
	const notes = [
		block.guard === undefined ? undefined : "guarded",
		block.reach === "descendant" ? "reached from the root block" : undefined,
	].filter(Boolean);
	const queries = block.queries.map((query) => `@${query.name} ${query.params}`.trim());
	return `#${block.id} ${[kind, ...notes].join(", ")}: ${block.selector}${queries.length > 0 ? `  [${queries.join("; ")}]` : ""}`;
}

function describeVariable(variable: Variable, model: Model, keyOf: (id: number) => string): string {
	const readers = [...new Set(variable.reads.flatMap((id) => model.reads[id]?.element ?? []))];
	const notes = [
		variable.role,
		variable.default === undefined ? "no default" : undefined,
		variable.changing ? "changing" : undefined,
		variable.namedFor.length > 0 ? `for ${variable.namedFor.map(keyOf).join(" and ")}` : undefined,
		readers.length > 0 ? `read by ${readers.map(keyOf).join(" and ")}` : undefined,
	].filter(Boolean);
	return `${variable.name}: ${notes.join(", ")}`;
}
