# rules-work-together

The rules that keep a promise together are switched on together, and no rule the methodology contradicts is on.

Severity: warning. Fixable: no.

## Checks

It reads the Stylelint config each file is linted with, not the stylesheet:

- **`statefulcss/bind-once` on and `statefulcss/bind-through-state-variables` off.** A state that changes a property through a private goes unreported.
- **`statefulcss/bind-once` off, and Stylelint's `declaration-block-no-duplicate-custom-properties` off too.** A repeated custom property goes unreported. Both configs switch Stylelint's rule off because `bind-once` reports the repeat.
- **Stylelint's `no-descending-specificity` on.** It reports state blocks written in the methodology's order, so both configs switch it off.

Each problem is said once for a run: on the first file it's found in, on that file's first line, and on that same file again whenever it's linted, so an editor keeps showing it. A problem that only some files have, through Stylelint's `overrides`, is said on the first of those files.

A config that can't be used isn't this rule's: a `statefulcss.config` file that can't be read, an unknown setting, a value of the wrong kind, or a project setting written as a rule option (`themeFiles` on `theme-tokens`). Every Stateful CSS rule refuses those as an invalid option, so turning this rule off never hides them.

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

### Not reported

- `recommended` or `compatible` as they are.
- `bind-once` and `bind-through-state-variables` both off, with `declaration-block-no-duplicate-custom-properties` on.
- A config that switches this rule off with `"statefulcss/rules-work-together": null`, or a file whose disable comment names it.

## Options

None, and it reads no `statefulcss.config` setting. A project that switches a rule off on purpose switches this one off too, the way it switches off any rule:

```js
export default {
	extends: ["@statefulcss/stylelint-plugin/recommended"],
	rules: {
		// Changes through privates are reviewed by hand in this project.
		"statefulcss/bind-through-state-variables": null,
		"statefulcss/rules-work-together": null,
	},
};
```
