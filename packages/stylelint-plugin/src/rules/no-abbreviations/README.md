# no-abbreviations

Names that other people and tools read use full words, not abbreviations.

Severity: warning. Fixable: no.

## Checks

- **The names it reads:** tokens' and component variables' names (`--t-*`, `--c-*`), where they're declared or registered with `@property`; component classes, each place a selector writes them; and the names and values of the `data-*` attributes a selector or a scope's root writes, parts' and slots' names included.
- **Each word of a name** is checked against a deny list of known abbreviations, mostly Tailwind's vocabulary: `bg`, `fg`, `clr`, `txt`, `btn`, `prim`, `sec`, `hov`, `dis`, `brd`, `pad`, `mrg`, `sp`, `w`, `h`, `sz`, `lbl`, `hdr`, `itm` and others. Words are split at hyphens, underscores and camel case, so `.NavItm` is `Nav` and `Itm`.
- **The message suggests the whole name with each word in full**, in the abbreviation's case: `--c-card-pad` becomes `--c-card-padding`, `.NavItm` becomes `.NavItem`.
- **Never reported:** HTML element names (`nav`, `img`, `svg`, `li`), CSS's own words and units (`min`, `max`, `calc`, `rgb`, `px`), established terms (`id`, `url`, `aria`, `ui`), coordinates (`x`, `y`), numbers, and words the deny list doesn't know. A word on the list inside a longer word (`pad` in `padding`) is a different word.
- **T-shirt sizes** (`xs`, `sm`, `md`, `lg`, `xl`, `2xl`) are allowed unless `sizes` is `"full"`. Then each is suggested in CSS's own words for font sizes: `small`, `medium`, `large`, `x-small`, `x-large`, `xx-large`.
- **Not checked:** privates' names, unless `privates` is `true`; state, part and query variables, whose names come from their property, part or component; other classes than a component's; the platform's attributes (`type`, `aria-*`, `dir`) and their values; the attributes `statefulcss.config` names (`data-component`, `data-part`, `data-slot`, `data-theme`), whose values are still checked; utilities, and what `:deep()`, `:global()` or `:slotted()` selects; a name SCSS or Less builds with interpolation.
- **One finding for each written name.** A selector list writes a declaration once; a class written in two selectors is reported in both.

## Why

Full words are a Convention: readability wins over typing a few letters less. Assistants abbreviate by habit, because Tailwind made `bg`, `sm` and `px` the most common styling vocabulary, so the default decides what most Stateful CSS code looks like. A deny list, not a dictionary, so a brand name or a made-up word is never reported: the rule reports only what it knows is an abbreviation.

## Cases

### An abbreviation in a token's name

Reported:

```css
[data-theme="default"] {
	--t-bg-accent: blue;
}
```

Fixed:

```css
[data-theme="default"] {
	--t-color-background-accent: blue;
}
```

### An abbreviation in a component's class

Reported:

```css
.btn {
	display: flex;
}
```

Fixed:

```css
.button {
	display: flex;
}
```

### An abbreviation in a component variable's name

Reported:

```css
.page {
	--c-card-pad: var(--t-space-1);
}
```

Fixed:

```css
.page {
	--c-card-padding: var(--t-space-1);
}
```

### An attribute name and an attribute value the CSS selects on

Reported:

```css
.button {
	&[data-btn-emph="prim"] {
		color: red;
	}
}
```

Fixed:

```css
.button {
	&[data-emphasis="primary"] {
		color: red;
	}
}
```

### An abbreviation in a private's name, with `privates: true`

Reported:

```css
.card {
	--_pad: var(--t-space-1);
}
```

Fixed:

```css
.card {
	--_padding: var(--t-space-1);
}
```

### A T-shirt size, with `sizes: "full"`

Reported:

```css
.button {
	&[data-size="sm"] {
		padding: 0;
	}
}
```

Fixed:

```css
.button {
	&[data-size="small"] {
		padding: 0;
	}
}
```

### Not reported

- `.header { --c-nav-link-color: red; }`: HTML element names.
- `--c-tooltip-offset-x`, `--t-space-2`: coordinates and numbers.
- `--c-card-max-width`, `--t-space-px`: CSS's own words and units.
- `[data-size="sm"]`, `--t-space-md`, `--t-font-size-2xl`: T-shirt sizes, by default.
- `.card { --_pad: var(--t-space-1); }`: private names, by default.
- `@layer utilities { .btn-sm { … } }`: utilities.
- `.field[aria-label="Clear msg"]`: the platform's attributes.

## Options

- `ignoreWords`: words allowed in any name, such as a product's own short name. Each is a word, a `/regex/` (or `/regex/i`) string, or a regular expression in a JavaScript config, matched against one word of a name: `ignoreWords: ["btn"]` allows `.btn` and `--c-btn-gap`. A word is matched as written and in lowercase.
- `privates`: `true` checks privates' names (`--_*`) too. `false` by default.
- `sizes`: `"short"` (the default) allows T-shirt sizes; `"full"` reports them.

It reads the attribute names `componentAttribute`, `partAttribute`, `slotAttribute` and `themeAttribute` from `statefulcss.config`. A utility is a class block in `@layer utilities`.
