# bind-through-state-variables

Every change flows through a variable: a property never reads a private that a variant or a state changes, and a variable a variant writes is never written by a state.

Severity: error. Fixable: no.

## Checks

- **A property reading a changing private.** A private is changing when a variant or a state writes it, when its value reads a changing private, or when it takes one with `inherit`. A property that reads it directly, anywhere in its value (`calc()` and other functions included), is reported. The message names the variant or state that changes the private, the privates on the way for a chain, and the variable to bind through:
  - its own state variable (`--s-background-color`), when the private is its element's own;
  - the part variable its owner declares, when the private is the owner's: a pseudo-element of a component root, a part or a page element (`a::after`) reading its host's private binds `--p-after-color` on the host; a part, a slot or a part's pseudo-element reading the root's binds `--p-icon-color` or `--p-icon-before-color` on the root. A private taken with `inherit` counts as the owner's that supplies it.
- **A variable a variant writes, which a state writes too.** A state variable (`--s-*`), or a part variable (`--p-*`) on its owner, written by a variant block and by a state block on the same element is reported on each variant's declaration. Context states (`@media`, `@container`) count as states. The message says to set a private (`--_padding-inline`) in the variant and give the variable the default that reads it. It runs over every variant, whatever its order: a variant written before the states hides the collision only by order.
- **A variant combined with a state** (`&[data-emphasis="primary"]:hover`) is reported when another state writes the same variable, since the combination outranks it. The message says to set a private in the variant and let the state set the variable from it. A combination with no other state writing the variable isn't reported, and neither are two combinations alone.
- A block of unknown kind (an extra class, `&.is-active`) isn't a variant or a state, so a private written only there isn't changing, and a variable written there isn't a collision.
- A utility, a theme scope and what `:deep()` or `:global()` selects are skipped.
- **One finding for each written declaration.** A selector list on two elements, or two variants in one selector list, reports once, naming both.

## Why

The `--s-*` list only answers "what can change here?" if every changing property goes through it. A property reading a changing private directly is a change nobody can see from that list. `bind-once` catches a property declared in a state; this rule catches the change that arrives through a private.

The second check catches the one place a variant writing a state variable breaks: a state that writes the same one. A size variant (0,2,0) beats a container query that writes the same state variable, so the narrow layout never applies to a large button; a combination of a variant and hover beats pressed, so a pressed primary button looks hovered. With the variant writing a private that the state variable's default reads, only states write the state variable, and their order decides.

## Cases

### A variant changes a private that a property reads directly

Reported:

```css
.button {
	--_background-color: var(--t-color-background-raised);
	background-color: var(--_background-color);
	&[data-emphasis="primary"] {
		--_background-color: var(--t-color-background-accent);
	}
}
```

Fixed:

```css
.button {
	--_background-color: var(--t-color-background-raised);
	--s-background-color: var(--_background-color);
	background-color: var(--s-background-color);
	&[data-emphasis="primary"] {
		--_background-color: var(--t-color-background-accent);
	}
}
```

### A variant and a state write the same state variable

Reported: in a narrow container, the variant (0,2,0) beats the query.

```css
.button {
	--s-padding-inline: var(--t-space-3);
	padding-inline: var(--s-padding-inline);
	&[data-size="large"] {
		--s-padding-inline: var(--t-space-4);
	}
	@container (inline-size < 12rem) {
		--s-padding-inline: var(--t-space-1);
	}
}
```

Fixed: the variant writes a private; the state variable's default reads it.

```css
.button {
	--_padding-inline: var(--t-space-3);
	--s-padding-inline: var(--_padding-inline);
	padding-inline: var(--s-padding-inline);
	&[data-size="large"] {
		--_padding-inline: var(--t-space-4);
	}
	@container (inline-size < 12rem) {
		--s-padding-inline: var(--t-space-1);
	}
}
```

### A change that arrives through a chain of privates

Reported: `margin-block` reads `--_half`, which reads `--_gap`, which a variant changes.

```css
.card {
	--_gap: var(--t-space-4);
	--_half: calc(var(--_gap) / 2);
	margin-block: var(--_half);
	&[data-density="compact"] {
		--_gap: var(--t-space-2);
	}
}
```

Fixed:

```css
.card {
	--_gap: var(--t-space-4);
	--s-margin-block: calc(var(--_gap) / 2);
	margin-block: var(--s-margin-block);
	&[data-density="compact"] {
		--_gap: var(--t-space-2);
	}
}
```

### A variant combined with a state, and another state

Reported: the combination outranks `:active`, so a pressed primary button looks hovered.

```css
.button {
	--s-background-color: var(--t-color-background-raised);
	background-color: var(--s-background-color);
	&[data-emphasis="primary"]:hover {
		--s-background-color: var(--t-color-background-accent);
	}
	&:active {
		--s-background-color: var(--t-color-background-pressed);
	}
}
```

Fixed: the variant sets a private, and the hover reads it.

```css
.button {
	--_background-color-hover: var(--t-color-background-raised-strong);
	--s-background-color: var(--t-color-background-raised);
	background-color: var(--s-background-color);
	&[data-emphasis="primary"] {
		--_background-color-hover: var(--t-color-background-accent);
	}
	&:hover {
		--s-background-color: var(--_background-color-hover);
	}
	&:active {
		--s-background-color: var(--t-color-background-pressed);
	}
}
```

### Not reported

- `.button { --s-gap: var(--t-space-1); gap: var(--s-gap); &[data-size="large"] { --s-gap: var(--t-space-2); } }`: only the size variant changes the gap, so it writes the state variable.
- `.card { --_gap: var(--t-space-4); gap: var(--_gap); }`: nothing changes `--_gap`, so it's static.
- `.card { --_gap: …; --s-padding-inline: var(--_gap); padding-inline: var(--s-padding-inline); &[data-density="compact"] { --_gap: …; } }`: the change goes through the state variable.
- `.button { --s-opacity: 1; &:hover { --s-opacity: 0.9; } &:active { --s-opacity: 0.8; } }`: two states, and no variant; their order decides.
- `.button { &[data-emphasis="primary"]:hover { --s-background-color: … } }` with no other state writing `--s-background-color`: nothing for the combination to outrank.
- `.tab { --_color: …; color: var(--_color); &.is-active { --_color: …; } }`: an extra class is a block of unknown kind, not a variant or a state.
- `.button { &[data-size="large"] { --_gap: …; } &:hover { --_gap: …; } }`: a variant and a state may both write a private; the property reads it through `--s-gap`.

## Options

None of its own. It reads `themeAttribute`, to skip theme scopes, and the names of components and their parts from `statefulcss.config`.
