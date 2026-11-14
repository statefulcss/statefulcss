import type { Settings } from "@statefulcss/config";

/** The attribute and layer names core reads a stylesheet with. */
export interface Names {
	/** On every component root: `data-component`. */
	readonly componentAttribute: string;
	/** On a part: `data-part`. */
	readonly partAttribute: string;
	/** On a component placed in another: `data-slot`. */
	readonly slotAttribute: string;
	/** On a theme scope: `data-theme`. */
	readonly themeAttribute: string;
	/** The light and dark switch: `data-color-scheme`. */
	readonly colorSchemeAttribute: string;
	/** The layer whose class blocks are utilities, not components. */
	readonly utilitiesLayer: string;
}

/** The names the settings don't hold yet. They live here and nowhere else. */
const defaultNames = {
	componentAttribute: "data-component",
	partAttribute: "data-part",
	slotAttribute: "data-slot",
	colorSchemeAttribute: "data-color-scheme",
	utilitiesLayer: "utilities",
} as const;

/**
 * The names for one project. Every pass takes its names from here, never from the settings, so when the settings
 * gain the component, part and slot attributes, in whatever shape, only this function changes.
 */
export function namesFrom(settings: Settings): Names {
	return { ...defaultNames, themeAttribute: settings.themeAttribute.toLowerCase() };
}
