import type { Settings } from "@statefulcss/config";
import type { Document, Root } from "postcss";

import { buildModel } from "./analyze/analyze.js";
import type { Model } from "./model.js";

export type * from "./model.js";

/**
 * Reads one stylesheet and describes it: its components, elements and blocks. A `.vue` file arrives as a Document,
 * with one root per `<style>`.
 *
 * Never throws on syntax it doesn't understand: SCSS interpolation, template placeholders and unknown at-rules are
 * recorded in `unknowns`, and what's inside them isn't attributed to any element.
 */
export function analyze(root: Root | Document, settings: Settings): Model {
	return buildModel(root, settings);
}
