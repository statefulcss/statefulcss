# config-check

The rules that keep a promise together are switched on together, and no rule the methodology contradicts is on.

Severity: warning. Fixable: no.

## Checks

It reads the Stylelint config each file is linted with, not the stylesheet:

- **`statefulcss/bind-once` on and `statefulcss/bind-through-state-variables` off.** A state that changes a property through a private goes unreported.
- **`statefulcss/bind-once` off, and Stylelint's `declaration-block-no-duplicate-custom-properties` off too.** A repeated custom property goes unreported. Both configs switch Stylelint's rule off because `bind-once` reports the repeat.
- **Stylelint's `no-descending-specificity` on.** It reports state blocks written in the methodology's order, so both configs switch it off.
- **Stylelint's `no-duplicate-selectors` on.** It reports a block's second `&:where(:not(…))` guard, which the order of states needs where focus sits between two interaction states, or where a combined state follows its semantic state. Its options can't ignore only guards, so both configs switch it off.

Each problem is said once for a run, on the first file it's shown on. A run is one `stylelint` command, one `stylelint.lint()` call, or one PostCSS plugin made with `stylelint()`. An editor lints each file it shows in a run of its own, so it shows the warning on every file, and two projects linted in one process each get it. A problem that only some files have, through Stylelint's `overrides`, is said on the first of those files. A disable comment that hides it on one file leaves it to the next file of the run.

Two things change that count. With Stylelint's `--cache`, a file whose result is cached isn't linted, so this rule doesn't run on it: a run that lints only cached files doesn't say the problem, and a run that lints some says it on the first of those. And a run whose files are given different `referenceFiles` says it once for each set of them: each set is read as a run of its own.

It's reported where the file starts: on line 1, column 1, or in a `.vue` file where its first `<style>` block's content starts.

A config that can't be used isn't this rule's: a `statefulcss.config` file that can't be read, an unknown setting, a value of the wrong kind, or a project setting written as a rule option (`themeFiles` on `theme-tokens`). The rules that read stylesheets refuse those as an invalid option, so turning this rule off never hides them. This rule doesn't read the settings: with only it on, a settings file that can't be used isn't reported.

## Why

Some rules are only right together. `bind-once` binds a property to a state variable once, and `bind-through-state-variables` makes sure a state changes it only through that variable: with one of them off, a state can change a property through a private and nothing says so. A repeated custom property is a fallback that can't work, and it's reported by `bind-once` or by Stylelint's own rule, so switching both off leaves it unreported. And a rule that reports correct CSS teaches the opposite of the methodology.

## Cases

### `bind-through-state-variables` off

Reported:

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	rules: { "statefulcss/bind-through-state-variables": null },
};
```

Fixed: both on, as the configs set them.

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
};
```

### `bind-once` off, with nothing reporting a repeated custom property

Reported:

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	rules: { "statefulcss/bind-once": null },
};
```

Fixed: `bind-once` on, as the configs set it.

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
};
```

### `no-descending-specificity` on

Reported:

```js
export default {
	extends: ["stylelint-config-standard", "@statefulcss/stylelint-plugin/compatible"],
	rules: { "no-descending-specificity": true },
};
```

Fixed: `compatible`, listed last, switches it off.

```js
export default {
	extends: ["stylelint-config-standard", "@statefulcss/stylelint-plugin/compatible"],
};
```

### `no-duplicate-selectors` on

Reported:

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	rules: { "no-duplicate-selectors": true },
};
```

Fixed: the configs switch it off.

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
};
```

### Not reported

- `recommended` or `compatible` as they are.
- `bind-once` and `bind-through-state-variables` both off, with `declaration-block-no-duplicate-custom-properties` on.
- A config that switches this rule off with `"statefulcss/config-check": null`, or a file whose disable comment names it.

## Options

None, and it reads no `statefulcss.config` setting. A project that switches a rule off on purpose switches this one off too, the way it switches off any rule:

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	rules: {
		// Changes through privates are reviewed by hand in this project.
		"statefulcss/bind-through-state-variables": null,
		"statefulcss/config-check": null,
	},
};
```
