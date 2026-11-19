# Stateful CSS Stylelint Plugin

The [Stylelint](https://stylelint.io/) rules for Stateful CSS, with the `recommended` and `compatible` configs.

**Before its first release.** The rules and the configs may still change.

## Install

```sh
npm install --save-dev stylelint @statefulcss/stylelint-plugin
```

It needs Stylelint 18 and Node.js `^22.22.2`, `^24.15.0` or `>=26.0.0`, the versions Stylelint 18 runs on.

## Use

A new project extends `recommended`: Stylelint's own [`stylelint-config-recommended`](https://github.com/stylelint/stylelint-config-recommended), the Stateful CSS rules, and Stylelint's rules that contradict the methodology switched off or adjusted.

```js
// stylelint.config.mjs
export default { extends: ["@statefulcss/stylelint-plugin/recommended"] };
```

The `.mjs` file is read as a module whatever the project's `package.json` says. A project with `"type": "module"` can name it `stylelint.config.js`. Then lint:

```sh
npx stylelint "**/*.css"
```

A project that already extends a config lists `compatible` last: the Stateful CSS rules, a few of Stylelint's rules the methodology needs, and the project's rules that contradict it switched off.

```js
export default { extends: ["stylelint-config-standard", "@statefulcss/stylelint-plugin/compatible"] };
```

Both configs load the plugin themselves. Each also:

- turns on `declaration-no-important`, `selector-no-unmatchable`, `selector-no-invalid` and `declaration-block-no-shorthand-property-overrides`, the last three through `stylelint-config-recommended` in `recommended`;
- sets `declaration-block-no-duplicate-properties` to a warning that suggests `@supports` for a fallback, with its fix off, so `--fix` never deletes the fallback;
- switches off `no-descending-specificity`, which reports state blocks written in the methodology's order, `no-duplicate-selectors`, which reports a block's second `&:where(:not(…))` guard (focus sits between two interaction states, and a combined state's guard follows its semantic state), and `declaration-block-no-duplicate-custom-properties`, whose repeat `statefulcss/bind-once` reports;
- switches `selector-no-unmatchable` and `selector-no-invalid` off for `*.scss`, `*.sass` and `*.less`, as Stylelint's docs advise. Overrides go by file name, so a `.vue` file's `<style lang="scss">` block keeps them on.

`compatible` also switches off `custom-property-pattern`, `selector-class-pattern`, `custom-property-empty-line-before`, `declaration-empty-line-before`, `no-unknown-custom-properties` and `block-no-redundant-nested-style-rules`, which reject private names such as `--_gap`, CSS Modules classes such as `.Button`, the way a component groups its defaults, or the `& { … }` block it may keep them in.

`recommended` also accepts what Sass, Vue and CSS Modules add to CSS, by file name:

- in `*.scss` and `*.sass`: Sass's at-rules (`@use`, `@mixin`, `@include`, `@if` and the others), `!default` and `!global`, and a mixin's `&` (`@mixin focused { &:focus-visible { … } }`), which stands for the rule that includes it; `declaration-property-value-no-unknown`, `value-no-invalid` and `media-query-no-invalid` are off, since they read a Sass variable, function or map as CSS;
- in `*.vue`: Sass's at-rules, annotations and a mixin's `&`, Vue's `:deep()`, `:global()` and `:slotted()`, and, for a `<style module>` block, CSS Modules' names as in a module file;
- in `*.astro` and `*.svelte`: `:global()`;
- in `*.module.css`, `*.module.scss` and `*.module.sass`: CSS Modules' `composes`, `:global`, `:local`, `@value`, and the names declared in `:export { … }` and `:import(…) { … }`.

`compatible` adds none of these: a project that extends its own config keeps the setup it has for its syntaxes.

## Sass, Vue, Astro, Svelte and CSS Modules

The rules read plain CSS, SCSS, and the `<style>` blocks of a `.vue`, `.astro` or `.svelte` file. Stylelint reads CSS only, until a parser is set for the other files. Install the parsers:

```sh
npm install --save-dev postcss-scss postcss-html
```

And set each one for its files:

```js
// stylelint.config.mjs
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	overrides: [
		{ files: ["**/*.scss"], customSyntax: "postcss-scss" },
		{ files: ["**/*.{vue,astro,svelte}"], customSyntax: "postcss-html" },
	],
};
```

```sh
npx stylelint "**/*.{css,scss,vue,astro,svelte}"
```

A framework's scoped `<style>` (Astro's `<style>`, Vue's `<style scoped>`, Svelte's `<style>`) scopes a rule to the elements written in its file. The methodology works there too. Write the `@scope` limit so it ships as `to ([data-component])`: `to (:global([data-component]))` in Astro, which adds the file's scope to the limit, and `to ([data-component])` everywhere else. Select what comes from another file through the framework's escape: `:global()` in Astro and Svelte, `:deep()` or `:slotted()` in Vue. `statefulcss/parts-in-scope` checks the limit. In Astro, `scopedStyleStrategy: "where"` keeps the file's scope from adding specificity to every rule.

CSS Modules need no parser: a `*.module.css` file is CSS. A value that `@value` or `:import()` names (`@value ink: red;` then `color: ink`) is read as CSS by `declaration-property-value-no-unknown`, which reports it in a `*.module.css` and a `.vue` file: the rule can't be told which names a file declares. A project that uses them switches it off for those files, and loses its check of their values:

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	overrides: [
		{ files: ["**/*.scss"], customSyntax: "postcss-scss" },
		{ files: ["**/*.vue"], customSyntax: "postcss-html" },
		{
			files: ["**/*.module.css", "**/*.vue"],
			rules: { "declaration-property-value-no-unknown": null },
		},
	],
};
```

It's already off in `*.module.scss` and `*.module.sass`, with Sass's values.

Two things stay as they are in a `.vue` file, since its overrides go by file name and can't tell a `<style lang="scss">` block from a CSS one:

- `selector-no-unmatchable`, `selector-no-invalid` and the three rules that read values as CSS stay on, so a Sass variable or function in a value is reported there;
- Vue's `v-bind()` in a value is reported by `declaration-property-value-no-unknown`.

A project that writes either in its `.vue` files switches those rules off for them:

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	overrides: [
		{ files: ["**/*.scss"], customSyntax: "postcss-scss" },
		{
			files: ["**/*.vue"],
			customSyntax: "postcss-html",
			rules: {
				"declaration-property-value-no-unknown": null,
				"value-no-invalid": null,
				"media-query-no-invalid": null,
			},
		},
	],
};
```

## Rules

Each rule's page has its checks, its cases and its options. The pages ship with the package, in `node_modules/@statefulcss/stylelint-plugin/src/rules/`, and `ruleMeta` links each rule to its page on GitHub.

| Rule                                                                                   | What must hold                                                                                                                                    | Severity | Fixable |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| [`variable-role-prefix`](./src/rules/variable-role-prefix/README.md)                   | Every custom property, and every `@property`, starts with a role prefix and a name.                                                               | error    | no      |
| [`theme-tokens`](./src/rules/theme-tokens/README.md)                                   | A token is declared only in a theme scope, a theme scope declares only tokens and `color-scheme`, and themes are written only in the theme files. | error    | no      |
| [`bind-once`](./src/rules/bind-once/README.md)                                         | Each property is declared once per element; if it changes, it's bound once to a state variable.                                                   | error    | no      |
| [`bind-through-state-variables`](./src/rules/bind-through-state-variables/README.md)   | A property never reads a private that a variant or a state changes, and a variable a variant writes is never written by a state.                  | error    | no      |
| [`blocking-states-win`](./src/rules/blocking-states-win/README.md)                     | Interaction states sit inside a guard that lists every blocking state, focus stays outside it, and blocking states set only their own look.       | warning  | yes     |
| [`visited-colors-only`](./src/rules/visited-colors-only/README.md)                     | A `:visited` block declares only its color properties, set directly.                                                                              | error    | no      |
| [`no-undeclared-state-variables`](./src/rules/no-undeclared-state-variables/README.md) | Every state variable and private an element reads or changes is declared on that element, or by its owner for it.                                 | error    | no      |
| [`parts-in-scope`](./src/rules/parts-in-scope/README.md)                               | A component's parts are styled only inside its `@scope (root) to ([data-component])`.                                                             | error    | no      |
| [`part-variables`](./src/rules/part-variables/README.md)                               | A part variable is written only by the owner of the part it names, and read only by that part.                                                    | error    | no      |
| [`no-abbreviations`](./src/rules/no-abbreviations/README.md)                           | Names that other people and tools read use full words.                                                                                            | warning  | no      |
| [`config-check`](./src/rules/config-check/README.md)                                   | The rules that keep a promise together are switched on together, and no rule the methodology contradicts is on.                                   | warning  | no      |

A rule is written with its namespace in a config: `"statefulcss/bind-once": true`. `no-undeclared-state-variables` reports a variable no part reads as a warning, and its other problems as errors.

`config-check` reads the Stylelint config, not the stylesheet, and says each problem once for a run: once for a `stylelint` command, on the first file it's shown on, and on every file an editor shows, since an editor lints each file in a run of its own. Two things change that count. With `--cache`, a file whose result is cached isn't linted, so a run that lints only cached files doesn't say it. And files given different `referenceFiles` in one run each get it once. It's reported on the file's first line, or in a `.vue` file where its first `<style>` block's content starts. A project that switches one of those rules off on purpose switches this one off too.

## Settings

The rules share the project's settings, written once in `statefulcss.config.json` (or `.js`, `.mjs`, `.ts`, or a `statefulcss` key in `package.json`) and read by [`@statefulcss/config`](../config/README.md). The nearest file to the linted file wins; with none, every setting has its default.

```json
{
	"blockingStates": [":disabled", "[aria-disabled=\"true\"]", "[data-loading]", "[inert]"],
	"themeFiles": ["**/styles/themes/**"]
}
```

| Setting                                                | Default                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `componentAttribute`, `partAttribute`, `slotAttribute` | `data-component`, `data-part`, `data-slot`                         |
| `themeAttribute`, `baseTheme`, `themeFiles`            | `data-theme`, `base`, `["**/styles/themes/**"]`                    |
| `blockingStates`                                       | `:disabled`, `[aria-disabled="true"]`, `[data-loading]`, `[inert]` |
| `interactionStates`                                    | `:hover`, `:focus`, `:focus-visible`, `:focus-within`, `:active`   |
| `stateAttributes`                                      | none                                                               |
| `layers`                                               | `base`, `themes`, `components`, `utilities`                        |
| `strict`, `ignoreLayers`                               | `false`, none                                                      |

Stylelint's `--cache` keeps a file's result until the file or the Stylelint config changes, and it doesn't know about `statefulcss.config.json`. After changing the settings, lint once without the cache: run without `--cache`, or delete `.stylelintcache`.

These are settings, not rule options: a setting written as a rule's option is an invalid option of that rule, which then doesn't run. A settings file that can't be read, or that has an unknown setting or a value of the wrong kind, is an invalid option too, said once for each file it applies to, and no rule that reads stylesheets runs on those files. The rules that read stylesheets report it; `config-check` doesn't read the settings, so with only it on, nothing says so.

## License

MIT. See [LICENSE](./LICENSE).

Maintained by [Human Interface Studio](https://humaninterface.studio).
