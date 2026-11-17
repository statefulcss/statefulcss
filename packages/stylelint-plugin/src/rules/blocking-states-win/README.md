# blocking-states-win

Interaction states never apply to a blocked element: they sit inside a guard that lists every blocking state, focus stays outside it, and blocking states set only their own look.

Severity: warning. Fixable: yes.

## Checks

- **An interaction state outside a guard.** On an element with a blocking state block, every interaction state (`:hover`, `:active`, and the others in `interactionStates`) is written inside a guard, a `:not()` that lists the blocking states: `&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) { &:hover { … } }`. The guard is on the element itself, or on its host for a pseudo-element; a guard on the component root doesn't guard its part. Hover inside `@media (hover: hover)` is still an interaction state, inside or around the guard. `:not(:hover)` is the look at rest, not an interaction state.
- **Which elements.** By default, an element with a blocking state block of its own, a pseudo-element whose host has one, and a part whose component root has one. In strict mode (`strict: true`), every element with an interaction state. A blocking state block is one with declarations; one reached through `:has()` (`&:has(:where([data-part="input"]):disabled)`) counts for the root.
- **A guard that leaves a blocking state out.** The guard lists every entry of `blockingStates`, compared as the config writes it (`:nth-child(2n+1)` matches `:nth-child(2n + 1)`). The root's guard also lists the blocking states it reaches through `:has()`. The message names the states it leaves out.
- **Focus inside a guard.** Focus states are exempt: an `aria-disabled` or loading control stays focusable and must still show focus. A state block whose interaction states are all focus states (`:focus-visible`, `:focus`, `:focus-within`) is reported when it sits inside a guard, whatever level applies.
- **Setting back.** A blocking state block that writes a variable an interaction or a semantic state also writes, with the same value as that variable's default (`--s-background-color: var(--_background-color)`), is reported on that declaration: the guard already keeps hover off, and the write hides that a disabled pressed button is pressed.
- **A part whose component has blocking states.** The part's own guard only sees the part, so its interaction states also sit inside a style query on a `--q-*` that its component's blocking states set: `@container style(--q-tabs-blocked: false) { &:hover { … } }`. When those blocking states set no `--q-*`, the message suggests one, named for the component (`--q-tabs-blocked`).
- **The `--q-*` a component's blocking states set.** It's only ever queried, never read with `var()`, and the component declares its default on its own root, so a nested component never inherits an outer one's value.
- Only elements in a component are checked: a root, a part, a slot, content and their pseudo-elements. A global element, a utility and what `:deep()` or `:global()` selects are skipped.
- **One finding for each written thing.** A selector list on two elements reports once, naming both; a guard written once for several interaction states reports once.

**`--fix`:**

- wraps unguarded interaction state rules in a guard, keeping their order. A run of such rules that follow each other shares one guard. It moves a rule only when it's nested and every selector in it is `&` with the state on it (`&:hover`, `&[aria-pressed="true"]:where(:hover)`), so a flat `.button:hover` and a selector that also holds focus (`&:hover, &:focus-visible`, `&:is(:hover, :focus-visible)`) are left to the author.
- adds the blocking states a guard leaves out, at the end of its `:not()`.

Focus inside the guard, setting back, and the part's style query are reported without a fix: each needs the author to move or remove declarations, and the query variable's name is the project's.

## Why

Hover changes the background, disabled changes the opacity, and a disabled button still reacts to hover. No two blocks set the same property, so nothing else catches it. It was the first bug the precedence bench found. The guard sits inside `:where()`, so it adds no specificity, and it says in the file when interaction states apply. Restoring (the blocking state setting back what hover changed) was the earlier answer; it needed rest privates once semantic states had to survive a blocking state, and the guard needs none.

It's a warning because a design can deliberately keep an effect on a disabled element, such as a tooltip on hover. That's what Stylelint's disable comment with a reason is for.

Strict mode reports the case the default can't see: a `<button>` styled with hover but no disabled look still reacts to hover when it's disabled. Any element can also be made `[inert]`.

## Cases

### Hover isn't guarded

Reported: a disabled button still reacts to hover.

```css
.button {
	--s-background-color: var(--_background-color);
	--s-opacity: 1;
	background-color: var(--s-background-color);
	opacity: var(--s-opacity);
	&:hover {
		--s-background-color: var(--_background-color-hover);
	}
	&:disabled {
		--s-opacity: 0.5;
	}
}
```

Fixed:

```css
.button {
	--s-background-color: var(--_background-color);
	--s-opacity: 1;
	background-color: var(--s-background-color);
	opacity: var(--s-opacity);
	&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
		&:hover {
			--s-background-color: var(--_background-color-hover);
		}
	}
	&:disabled {
		--s-opacity: 0.5;
	}
}
```

### The guard leaves a blocking state out

Reported: the guard leaves out `[data-loading]` and `[inert]`, so a loading button still reacts to hover.

```css
&:where(:not(:disabled, [aria-disabled="true"])) {
	&:hover {
		--s-background-color: var(--_background-color-hover);
	}
}
```

Fixed: every configured blocking state; `--fix` adds the missing ones.

```css
&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
	&:hover {
		--s-background-color: var(--_background-color-hover);
	}
}
```

### A blocking state that sets back what hover changed

Reported: the guard already keeps hover off a disabled button; setting the background back hides that a disabled pressed button is pressed.

```css
&:disabled {
	--s-background-color: var(--_background-color);
	--s-opacity: 0.5;
}
```

Fixed: the blocking state sets only its own look.

```css
&:disabled {
	--s-opacity: 0.5;
}
```

### Focus written inside the guard

Reported: an `aria-disabled` or loading button stays focusable, and inside the guard it loses its focus ring.

```css
&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
	&:focus-visible {
		--s-outline-width: 2px;
	}
}
```

Fixed: focus outside the guard.

```css
&:focus-visible {
	--s-outline-width: 2px;
}
```

### A part whose component has blocking states

Reported: the tab's guard only sees the tab, so it still reacts to hover while Tabs is disabled.

```css
.tabs {
	--q-tabs-blocked: false;
	--s-opacity: 1;
	opacity: var(--s-opacity);
	&[aria-disabled="true"] {
		--q-tabs-blocked: true;
		--s-opacity: 0.5;
	}
}
@scope (.tabs) to ([data-component]) {
	[data-part="tab"] {
		--s-color: var(--t-color-text-muted);
		color: var(--s-color);
		&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
			&:hover {
				--s-color: var(--t-color-text);
			}
		}
	}
}
```

Fixed: the hover also waits for the component's query variable.

```css
&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
	@container style(--q-tabs-blocked: false) {
		&:hover {
			--s-color: var(--t-color-text);
		}
	}
}
```

### A blocking state reached through `:has()`

Reported: the Field's guard leaves out the disabled input.

```css
.field {
	&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
		&:hover {
			--s-color: var(--_color-hover);
		}
	}
	&:has(:where([data-part="input"]):disabled) {
		--s-opacity: 0.6;
	}
}
```

Fixed: `--fix` adds it to the guard.

```css
&:where(
	:not(:disabled, [aria-disabled="true"], [data-loading], [inert], :has(:where([data-part="input"]):disabled))
) {
	&:hover {
		--s-color: var(--_color-hover);
	}
}
```

### Not reported

- A semantic state with a guard, the decided form: `&:where(:not(…)) { &:hover { … } } &[aria-pressed="true"] { … } &:disabled, &[aria-disabled="true"], &[data-loading] { --s-opacity: 0.5; }`.
- `&:focus-visible { --s-outline-width: 2px; }` outside the guard: focus is exempt.
- By default, an element with interaction states and no blocking state block (strict mode reports it).
- Hover inside `@media (hover: hover)`, inside or around a full guard.
- `&:disabled { --s-color: var(--_color-disabled); }` when the default is `var(--_color)`: a value of its own is the blocking state's own look.
- `&:not(:hover) { … }`: the look at rest.
- `a:hover` next to `a:disabled`, and a utility's hover: not in a component.

## Options

None of its own. It reads `blockingStates` and `interactionStates`, the lists, and `strict` for the strict level, from `statefulcss.config`.
