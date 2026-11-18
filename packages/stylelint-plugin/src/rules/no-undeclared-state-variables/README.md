# no-undeclared-state-variables

Every state variable and private an element reads or changes is declared on that element, except what its owner declares for it.

Severity: error, and a warning for a variable no part reads. Fixable: no.

## Checks

- An element reads only the state variables (`--s-*`) and privates (`--_*`) it declares itself. Each element has its own set: `.link` and `.link::after` are two elements.
- The exceptions:
  - a part reads, without declaring them, the `--p-{part}-*` and `--_{part}-*` its owner declares for it. A component root owns its parts, its slots and its own pseudo-elements; a part owns its pseudo-elements. A part's pseudo-element may read the private named for its part;
  - a part takes a shared private its component declares with `inherit` (`--_accent: inherit;`). Never a state variable or a part variable. A private taken with `inherit` that no owner in the component declares is an error: its value would come from an outer component.
- **The owner is chosen from the reader and the name, before anything else.** A `--p-{part}-*` read on a part, or on its pseudo-elements and the content under it, is the root's. A `--p-after-*` read on a part's `::after` is that part's, and the root feeds that pseudo-element with `--p-{part}-after-*`. The declaration, the unknown syntax and the across-files skip are checked on that one owner, not on any element above the reader.
- The other side:
  - reading a `--p-*` its owner doesn't declare is an error: the browser would take it from an outer component that has a part of the same name. A part's own declaration doesn't count: the message says the value comes from it, and asks the owner to declare it or the part to use a plain value;
  - a part never reads its component's own state variables;
  - a component declares a part's variables only when one of its own variants, states or queries writes them. A value that reads a changing variable isn't such a write;
  - a variable changed in a variant, a state or a query has its default in a block with no variant or state, so a nested instance never inherits a variant's value. A part that changes its own `--p-*` in a state is told to change its own state variable instead, or to have its owner write the part variable, since a part never declares one.
- **Renaming a part (warning).** A `--p-{part}-*` on a component root, or a `--_{part}-*` named for one of its parts, that no part reads. What counts as reading it: any part or slot, a pseudo-element of either, or content under a part, reading it or taking it with `inherit`. A part reading a part variable named for another part is `part-variables`' error, not a renamed part. An `inherit` passes a value through, so only the element that supplies the value counts as read: when a part declares its own value and its `::after` takes it with `inherit`, the root's is unread. A private also counts when the root reads it into a part variable that a part reads (`--p-icon-color: var(--_icon-color)`). A root read that reaches no part doesn't count, and neither does a plain element in the scope that belongs to no part. It isn't fixed: the right rename can't be guessed.
- **Syntax core can't read.** An `@include` or another unknown excuses a missing declaration only on the owner that would declare it: the element itself for a state variable or a private, the owner chosen above for a part variable or a private named for the reader. An unknown inside a part excuses nothing about its owner's part variables. An unknown under a variant, state or query excuses only a change there: it may keep a part variable from being called unchanging, but it doesn't supply a default, which must be in the element's own block. An unknown anywhere in the component turns the rename warning off.
- **Across files.** In a file that scopes a component by its attribute (`@scope ([data-component="tabs"])`) with no root block for it, what the root declares is skipped. What a part declares for its own pseudo-elements is still checked. A class scope with no root block is checked. For a root block whose file has no scope for its component, "no part reads it" is skipped, except for the root's own pseudo-elements styled in that file.
- **One finding for each written read and reason.** A selector list whose branches share a reason (`.card, .button { color: var(--s-missing); }`) gets one finding that names every element it holds for. Two reasons at one read stay two findings.
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

### A part's pseudo-element reads what only the root declares under that name

The tab's `::after` takes `--p-after-*` from the tab, its owner, not from the Card.

Reported:

```css
.card {
	--p-after-color: red;

	&:hover {
		--p-after-color: blue;
	}

	&::after {
		color: var(--p-after-color);
	}
}

@scope (.card) to ([data-component]) {
	[data-part="tab"]::after {
		color: var(--p-after-color);
	}
}
```

Fixed: the tab declares it for its own pseudo-element, and the Card feeds that pseudo-element with `--p-tab-after-*`.

```css
.card {
	--p-tab-after-color: red;

	&:hover {
		--p-tab-after-color: blue;
	}
}

@scope (.card) to ([data-component]) {
	[data-part="tab"] {
		--p-after-color: red;

		&[aria-selected="true"] {
			--p-after-color: blue;
		}

		&::after {
			color: var(--p-after-color);
			background: var(--p-tab-after-color);
		}
	}
}
```

### A private taken with `inherit` that nothing in the component declares

Reported:

```css
.card {
	color: red;
}

@scope (.card) to ([data-component]) {
	[data-part="badge"] {
		--_accent: inherit;
		color: var(--_accent);
	}
}
```

Fixed: the Card declares the private the badge takes.

```css
.card {
	--_accent: red;
	color: var(--_accent);
}

@scope (.card) to ([data-component]) {
	[data-part="badge"] {
		--_accent: inherit;
		color: var(--_accent);
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

Fixed: the Button's writes are renamed for the glyph.

```css
.button {
	--p-glyph-color: var(--t-color-neutral-600);

	&:hover {
		--p-glyph-color: var(--t-color-neutral-800);
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
- A part taking a shared private with `inherit`, when its component declares it: `.card { --_accent: red; }` with `[data-part="badge"] { --_accent: inherit; color: var(--_accent); }` in its scope.
- A part's pseudo-element reading the root's private while its part has an `@include`, which may declare that private for it: `[data-part="tab"] { @include palette; &::after { color: var(--_after-color); } }`.
- A part forwarding its root's private to its pseudo-element with `inherit`, which is the same as not declaring it: `.card { --_icon-color: red; }` with `[data-part="icon"] { --_icon-color: inherit; &::after { color: var(--_icon-color); } }` in its scope. A value of the part's own there (`--_icon-color: blue`) is reported, even when the root is in another file or has an `@include`.
- A part taking a private named for another part: `[data-part="badge"] { --_accent-ink: inherit; color: var(--_accent-ink); }` beside an `accent` part.
- A part variable the root declares, which a state's `@include` may change: `.card { --p-title-color: red; &:hover { @include paint; } }`.
- Parts styled from another file, reading the part variables that file's root block declares: `@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { gap: var(--p-list-gap); } }`.
- Tokens and component variables, which come from outside: `color: var(--c-card-color, var(--t-color-text))`.

## Options

None of its own. It reads three `statefulcss.config` settings, for the names of components and their parts: `componentAttribute`, `partAttribute` and `slotAttribute` (`data-component`, `data-part` and `data-slot` by default).
