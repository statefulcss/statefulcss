/**
 * The JSON Schema for `statefulcss.config.json`, written to `schema.json` at build time.
 *
 * Written by hand until the schema exists; then it's generated from it.
 */
export const jsonSchema = {
	$schema: "https://json-schema.org/draft/2020-12/schema",
	title: "Stateful CSS config",
	type: "object",
	properties: {
		$schema: { type: "string" },
	},
	additionalProperties: false,
};
