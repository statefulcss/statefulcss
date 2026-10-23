import type { StatefulCSSConfig } from "./schema.js";

export { ConfigError, type ConfigErrorDetails, type ConfigErrorKind } from "./config-error.js";
export { loadConfig } from "./load-config.js";
export { defaults, type Settings, type StatefulCSSConfig } from "./schema.js";

/** Types a `.js` or `.ts` config. */
export function defineConfig(config: StatefulCSSConfig): StatefulCSSConfig {
	return config;
}
