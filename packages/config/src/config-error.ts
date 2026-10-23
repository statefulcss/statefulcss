/**
 * What went wrong with a config:
 *
 * - `unreadable`: the file isn't valid JSON, or a JavaScript or TypeScript config threw or has no default export;
 * - `multiple-files`: one folder has more than one config, so it's unclear which applies;
 * - `unknown-key`: a key no setting has, usually a typo;
 * - `invalid-value`: a known setting with a value of the wrong kind.
 */
export type ConfigErrorKind = "unreadable" | "multiple-files" | "unknown-key" | "invalid-value";

export interface ConfigErrorDetails {
	/** The config file. For `multiple-files`, the first of them. */
	file: string;
	/** Every config in the folder, for `multiple-files`. */
	files?: readonly string[];
	/** The key path, such as `blockingStates[2]`, for `unknown-key` and `invalid-value`. */
	key?: string;
	/** The error a JavaScript or TypeScript config threw. */
	cause?: unknown;
}

/** A config that can't be used. Its message names the file, the key and the fix. */
export class ConfigError extends Error {
	override readonly name = "ConfigError";
	readonly kind: ConfigErrorKind;
	readonly file: string;
	readonly files: readonly string[];
	readonly key: string | undefined;

	constructor(kind: ConfigErrorKind, message: string, details: ConfigErrorDetails) {
		super(message, details.cause === undefined ? undefined : { cause: details.cause });
		this.kind = kind;
		this.file = details.file;
		this.files = details.files ?? [details.file];
		this.key = details.key;
	}
}
