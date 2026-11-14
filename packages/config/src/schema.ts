import * as z from "zod";

const attributeSettings = ["themeAttribute", "componentAttribute", "partAttribute", "slotAttribute"] as const;

function attributeName(defaultName: string, description: string) {
	return z
		.string()
		.regex(/^[a-z][a-z0-9-]*$/)
		.default(defaultName)
		.meta({
			description,
			expected: "an attribute name",
			examples: [defaultName],
		});
}

/**
 * Every setting a `statefulcss.config` file can have: its key, type, default and a one-line description.
 *
 * The single source for the runtime check, the types, `defaults` and `schema.json`. Each setting's `expected` and
 * `examples` say what a valid value is, for the error a wrong value gets; editors get the examples too.
 */
export const configSchema = z
	.strictObject({
		$schema: z.string().optional().meta({
			description: "The JSON Schema this file follows, so editors can check and complete it.",
		}),
		themeAttribute: attributeName(
			"data-theme",
			'The attribute that selects a theme, such as data-theme in [data-theme="espresso"].',
		),
		componentAttribute: attributeName(
			"data-component",
			`The attribute every component's root carries, such as data-component in [data-component="button"]. A component's @scope stops at it.`,
		),
		partAttribute: attributeName(
			"data-part",
			`The attribute that marks a component's parts, such as data-part in [data-part="icon"].`,
		),
		slotAttribute: attributeName(
			"data-slot",
			'The attribute that marks where another component is placed, such as data-slot in [data-slot="action"].',
		),
		themeFiles: z
			.array(z.string().min(1))
			.default(() => ["**/styles/themes/**"])
			.meta({
				description:
					"Globs for the files that declare themes. Theme scopes and tokens are written only there.",
				expected: "a list of globs",
				examples: [["src/styles/themes/**"]],
			}),
		baseTheme: z
			.string()
			.min(1)
			.default("base")
			.meta({
				description: "The folder name of the base theme, whose files declare the unnamed [data-theme] scope.",
				expected: "a folder name",
				examples: ["default"],
			}),
		blockingStates: z
			.array(z.string().min(1))
			.default(() => [":disabled", '[aria-disabled="true"]', "[data-loading]", "[inert]"])
			.meta({
				description:
					"Selectors for states that block interaction. They come last and set only their own look; a guard keeps interaction states off blocked elements.",
				expected: "a list of selectors",
				examples: [[":disabled", '[aria-disabled="true"]']],
			}),
		interactionStates: z
			.array(z.string().min(1))
			.default(() => [":hover", ":focus", ":focus-visible", ":focus-within", ":active"])
			.meta({
				description:
					"Selectors for states the user causes by pointing or focusing. They come before the other states.",
				expected: "a list of selectors",
				examples: [[":hover", ":focus-visible", ":active"]],
			}),
		stateAttributes: z
			.array(z.string().min(1))
			.default(() => [])
			.meta({
				description: "Attributes that have a value but are states, such as Radix's data-state.",
				expected: "a list of attribute names",
				examples: [["data-state"]],
			}),
		layers: z
			.array(z.string().min(1))
			.default(() => ["base", "themes", "components", "utilities"])
			.meta({
				description: "The cascade layers, in the order of the project's @layer statement.",
				expected: "a list of layer names",
				examples: [["reset", "base", "themes", "components", "utilities"]],
			}),
		strict: z
			.boolean()
			.default(false)
			.meta({
				description:
					"bind-once's strict mode: anything that varies a property changes a variable, even a single hover.",
				expected: "true or false",
				examples: [true],
			}),
		ignoreLayers: z
			.array(z.string().min(1))
			.default(() => [])
			.meta({
				description: "Layers that strict mode leaves alone, such as a third-party reset in base.",
				expected: "a list of layer names",
				examples: [["base"]],
			}),
	})
	.superRefine((settings, context) => {
		const seen = new Map<string, (typeof attributeSettings)[number]>();
		for (const key of attributeSettings) {
			const name = settings[key];
			const previous = seen.get(name);
			if (previous) {
				context.addIssue({
					code: "custom",
					path: [key],
					message: `must differ from "${previous}". Both use "${name}". Give each setting its own attribute name.`,
				});
			} else {
				seen.set(name, key);
			}
		}
	})
	.meta({
		title: "Stateful CSS config",
		description: "The settings the Stateful CSS tools share. Every key is optional.",
	});

type Output = Omit<z.output<typeof configSchema>, "$schema">;

/** What a `statefulcss.config` file can set. Every key is optional. */
export type StatefulCSSConfig = z.input<typeof configSchema>;

/** Every setting, with the defaults filled in. */
export type Settings = {
	readonly [Key in keyof Output]: Output[Key] extends (infer Item)[] ? readonly Item[] : Output[Key];
};

/** Turns a checked config into settings: drops `$schema` and freezes the rest, so files that share settings can't change them. */
export function toSettings(config: z.output<typeof configSchema>): Settings {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- $schema is for editors, not a setting
	const { $schema, ...settings } = config;
	for (const value of Object.values(settings)) {
		if (Array.isArray(value)) Object.freeze(value);
	}
	return Object.freeze(settings);
}

/** The default value of every setting. */
export const defaults: Settings = toSettings(configSchema.parse({}));
