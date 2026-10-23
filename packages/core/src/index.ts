import type { Settings } from "@statefulcss/config";
import type { Root } from "postcss";

import type { Model } from "./model.js";

export type * from "./model.js";

/**
 * Reads one stylesheet and describes it: its components, elements, blocks and variables.
 *
 * Not built yet: the model is always empty.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the analysis reads the settings once it's built
export function analyze(root: Root, settings: Settings): Model {
	return { root, components: [], variables: [] };
}
