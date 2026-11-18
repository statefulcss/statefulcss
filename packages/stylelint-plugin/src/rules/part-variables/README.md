# part-variables

A part variable is written only by the owner of the part it names, and read only by that part.

Severity: error. Fixable: no.

## Checks

- **Owners.** A component root block, with its variants, states and queries, writes the `--p-*` for its parts, its slots and its own pseudo-elements, and `--p-{part}-after-*` for a part's pseudo-element. A part's block writes `--p-after-*` for its own pseudo-elements.
- **Writers.** A part writes only `--p-{pseudo-element}-*`, for its own pseudo-elements, whether this file styles them or another does (`--p-before-content`). Any other `--p-*` on a part is reported: its own part variable (`[data-part="icon"] { --p-icon-color: red; }`), another part's, the one the root declares for the part's pseudo-element, or one named for nothing. Content, a slot and a pseudo-element write none, so any `--p-*` they write is reported.
- **Readers.** `--p-{part}-*` is read only by that part, its pseudo-elements and the content under it (`[data-part="body"] p`); `--p-{slot}-*` only by the slot, at the end of the root block's placement path: `& > [data-slot="{slot}"]`, or through parts, each step with `>` (`& > [data-part="footer"] > [data-slot="{slot}"]`); `--p-after-*` only by its owner's `::after`; `--p-{part}-after-*` only by that part's `::after`. A part or a slot reading any other `--p-*` is reported, whether or not the file styles the element it's named for. So is a root reading a `--p-*` on itself, and content under no part reading one.
- **A name that matches nothing.** On a part, it's reported, as above. On a root, a `--p-*` whose name matches no part, slot or pseudo-element of the component is left to `no-undeclared-state-variables`' rename warning. A part variable taken with `inherit` is left to that rule too, which reports it.
- The message names the element the variable is for when the file styles it, and the owner that writes it.
- **One finding for each written declaration.** A selector list reports once, naming every element it holds for.
- Global elements, utilities and what `:deep()` or `:global()` selects have no parts, so they're skipped. Style queries (`@container style(--p-…)`) aren't reads of a value.

## Why

`--p-*` is the one way a component's values reach its parts. A part variable written from anywhere else, or read by anything else, brings back the confusion it exists to remove: whose value is this, and who may change it.

## Cases

### The icon writes its own part variable

Reported:

```css
@scope (.button) to ([data-component]) {
	[data-part="icon"] {
		--p-icon-color: red;
		color: var(--p-icon-color);
	}
}
```

Fixed: the icon's own value is plain, or its own state variable.

```css
@scope (.button) to ([data-component]) {
	[data-part="icon"] {
		color: red;
	}
}
```

### The label reads the icon's part variable

Reported:

```css
.button {
	--p-icon-color: var(--t-color-text);
	&[data-loading] {
		--p-icon-color: var(--t-color-text-muted);
	}
}
@scope (.button) to ([data-component]) {
	[data-part="label"] {
		color: var(--p-icon-color);
	}
}
```

Fixed: the label gets its own.

```css
.button {
	--p-label-color: var(--t-color-text);
	&[data-loading] {
		--p-label-color: var(--t-color-text-muted);
	}
}
@scope (.button) to ([data-component]) {
	[data-part="label"] {
		color: var(--p-label-color);
	}
}
```

### The root binds a part variable on itself

Reported:

```css
.button {
	--p-icon-color: red;
	color: var(--p-icon-color);
}
```

Fixed: its own value is a state variable.

```css
.button {
	--s-color: red;
	color: var(--s-color);
}
```

### Not reported

- A part's pseudo-element reading what its part declares for it: `[data-part="tab"] { --p-after-block-size: 0; &::after { block-size: var(--p-after-block-size); } }`.
- The root feeding a part's pseudo-element: `.tabs { --p-tab-after-opacity: 1; &[aria-disabled="true"] { --p-tab-after-opacity: 0.5; } }` read by `[data-part="tab"]::after`.
- A slot's placement: `.toolbar { --p-item-align-self: auto; & > [data-slot="item"] { align-self: var(--p-item-align-self); } }`.
- A slot's placement through a part: `.card { --p-action-gap: 0; & > [data-part="footer"] > [data-slot="action"] { gap: var(--p-action-gap); } }`.
- Content under a part reading its part's variable: `[data-part="body"] p { color: var(--p-body-color); }`.
- A part writing the part variable for its own `::before`, styled in another file: `[data-part="title"] { --p-before-content: "#"; }`.

## Options

None of its own. It reads three `statefulcss.config` settings, for the names of components and their parts: `componentAttribute`, `partAttribute` and `slotAttribute` (`data-component`, `data-part` and `data-slot` by default).
