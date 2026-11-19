# bind-once

Each property is declared once per element. If it needs to change, it's bound once to a state variable, and the variable changes.

Severity: error. Fixable: no.

## Checks

- **Default mode.** A property may be declared directly in one place on an element: its own block, or a single state, variant or query, where it starts from its inherited or initial value. Declared in two places (the element's own block and a hover, a variant and a hover, two states), each declaration outside the element's own block is reported. An element with any state variable uses them for everything that changes on it, so a property it declares only in a state or variant is reported too.
- **Strict mode** (`strict: true` in `statefulcss.config`). Every declaration outside the element's own block is reported, `@supports` included, even a hover that is the property's only declaration. A layer listed in `ignoreLayers`, and the layers inside it, are left out of strict mode, not of the default mode's checks.
- **A place** is a block's selector and the queries around it. `@supports` in default mode is a fallback, not a change: a declaration under it counts as the place it falls back from, so `color: …; @supports (…) { color: …; }` is one place. A selector list (`&:hover, &:focus-visible`) is one written declaration, so one place.
- **An overlap involving a state variable,** in both modes: a shorthand and its longhand, or a logical and a physical property, in one place, where either reads a state variable (`padding: var(--s-padding)` with `padding-inline-start` after it). The later declaration is reported. A longhand followed by a shorthand that covers it, in one block, is Stylelint's `declaration-block-no-shorthand-property-overrides`.
- **A repeated custom property in one block,** in both modes: the second line always wins, so it's never a fallback. The message shows the `@supports` form, with the condition from the declaration that binds the variable when the block's element has one. It's checked everywhere, utilities and theme scopes included, since Stylelint's `declaration-block-no-duplicate-custom-properties` is off in both configs. Blocks inside `@keyframes` aren't checked.
- **What to bind.** A part's, a component root's or a global element's pseudo-element binds the part variable its host declares and changes (`--p-after-opacity`, on `a` for `a::after`); a part's pseudo-element changed by the root's state binds the root's (`--p-tab-after-opacity`), and so does a part (`--p-tab-color`). Anything else binds its own state variable. When a variant and a state both change a property, the message on the variant says to set a private (`--_background-color`, or `--_after-opacity` for a part variable) that the variable's default reads. A selector list gets one instruction for each variable it binds: `&::after, &::before` is told about `--p-after-opacity` and `--p-before-opacity` separately. A functional pseudo-element (`::part(label)`, `::highlight(results)`) has no part-variable name, so the message names its host as the owner of the variable and leaves the name to the author.
- `:visited` blocks set color properties directly, since `:visited` ignores custom properties, so they're left out. A repeated native property in one block is left to Stylelint's `declaration-block-no-duplicate-properties`, a warning in both configs.
- A utility, a theme scope and what `:deep()` or `:global()` selects are skipped, and so is a property declared in a block of unknown kind on that element (an extra class, `&.is-active`).
- **One finding for each written declaration.** A selector list on two elements reports once, naming both.

## Why

When states write properties directly, nothing says which properties change with state, and a value in the element's own block plus a value in a hover is already two writers of one property. Declared once, with every change going through a state variable, the state variables are the list of what can change, and only the state blocks set them, in the order they win. Strict mode adds a promise for teams that want it: the `--s-*` list is the complete answer to "what can change here?" for every element, including one whose only change is a hover.

## Cases

### The element's own block and a state both declare a property

Reported:

```css
.link {
	color: var(--t-color-foreground-accent);
	&:hover {
		color: var(--t-color-foreground-strong);
	}
}
```

Fixed:

```css
.link {
	--s-color: var(--t-color-foreground-accent);
	color: var(--s-color);
	&:hover {
		--s-color: var(--t-color-foreground-strong);
	}
}
```

### A variant and a state change the same property

Reported:

```css
.button {
	background-color: var(--t-color-background-raised);
	&[data-emphasis="primary"] {
		background-color: var(--t-color-background-accent);
	}
	&:hover {
		background-color: var(--t-color-background-raised-strong);
	}
}
```

Fixed: the variant sets a private; the state variable carries the change.

```css
.button {
	--_background-color: var(--t-color-background-raised);
	--_background-color-hover: var(--t-color-background-raised-strong);
	--s-background-color: var(--_background-color);
	background-color: var(--s-background-color);
	&[data-emphasis="primary"] {
		--_background-color: var(--t-color-background-accent);
		--_background-color-hover: var(--t-color-background-accent-strong);
	}
	&:hover {
		--s-background-color: var(--_background-color-hover);
	}
}
```

### A container query changes a property the element already declares

Reported:

```css
.card {
	padding: var(--t-space-4);
	@container --card (inline-size < 20rem) {
		padding: var(--t-space-2);
	}
}
```

Fixed:

```css
.card {
	--s-padding: var(--t-space-4);
	padding: var(--s-padding);
	@container --card (inline-size < 20rem) {
		--s-padding: var(--t-space-2);
	}
}
```

### A component's state changes its pseudo-element, which also declares the property

Reported:

```css
.link {
	&::after {
		opacity: 0;
	}
	&[aria-current="page"]::after {
		opacity: 1;
	}
}
```

Fixed: the link prepares a part variable for its pseudo-element.

```css
.link {
	--p-after-opacity: 0;
	&::after {
		opacity: var(--p-after-opacity);
	}
	&[aria-current="page"] {
		--p-after-opacity: 1;
	}
}
```

### An element with state variables declares a property directly in a state

Reported:

```css
.button {
	--s-opacity: 1;
	opacity: var(--s-opacity);
	&:hover {
		--s-opacity: 0.9;
		color: var(--t-color-foreground-strong);
	}
}
```

Fixed:

```css
.button {
	--s-opacity: 1;
	--s-color: var(--t-color-foreground-base);
	opacity: var(--s-opacity);
	color: var(--s-color);
	&:hover {
		--s-opacity: 0.9;
		--s-color: var(--t-color-foreground-strong);
	}
}
```

### Strict mode: a hover that is the property's only declaration

Reported in strict mode:

```css
.link {
	&:hover {
		text-decoration-thickness: 2px;
	}
}
```

Fixed:

```css
.link {
	--s-text-decoration-thickness: auto;
	text-decoration-thickness: var(--s-text-decoration-thickness);
	&:hover {
		--s-text-decoration-thickness: 2px;
	}
}
```

### Strict mode: `@supports` changes a value

Reported in strict mode:

```css
.badge {
	color: var(--t-color-foreground-base);
	@supports (color: contrast-color(red)) {
		color: contrast-color(var(--t-color-background-accent));
	}
}
```

Fixed: `@supports` changes the state variable's default, so the change is visible.

```css
.badge {
	--s-color: var(--t-color-foreground-base);
	@supports (color: contrast-color(red)) {
		--s-color: contrast-color(var(--t-color-background-accent));
	}
	color: var(--s-color);
}
```

### An overlap involving a state variable

Reported:

```css
.card {
	--s-padding: var(--t-space-4);
	padding: var(--s-padding);
	padding-inline-start: 0;
}
```

Fixed: each side is bound once.

```css
.card {
	--s-padding-block: var(--t-space-4);
	--s-padding-inline-end: var(--t-space-4);
	padding-block: var(--s-padding-block);
	padding-inline: 0 var(--s-padding-inline-end);
}
```

### A repeated custom property used as a fallback

Reported: the second line always wins, so browsers without `dvh` get an invalid `block-size`.

```css
.sheet {
	--s-block-size: 100vh;
	--s-block-size: 100dvh;
	block-size: var(--s-block-size);
}
```

Fixed:

```css
.sheet {
	--s-block-size: 100vh;
	@supports (block-size: 100dvh) {
		--s-block-size: 100dvh;
	}
	block-size: var(--s-block-size);
}
```

A repeated native property (`block-size: 100vh; block-size: 100dvh;`) works, and gets Stylelint's warning suggesting `@supports`.

### Not reported

- `.link { &:hover { text-decoration-thickness: 2px; } }`, in default mode: declared once, starting from the initial value.
- `@scope (.prose) to ([data-component]) { a:hover { text-decoration-thickness: 2px; } }`, in default mode: the same reason. Being page CSS doesn't matter.
- `.card { padding: var(--t-space-4); padding-inline-start: 0; }`: a plain overlap, with no state variable.
- `.badge { color: …; @supports (…) { color: …; } }`, in default mode: a fallback, which can't change while the page runs.
- `.button { padding: var(--t-space-3); }` with `[data-part="icon"] { padding: 0; }` in its scope: two elements.
- `.button { opacity: 1; &::after { opacity: 0.5; } }`: the pseudo-element is its own element.
- `.link { color: var(--s-color); &:visited { color: purple; } }`: the `:visited` exception.
- `.link:hover, .link:focus-visible { text-decoration-thickness: 2px; }`, in default mode: one declaration.

## Options

None of its own. It reads two `statefulcss.config` settings: `strict` (`false` by default) and, for strict mode, `ignoreLayers` (none by default). They apply to every file under the config's folder; Stylelint's `overrides` can still switch the rule off for some files. It also reads `themeAttribute`, to skip theme scopes, and the names of components and their parts.
