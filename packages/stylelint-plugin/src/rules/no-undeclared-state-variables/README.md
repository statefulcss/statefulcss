# no-undeclared-state-variables

Every state variable and private an element reads or changes is declared on that element, except what its owner declares for it.

Severity: error, and a warning for a variable no part reads. Fixable: no.

## Checks

- An element reads only the state variables (`--s-*`) and privates (`--_*`) it declares itself. Each element has its own set: `.link` and `.link::after` are two elements.
- The exceptions:
  - a part reads, without declaring them, the `--p-{part}-*` and `--_{part}-*` its owner declares for it. A component root owns its parts, its slots and its own pseudo-elements; a part owns its pseudo-elements. A part's pseudo-element may read the private named for its part;
  - a part takes a shared private its component declares with `inherit` (`--_accent: inherit;`). Never a state variable or a part variable.
- The other side:
  - reading a `--p-*` its owner doesn't declare is an error: the browser would take it from an outer component that has a part of the same name. A part's own declaration doesn't count;
  - a part never reads its component's own state variables;
  - a component declares a part's variables only when one of its own variants, states or queries writes them. A value that reads a changing variable isn't such a write;
  - a variable changed in a variant, a state or a query has its default in a block with no variant or state, so a nested instance never inherits a variant's value.
- **Renaming a part (warning).** A `--p-{part}-*` on a component root, or a `--_{part}-*` named for one of its parts, that no part reads. The root's own reads don't count. It isn't fixed: the right rename can't be guessed.
- **Syntax core can't read.** An `@include` or another unknown excuses a missing declaration only on the element that would declare it: the element itself for a state variable or a private, its owner for a part variable or a private named for it. An unknown inside a part excuses nothing about its owner's part variables.
- **Across files.** In a file that scopes a component by its attribute (`@scope ([data-component="tabs"])`) with no root block for it, "declared by its owner" is skipped, and so is a private named for the part. A class scope with no root block is checked. For a root block whose file has no scope for its component, "no part reads it" is skipped.
- Foreign elements (`:deep()`, `:global()`) and utilities are skipped, and so is a variable written in a block core can't classify.

## Why

Custom properties inherit. An element that reads `--s-display` or `--_padding` without a declaration, its own or its owner's for it, silently gets whatever an ancestor set. It looks right until something above changes it. A component and its parts are one unit: what the component declares for a part is visible, and the names say whose it is.

## Cases

### A part reads its component's own state variable

Reported:

```css
.button {
	--s-display: inline-flex;
	display: var(--s-display);
}

@scope (.button) to ([data-component]) {
	[data-part="spinner"] {
		display: var(--s-display);
	}
}
```

Fixed: the Button prepares the spinner's part variable, and its state writes it.

```css
.button {
	--s-display: inline-flex;
	--p-spinner-display: none;
	display: var(--s-display);

	&[data-loading] {
		--p-spinner-display: block;
	}
}

@scope (.button) to ([data-component]) {
	[data-part="spinner"] {
		display: var(--p-spinner-display);
	}
}
```

### A part reads a part variable its component doesn't declare

Inside a Card, it would take the Card's.

Reported:

```css
@scope (.note) to ([data-component]) {
	[data-part="title"] {
		color: var(--p-title-color);
	}
}
```

Fixed: the Note declares it, and its variant writes it.

```css
.note {
	--p-title-color: var(--t-color-text);

	&[data-tone="muted"] {
		--p-title-color: var(--t-color-text-muted);
	}
}

@scope (.note) to ([data-component]) {
	[data-part="title"] {
		color: var(--p-title-color);
	}
}
```

### A state changes a state variable nobody declared

Reported:

```css
.button {
	&:hover {
		--s-opacity: 0.9;
	}
}
```

Fixed:

```css
.button {
	--s-opacity: 1;
	opacity: var(--s-opacity);

	&:hover {
		--s-opacity: 0.9;
	}
}
```

### The component declares something it never changes

Reported:

```css
.card {
	--p-title-font-weight: 600;
}

@scope (.card) to ([data-component]) {
	[data-part="title"] {
		font-weight: var(--p-title-font-weight);
	}
}
```

Fixed: the title declares it.

```css
@scope (.card) to ([data-component]) {
	[data-part="title"] {
		font-weight: 600;
	}
}
```

### A private declared only in a variant

A default Card inside a large Card would get `2rem`.

Reported:

```css
.card {
	padding: var(--_padding, 1rem);

	&[data-size="large"] {
		--_padding: 2rem;
	}
}
```

Fixed: declared in the own block. No state changes it, so the variant writes the state variable.

```css
.card {
	--s-padding: 1rem;
	padding: var(--s-padding);

	&[data-size="large"] {
		--s-padding: 2rem;
	}
}
```

### A pseudo-element reads its component's state variable

`::after` is a part, and reads the link's own `--s-transform`.

Reported:

```css
.link {
	--s-transform: scaleX(0);

	&::after {
		transform: var(--s-transform);
	}
}
```

Fixed: the link prepares a part variable for its pseudo-element.

```css
.link {
	--p-after-transform: scaleX(0);

	&::after {
		transform: var(--p-after-transform);
	}

	&[aria-current="page"] {
		--p-after-transform: scaleX(1);
	}
}
```

### A renamed part (warning)

The icon became the glyph: the glyph reads what nothing declares, and nothing reads `--p-icon-color`.

Reported:

```css
.button {
	--p-icon-color: var(--t-color-neutral-600);

	&:hover {
		--p-icon-color: var(--t-color-neutral-800);
	}
}

@scope (.button) to ([data-component]) {
	[data-part="glyph"] {
		color: var(--p-glyph-color);
	}
}
```

### Not reported

- A part reading the part variables its component declares for it: `.button { --p-icon-color: var(--_icon-color); &:hover { --p-icon-color: var(--_icon-color-hover); } }` with `[data-part="icon"] { color: var(--p-icon-color); }` in its scope.
- A part with a state of its own, declaring its own `--s-*` from what the component prepared: `[data-part="tab"] { --s-color: var(--p-tab-color); color: var(--s-color); &[aria-selected="true"] { --s-color: … } }`.
- A part feeding its own pseudo-element: `[data-part="tab"] { --p-after-block-size: 0; &[aria-selected="true"] { --p-after-block-size: 2px; } &::after { block-size: var(--p-after-block-size); } }`.
- A part taking a shared private with `inherit`: `[data-part="badge"] { --_accent: inherit; … }`.
- Parts styled from another file, reading the part variables that file's root block declares: `@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { gap: var(--p-list-gap); } }`.
- Tokens and component variables, which come from outside: `color: var(--c-card-color, var(--t-color-text))`.

## Options

None of its own. It reads three `statefulcss.config` settings, for the names of components and their parts: `componentAttribute`, `partAttribute` and `slotAttribute` (`data-component`, `data-part` and `data-slot` by default).
