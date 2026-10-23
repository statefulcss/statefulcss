/**
 * What a `statefulcss.config` file can set. Every key is optional.
 *
 * The settings arrive with the schema; until then, the file can only point at its JSON Schema.
 */
export interface StatefulCSSConfig {
	/** The JSON Schema the file follows, for editors. */
	$schema?: string;
}

/** Every setting, with the defaults filled in. */
export type Settings = Required<Omit<StatefulCSSConfig, "$schema">>;

/** The default value of every setting. */
export const defaults: Readonly<Settings> = {};

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
	return { ...defaults };
}
