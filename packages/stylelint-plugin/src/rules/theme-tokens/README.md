# theme-tokens

Tokens and theme scopes belong together: a token is declared only in a theme scope, a theme scope declares only tokens and `color-scheme`, and themes are written only in the theme files.

Severity: error. Fixable: no.

## Checks

- **A token (`--t-*`) is declared only in a theme scope:** a selector whose own element carries the theme attribute (`[data-theme="espresso"]`, `html[data-theme]`), including the `@media` and `@supports` blocks nested inside it. A token on `:root` or `html` is reported, since switching the theme attribute wouldn't change it. So is a token on something inside a theme scope (`[data-theme="default"] .button`): that's a component, not the theme. A token anywhere else gets the advice to name the value as a private.
- **A theme scope declares only tokens and `color-scheme`.** A component variable set there gets its own message: a theme sets tokens, and a component's default reads them.
- **A `[data-color-scheme]` selector declares only `color-scheme`,** whether or not it also carries the theme attribute. A token there is reported. A color token holds both values with `light-dark()` in the theme scope, and the color scheme only picks one. `light-dark()` takes only colors, so any other token (`--t-space-2`) is told to move, unchanged, into the theme scope. A token is a color when its name has the word `color`, its value is a color (`#333`, `oklch()`, `black`, a `var()` of a color token), or its `@property` syntax is `<color>`.
- **Theme scopes and `[data-color-scheme]` selectors are written only in the theme files,** the files matching `themeFiles`. A rule is reported once, on its selector, however many blocks it holds.
- **Each theme in its own folder.** When a pattern ends in `**` (`**/styles/themes/**`), the folder it names is the themes folder. A file at its root, or in the base theme's folder (`base`), declares only the unnamed `[data-theme]` scope, so `[data-theme="base"]` in either place is told to write the unnamed `[data-theme]`; a file in any other folder, at any depth, declares only the theme that folder is named after. A selector list of themes in another theme's folder (`[data-theme="a"], [data-theme="b"]`) is told to split, with each theme's own folder. With a pattern that names no folder (`src/themes/*`), a file holds one theme: the first one it declares.
- **A token's `@property` registration is written only in the theme files.** Its `initial-value` is the token's global default, part of the base theme.
- **A theme file holds nothing else:** theme scopes, `[data-color-scheme]` selectors, token registrations, `@layer` and `@charset`, and `@import` of other theme files. A relative import (`./`, `../`) is checked against `themeFiles`; a package or a URL isn't, since the rule can't know its file. What core can't read, such as SCSS's `@use`, isn't reported.
- It applies everywhere: components, page elements and utilities. What `:deep()` or `:global()` selects isn't read.
- **Code with no file** (passed as a string, with no file name) is checked for what it declares, but not for where it's written.
- **One finding for each written declaration,** naming each place of a selector list.

## Why

A theme is a named set of tokens. If tokens are declared anywhere else, switching the theme attribute no longer switches the design. If a theme scope sets anything but tokens, it's styling components from outside. Keeping every theme in the theme files, each in its own folder, means a theme is never spread into component files, and two themes never share a file.

## Cases

### A token in a component

Reported:

```css
.button {
	--t-space-2: 0.5rem;
}
```

Fixed: a value the component names for itself is a private.

```css
.button {
	--_gap: 0.5rem;
}
```

### A token on `:root`

Reported: `:root` isn't a theme scope, so switching themes wouldn't change it.

```css
:root {
	--t-space-2: 0.5rem;
}
```

Fixed:

```css
html[data-theme="default"] {
	--t-space-2: 0.5rem;
}
```

### A theme scope reaching into a component

Reported: a descendant of a theme scope is a component, not the theme.

```css
[data-theme="default"] .button {
	--t-color-background-accent: blue;
}
```

Fixed: the theme sets the token; the component reads it.

```css
[data-theme="default"] {
	--t-color-background-accent: blue;
}
```

### A theme scope styling something

Reported: a theme scope declares only tokens and `color-scheme`.

```css
[data-theme="default"] {
	--t-space-2: 0.5rem;
	padding: 0;
}
```

Fixed: `padding` belongs to a base or component style.

```css
[data-theme="default"] {
	--t-space-2: 0.5rem;
}
```

### A theme setting a component variable

Reported: a theme sets tokens; component variables are set where the component is used.

```css
[data-theme="default"] {
	--c-button-background-color: red;
}
```

Fixed: a token the button's default reads.

```css
[data-theme="default"] {
	--t-color-background-accent: red;
}
```

### A theme scope written outside the theme files

Reported, in `src/styles/components/button.css`: theme scopes are written only in `src/styles/themes/`.

```css
[data-theme="espresso"] {
	--t-color-background-accent: #6f4e37;
}
```

Fixed: the same, in `src/styles/themes/espresso/index.css`.

### A theme in the wrong folder

Reported, in `src/styles/themes/espresso/index.css`: this folder is for the espresso theme.

```css
[data-theme="summer"] {
	--t-color-background-accent: #f4a261;
}
```

Fixed: the same, in `src/styles/themes/summer/index.css`.

### A token registered outside the theme files

Reported, in `src/styles/components/button.css`: the initial value defines the token outside the themes.

```css
@property --t-space-2 {
	syntax: "<length>";
	inherits: true;
	initial-value: 0.5rem;
}
```

Fixed: the same, in `src/styles/themes/` with the base theme.

### A `[data-color-scheme]` selector declaring tokens

Reported: dark is a color scheme, not a token set.

```css
[data-color-scheme="dark"] {
	--t-color-background-base: black;
}
```

Fixed: the token holds both values; the `data-color-scheme` attribute only picks one.

```css
[data-theme="default"] {
	--t-color-background-base: light-dark(white, black);
}
[data-color-scheme="dark"] {
	color-scheme: dark;
}
```

### Not reported

- `[data-theme="default"] { color-scheme: light dark; --t-color-background-base: light-dark(white, black); }`
- `[data-theme="default"] { @media (prefers-reduced-motion: reduce) { --t-duration-fast: 0s; } }`: a theme may adjust its own tokens to a preference.
- `:root { color-scheme: light dark; }`: it only sets `color-scheme`. Base styles on `html` and `:root` (`html { font-family: system-ui; }`) are fine too.
- `@property --t-space-2 { … }` in a theme file: its initial value is a global default, so it belongs with the base theme.
- `[data-theme="dark"] { --t-color-background-base: black; }` in `themes/dark/`: a valid theme scope; its name gets the separate `no-color-scheme-themes` warning.
- `[data-theme] { … }` in `themes/base/`, or in a file at the root of `themes/`: the base theme.
- `[data-theme="espresso"] { … }` in `themes/espresso/parts/spacing.css`: a folder under the theme's own.
- `@import "./base/index.css";` in a theme file: another theme file.

## Options

None of its own. It reads these `statefulcss.config` settings:

- `themeAttribute` (default `data-theme`): the attribute that makes a theme scope.
- `themeFiles` (default `["**/styles/themes/**"]`): globs for the theme files, matched against the file's path from the config's folder, or from the repository root when there's no config. An empty list means the project keeps no theme files, so where themes are written isn't checked; what they declare still is. Written as an option of this rule, it's an invalid option.
- `baseTheme` (default `base`): the base theme's folder.
