# variable-role-prefix

Every custom property you declare, and every `@property` you register, starts with a role prefix and a name.

Severity: error. Fixable: no.

## Checks

- A custom property you declare starts with one of the six role prefixes, followed by a name:
  - `--t-` a token;
  - `--c-` a component variable;
  - `--s-` a state variable;
  - `--p-` a part variable, what a component prepares for one of its parts;
  - `--_` a private;
  - `--q-` a query variable, only ever queried with `@container style()`.
- A prefix with nothing after it (`--t-`) is reported, and so is `--` alone.
- `@property` registers a name for the whole page, so its name is checked the same way.
- An unprefixed name is allowed only as a library's variable, which the component's doc comment names in `@sets`. `@sets` covers the component of the block right after it, its scope included; another component in the same file needs its own. A name listed only in `@reads` may be read, not written.
- It applies everywhere: components, themes, utilities and global CSS. Only what `:deep()` or `:global()` selects is left out: a third party's element, whose names are the library's.
- The message suggests a role from how the file uses the name: queried with `@container style()`, a query variable; changed by a variant or a state, a state variable; declared in a theme, or on `:root` or `html`, a token; read by a component and set outside it, a component variable; otherwise a private. What `:root` changes for a dark color scheme is still a token.
- Casing after the prefix (`--_backgroundColor`) isn't checked: private names are the project's choice. The prefix itself is lowercase.

## Why

The prefix says who may write a variable. Without one, nobody can tell a token from a private from a library's variable, and none of the other rules can work.

## Cases

### A variable with no role

Reported:

```css
.button {
	--opacity: 1;
	opacity: var(--opacity);
	&:hover {
		--opacity: 0.9;
	}
}
```

Fixed: a state changes it, so it's a state variable.

```css
.button {
	--s-opacity: 1;
	opacity: var(--s-opacity);
	&:hover {
		--s-opacity: 0.9;
	}
}
```

### A prefix with no name

Reported:

```css
[data-theme="default"] {
	--t-: 1rem;
}
```

Fixed:

```css
[data-theme="default"] {
	--t-space-4: 1rem;
}
```

### A registered property with no role

Reported:

```css
@property --scale {
	syntax: "<number>";
	inherits: false;
	initial-value: 1;
}
```

Fixed:

```css
@property --_tabs-indicator-scale {
	syntax: "<number>";
	inherits: false;
	initial-value: 1;
}
```

### Writing a library's variable without saying so

Reported: `--swiper-theme-color` has no role and isn't listed in `@sets`.

```css
.gallery {
	--swiper-theme-color: var(--t-color-foreground-accent);
}
```

Fixed: the doc comment allows exactly this name, for this component.

```css
/**
 * Gallery
 * @sets --swiper-theme-color
 */
.gallery {
	--swiper-theme-color: var(--t-color-foreground-accent);
}
```

### `@sets` covers only the component right after it

Reported: `.card` has no doc comment allowing it.

```css
/**
 * Gallery
 * @sets --swiper-theme-color
 */
.gallery {
	--swiper-theme-color: var(--t-color-foreground-accent);
}

.card {
	--swiper-theme-color: var(--t-color-foreground-accent);
}
```

Fixed: its own doc comment.

```css
/**
 * Card
 * @sets --swiper-theme-color
 */
.card {
	--swiper-theme-color: var(--t-color-foreground-accent);
}
```

### Writing a library's variable listed only in `@reads`

Reported:

```css
/**
 * Popup
 * @reads --available-width
 */
.popup {
	--available-width: 20rem;
}
```

Fixed: `@sets` says the component writes it.

```css
/**
 * Popup
 * @sets --available-width
 */
.popup {
	--available-width: 20rem;
}
```

### A variable declared for the whole page

Reported: `--space-4` has no role prefix. Declared on `:root`, it's a token.

```css
:root {
	--space-4: 1rem;
}
```

Fixed: `theme-tokens` then moves it into a theme.

```css
:root {
	--t-space-4: 1rem;
}
```

### A utility's variable

Reported: a utility is the project's own CSS, so its names need roles too.

```css
@layer utilities {
	.u-stack {
		--gap: 1rem;
		gap: var(--gap);
	}
}
```

Fixed:

```css
@layer utilities {
	.u-stack {
		--_gap: 1rem;
		gap: var(--_gap);
	}
}
```

### Not reported

- Reading a library's variable: `.popup { max-inline-size: var(--available-width); }`. Reading is always allowed.
- Writing a variable `ignoreProperties` matches (`["/^--swiper-/"]`), for a library used in many files.
- A line with Stylelint's standard disable comment and a reason: `/* stylelint-disable-next-line statefulcss/variable-role-prefix -- Swiper reads this */`.
- What `:deep()` or `:global()` selects: `.gallery :deep(.swiper) { --swiper-theme-color: red; }`.

## Options

`ignoreProperties`: names allowed everywhere, such as a library's used in many files. Each is a name, which matches only itself, or a `/regex/` string (`/regex/i` ignores case), as in Stylelint's own rules; a JavaScript config may give a regular expression. One pattern on its own is a list of one.

```json
{
	"rules": {
		"statefulcss/variable-role-prefix": [true, { "ignoreProperties": ["/^--swiper-/"] }]
	}
}
```

It reads no `statefulcss.config` settings.
