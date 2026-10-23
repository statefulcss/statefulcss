import { defaults, type Settings, type StatefulCSSConfig } from "./schema.js";

export { defaults, type Settings, type StatefulCSSConfig } from "./schema.js";

/** Types a `.js` or `.ts` config. */
export function defineConfig(config: StatefulCSSConfig): StatefulCSSConfig {
	return config;
}

/**
 * The settings for a file: from the nearest `statefulcss.config`, checked, with the defaults filled in.
 *
 * Not built yet: always returns the defaults.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the search starts here once the loader is built
export async function loadConfig(fromPath: string): Promise<Settings> {
	return defaults;
}
