// How a message names an element: by the words the docs use, not by the selector core resolved.
import type { Settings } from "@statefulcss/config";
import type { Id, Model } from "@statefulcss/core";

import { ownershipOf } from "./ownership.js";

/**
 * An element as a message names it: a part or a slot by its name (`part "icon"`), a part's pseudo-element on it
 * (`"::after" of part "tab"`), a root by its class or attribute, and anything else as its selector is written
 * (`".link::after"`).
 */
export function nameOf(model: Model, settings: Settings, id: Id): string {
	const element = model.elements[id];
	if (!element) return "the element";
	if (element.kind === "part" || element.kind === "slot") return `${element.kind} "${element.name}"`;
	if (element.kind === "pseudo-element") {
		const host = model.elements[element.host];
		if (host?.kind === "part" || host?.kind === "slot")
			return `"::${element.name}" of ${nameOf(model, settings, host.id)}`;
	}
	if (element.kind === "root") {
		const identity = ownershipOf(model).component(element)?.identity;
		if (identity?.kind === "class") return `".${identity.className}"`;
		if (identity) return `"[${settings.componentAttribute}="${identity.value}"]"`;
	}
	return `"${element.key}"`;
}

/** Each distinct text once, joined: `a`, `a and b`, `a, b and c`. */
export function listOf(texts: readonly string[]): string {
	const distinct = [...new Set(texts)];
	return distinct.length < 2
		? distinct.join("")
		: `${distinct.slice(0, -1).join(", ")} and ${distinct.at(-1) ?? ""}`;
}
