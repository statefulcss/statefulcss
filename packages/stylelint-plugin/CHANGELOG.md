# @statefulcss/stylelint-plugin

## 0.1.0

### Minor Changes

- 9beeced: The first Stateful CSS rules, read from `@statefulcss/core`'s model with the project's `statefulcss.config` settings, in plain CSS, SCSS and the `<style>` blocks of a `.vue` file: `variable-role-prefix`, `theme-tokens`, `bind-once`, `bind-through-state-variables`, `blocking-states-win` (fixable), `visited-colors-only`, `no-undeclared-state-variables`, `parts-in-scope`, `part-variables` and `no-abbreviations`. `config-check` checks the Stylelint config itself, once for each run (a `stylelint` command, a `stylelint.lint()` call, so each file an editor lints): `bind-once` without `bind-through-state-variables`, `bind-once` and `declaration-block-no-duplicate-custom-properties` both off, and `no-descending-specificity` or `no-duplicate-selectors` on. `recommended` and `compatible` switch every rule on at its level, set `declaration-block-no-duplicate-properties` to a warning that suggests `@supports` and never deletes a fallback, and switch `declaration-block-no-duplicate-custom-properties` and `no-duplicate-selectors` off, so a block can hold two guards around interaction states. `recommended` also accepts what Sass, Vue and CSS Modules add to CSS, by file name. A settings file that can't be used, or a setting written as a rule option, is an invalid option. A rule that fails on a file gives one warning on it, with a link to report the problem. Each rule's README ships in the package, and `ruleMeta` gives its URL on GitHub and whether the rule can fix.

### Patch Changes

- 85ea165: Core depends on `postcss-selector-parser` `^7.2.1`, and the plugin on `stylelint-config-recommended` `^19.1.0`. The plugin works with Stylelint 18.1, which runs the rules again on the fixed code with `--fix` and reports where the fixed code has each problem.
- 957e130: Astro's and Svelte's scoped `<style>` blocks. Core reads an `.astro` file's plain `<style>` blocks as one scoped sheet, and its `is:global` and `is:inline` blocks as one plain sheet. `Sheet.scopesLimits` says whether a sheet's build adds the file's scope to `@scope` limits, which only Astro's scoped sheet does. `Scope.limitIsGlobalComponents` says whether a limit is `:global([data-component])`, and `Scope.sheet` names its sheet. `parts-in-scope` checks a limit as it will ship: `to (:global([data-component]))` in an Astro `<style>`, and `to ([data-component])` everywhere else. `recommended` accepts `:global()` in `.astro` and `.svelte` files.
- bf60857: Moves to Stylelint 18. The peer range is now `^18.0.0` (it was `^17.0.0`), and Node is `^22.22.2 || ^24.15.0 || >=26.0.0`, the versions Stylelint 18 runs on. Config and core still run on Node 22.18 and newer.
- 8739b0f: `@statefulcss/stylelint-plugin/rule-names` exports `ruleNames` on its own, so a tool can list the rules without loading Stylelint, the settings or the rules.
- Updated dependencies [5156755]
- Updated dependencies [cc56f34]
- Updated dependencies [35dca89]
- Updated dependencies [94d8731]
- Updated dependencies [1b6b6b6]
- Updated dependencies [71d47a8]
- Updated dependencies [8f717fb]
- Updated dependencies [1b6b6b6]
- Updated dependencies [928e671]
- Updated dependencies [ff8fd59]
- Updated dependencies [806573d]
- Updated dependencies [85ea165]
- Updated dependencies [957e130]
  - @statefulcss/config@0.1.0
  - @statefulcss/core@0.1.0

## 0.0.4

### Patch Changes

- Updated dependencies [16ee6b8]
  - @statefulcss/config@0.0.4
  - @statefulcss/core@0.0.4

## 0.0.3

### Patch Changes

- 06c968f: Require Node.js 22.18.0 or newer (`>=22.18.0`), the first Node 22 that strips TypeScript types natively, so a `statefulcss.config.ts` loads without a TypeScript loader. Node 20 has reached end of life.
- Updated dependencies [06c968f]
  - @statefulcss/config@0.0.3
  - @statefulcss/core@0.0.3

## 0.0.2

### Patch Changes

- ef8352b: First release through CI, published with provenance. The packages are still in development and not ready for use.
- Updated dependencies [ef8352b]
  - @statefulcss/config@0.0.2
  - @statefulcss/core@0.0.2
