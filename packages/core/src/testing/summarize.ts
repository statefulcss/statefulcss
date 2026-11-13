import type { Block, Element, Model } from "../model.js";

/**
 * A short, readable summary of a model, for snapshots: a change in how core reads CSS shows up as a small diff. Paths
 * and syntax don't appear in it, so one summary holds for every syntax.
 */
export function summarize(model: Model): string {
	const lines: string[] = [];
	for (const element of model.elements) lines.push(...describeElement(element));
	for (const unknown of model.unknowns) lines.push(`unknown ${unknown.reason}: ${unknown.detail ?? ""}`);
	return lines.join("\n");
}

function describeElement(element: Element): string[] {
	const notes = [
		element.host ? `on ${element.host.key}` : undefined,
		element.parents.length > 0 ? `in ${element.parents.map((parent) => parent.key).join(", ")}` : undefined,
		element.themeScope ? `theme ${element.themeScope.theme ?? "(unnamed)"}` : undefined,
		element.colorScheme ? "color scheme" : undefined,
	].filter(Boolean);
	const heading = `${element.kind} ${element.key}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`;
	return [heading, ...element.blocks.map((block) => `  ${describeBlock(block)}`)];
}

function describeBlock(block: Block): string {
	const atRules = block.atRules.map((atRule) => `@${atRule.name} ${atRule.params}`.trim());
	const layer = block.layer === undefined ? [] : [`layer ${block.layer}`];
	const context = [...atRules, ...layer];
	return `#${block.index} ${block.selector}${context.length > 0 ? `  [${context.join("; ")}]` : ""}`;
}
