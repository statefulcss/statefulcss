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
// stylelint.config.js
export default { extends: ["@statefulcss/stylelint-plugin/recommended"] };
```

A project that already extends a config lists `compatible` last: the Stateful CSS rules, a few of Stylelint's rules the methodology needs, and the project's rules that contradict it switched off.

```js
export default { extends: ["stylelint-config-standard", "@statefulcss/stylelint-plugin/compatible"] };
```

Both configs load the plugin themselves. Each also:

- turns on `declaration-no-important`, `selector-no-unmatchable`, `selector-no-invalid` and `declaration-block-no-shorthand-property-overrides`, the last three through `stylelint-config-recommended` in `recommended`;
- sets `declaration-block-no-duplicate-properties` to a warning that suggests `@supports` for a fallback, with its fix off, so `--fix` never deletes the fallback;
- switches off `no-descending-specificity`, which reports state blocks written in the methodology's order, and `declaration-block-no-duplicate-custom-properties`, whose repeat `statefulcss/bind-once` reports;
- switches `selector-no-unmatchable` and `selector-no-invalid` off for `*.scss`, `*.sass` and `*.less`, as Stylelint's docs advise. Overrides go by file name, so a `.vue` file's `<style lang="scss">` block keeps them on.

`compatible` also switches off `custom-property-pattern`, `selector-class-pattern`, `custom-property-empty-line-before`, `declaration-empty-line-before` and `no-unknown-custom-properties`, which reject private names such as `--_gap`, CSS Modules classes such as `.Button`, or the way a component groups its defaults.

The rules read plain CSS, SCSS, and the `<style>` blocks of a `.vue` file.

## Rules

Each rule's page has its checks, its cases and its options.

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
| [`rules-work-together`](./src/rules/rules-work-together/README.md)                     | The rules that keep a promise together are switched on together, and no rule the methodology contradicts is on.                                   | warning  | no      |

A rule is written with its namespace in a config: `"statefulcss/bind-once": true`. `no-undeclared-state-variables` reports a variable no part reads as a warning, and its other problems as errors.

`rules-work-together` reads the Stylelint config, not the stylesheet, and says each problem once for a run, on the first file it's found in. A project that switches one of those rules off on purpose switches this one off too.

## Settings

The rules share the project's settings, written once in `statefulcss.config.json` (or `.js`, `.mjs`, `.ts`, or a `statefulcss` key in `package.json`) and read by [`@statefulcss/config`](../config). The nearest file to the linted file wins; with none, every setting has its default.

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

These are settings, not rule options: a setting written as a rule's option is an invalid option of that rule, which then doesn't run. A settings file that can't be read, or that has an unknown setting or a value of the wrong kind, is an invalid option too, said once, and no rule that reads stylesheets runs on the files it applies to.

## License

MIT. See [LICENSE](./LICENSE).

Maintained by [Human Interface Studio](https://humaninterface.studio).
