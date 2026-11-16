# parts-in-scope

A component's parts are styled only inside its `@scope (root) to ([data-component])`, written after its root block.

Severity: error. Fixable: yes, for `&` and `:scope` before a part inside a scope.

## Checks

- A `[data-part]` selector appears only inside its component's scope. `root` is the component's class or `[data-component="name"]`.
- A part selected with no component is reported too, on its own (`[data-part="title"]`) or from a global element (`main [data-part="title"]`, `@scope (main) { [data-part="title"] { … } }`): it reaches into every component that has a part of that name.
- A scope with no component (`main { @scope (section) { … } }`) is outside the rule, and so are a utility, `:deep()` and `:global()`.
- The selector is checked, not the body: a rule that holds only an `@include`, or nothing, is checked like any other.
- Two exceptions, both in the root block:
  - a placement path that steps from the root through parts, each with `>`, and ends on a slot itself: `& > [data-part="footer"] > [data-slot="action"]`. A plain element or a sibling on the way, or the slot's `::after`, takes it outside the exception. The path is reported once, where it first goes wrong;
  - a part named inside `:has()`, to reach a state or a variant that lives on it: `&:has(:where([data-part="input"]):disabled)`, also inside the guard's `:not()`. `:has()` reaches into the root, as a descendant or with `>`, never a sibling with `+` or `~`.
- A component's scope has `to ([data-component])` as its limit: no other limit, and not none.
- A component's scope is written after its root block, not before it and not inside it.
- Inside a scope, `:scope` appears only as `:scope >`:
  - `& >` is written `:scope >`. `--fix` writes it;
  - `&` or `:scope` before a descendant (`:scope [data-part="icon"]`) is left out. `--fix` removes it;
  - `--fix` changes only what one written selector holds: it leaves a `&` that an outer rule wrote, and a comment between `:scope` and the next compound, for the author;
  - `:scope` with a condition (`:scope:hover`, `:scope[data-size="small"] [data-part="icon"]`, `&:not(.quiet) >`) is a variant or a state of the root, even when it can't be told which. It belongs in the root block. The message quotes the whole condition, and `--fix` leaves it;
  - `:scope` on its own (`:scope { … }`, `:scope::after`), and declarations written directly in the scope, style the root. They belong in the root block.
- The same holds for the scope's own root: a condition there (`@scope (.button:hover) to ([data-component])`) is a variant or state selecting the parts. It belongs in the root block, setting part variables that the parts read.
- A `[data-part]` attribute on a component root's own compound (`.tab[data-part="tab"]`) is reported: an element is a component or a part, never both.
- One finding for each written thing: a selector list under two components (`.card, .button { & [data-part="icon"] { … } }`) gets one finding that names both scopes.

## Why

A part selected outside its component's scope reaches into every nested component that has a part of the same name. The scope's `[data-component]` limit keeps a component's rules inside it, and it only works when every part rule is under it.

A scope nested in the root block changes its specificity when a build lowers nesting, and without `(&)` it applies nothing. Inside a scope, a build that lowers nesting writes `&` as `:scope`. `:scope` before a descendant adds (0,1,0) and matches what the descendant alone matches, so a component's part rules end up at two specificities. A root state written in the scope beats the root block's blocking states. A bare `:scope` beats the root block through scope proximity, even when the root block comes later.

## Cases

### A part outside its component's scope

Reported:

```css
.button [data-part="icon"] {
	inline-size: 1em;
}
```

Fixed:

```css
@scope (.button) to ([data-component]) {
	[data-part="icon"] {
		inline-size: 1em;
	}
}
```

### A limit that stops at any class

A part inside a utility-classed wrapper is missed.

Reported:

```css
@scope (.card) to ([class]) {
	[data-part="title"] {
		font-weight: 600;
	}
}
```

Fixed:

```css
@scope (.card) to ([data-component]) {
	[data-part="title"] {
		font-weight: 600;
	}
}
```

### A scope nested in the root block

Reported:

```css
.button {
	@scope (&) to ([data-component]) {
		[data-part="icon"] {
			inline-size: 1em;
		}
	}
}
```

Fixed:

```css
.button {
}

@scope (.button) to ([data-component]) {
	[data-part="icon"] {
		inline-size: 1em;
	}
}
```

### A root state written inside the scope

It beats the root block's blocking states.

Reported:

```css
.button {
	--s-opacity: 1;
	opacity: var(--s-opacity);

	&:disabled {
		--s-opacity: 0.5;
	}
}

@scope (.button) to ([data-component]) {
	:scope:hover {
		--s-opacity: 0.9;
	}
}
```

Fixed:

```css
.button {
	--s-opacity: 1;
	opacity: var(--s-opacity);

	&:where(:not(:disabled, [aria-disabled="true"], [data-loading], [inert])) {
		&:hover {
			--s-opacity: 0.9;
		}
	}

	&:disabled {
		--s-opacity: 0.5;
	}
}
```

### A state in the scope's own root

It selects every part inside the scope.

Reported:

```css
@scope (.button:hover) to ([data-component]) {
	[data-part="icon"] {
		opacity: 0.9;
	}
}
```

Fixed:

```css
.button {
	--p-icon-opacity: 1;

	&:hover {
		--p-icon-opacity: 0.9;
	}
}

@scope (.button) to ([data-component]) {
	[data-part="icon"] {
		opacity: var(--p-icon-opacity);
	}
}
```

### `&` and `:scope` before a part inside a scope

Reported:

```css
@scope (.button) to ([data-component]) {
	& > [data-part="icon"] {
		inline-size: 1em;
	}

	:scope [data-part="label"] {
		color: red;
	}
}
```

Fixed, by `--fix`:

```css
@scope (.button) to ([data-component]) {
	:scope > [data-part="icon"] {
		inline-size: 1em;
	}

	[data-part="label"] {
		color: red;
	}
}
```

### Not reported

- Placement from the root block through parts into a slot: `.card { & > [data-part="footer"] > [data-slot="action"] { justify-self: end; } }`.
- A state on a part reached from the root block: `.field { &:has(:where([data-part="input"]):disabled) { --s-opacity: 0.6; } }`, with `>` too, and the same state inside the guard's `:not()`.
- A scope with no component, whatever its body holds: `main { @scope (section) { p { … } } }`.
- A utility selecting a part: `@layer utilities { .stack [data-part="icon"] { @include paint; } }`.
- A file that styles another file's component's parts: `@scope ([data-component="tabs"]) to ([data-component]) { [data-part="list"] { … } }`.
- Bare elements and other classes inside a scope (`[data-part="body"] p`, `.hljs-keyword`): the scope stops at components, so they're the author's call.

## Options

None of its own. It reads three `statefulcss.config` settings: `componentAttribute`, `partAttribute` and `slotAttribute` (`data-component`, `data-part` and `data-slot` by default).
