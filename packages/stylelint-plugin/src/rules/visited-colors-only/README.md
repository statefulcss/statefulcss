# visited-colors-only

A `:visited` block declares only what `:visited` can apply: its color properties, set directly.

Severity: error. Fixable: no.

## Checks

- **What `:visited` applies:** `color`, `background-color`, the border colors (`border-color`, each side's, and their logical forms such as `border-inline-start-color`), `outline-color`, `column-rule-color`, `text-decoration-color`, `text-emphasis-color`, `caret-color`, `fill` and `stroke`, and WebKit's `-webkit-text-fill-color` and `-webkit-text-stroke-color`. Anything else in a `:visited` block is reported.
- **Custom properties** are ignored in `:visited` too, so a state variable set there does nothing. When the name ends with a color property (`--s-color`, `--p-after-border-color`), the message says to set that property directly.
- **A shorthand** (`border`, `background`, `outline`, `text-decoration`, …) is reported: only its color applies, and the rest of it, such as a width or `none`, is ignored. The message names the color longhand to write instead.
- **A block that needs `:visited` to apply:** `:visited` on the element, on its host for a pseudo-element (`.link:visited::after`), or on a link around it (`a:visited .icon`), whatever else the selector holds (`:visited:hover`, an extra class, a media query around it). Inside `:is()` or `:where()`, every selector of the list must need it: `:is(:visited:hover, :visited:focus)` does, `:is(:visited, :hover)` doesn't, since it also applies on hover.
- **Not a `:visited` block:** `:not(:visited)`, which matches every link that isn't visited, and `:has(:visited)`, which browsers never match.
- It applies everywhere: components, page elements and utilities. What `:deep()` or `:global()` selects isn't read.
- **One finding for each written declaration.** A selector list is reported only when every selector in it needs `:visited` (`.link:visited, .link:hover` still applies on hover), and then once, naming each place.

## Why

Browsers limit `:visited` to a few color properties, so a page can't find out which links someone has visited. Anything else in the block is silently ignored, custom properties included: a state variable set in `:visited` does nothing, and `text-decoration-line: none` leaves the underline. Stylelint has no level for a note, and a note on every correct `:visited` block would be noise, so the rule reports only what will be ignored.

## Cases

### `:visited` ignores custom properties and `text-decoration-line`

Reported:

```css
.link {
	&:visited {
		--s-color: purple;
		text-decoration-line: none;
	}
}
```

Fixed: only the color properties, set directly.

```css
.link {
	&:visited {
		color: purple;
	}
}
```

### Not reported

- `.link { &:visited { color: purple; text-decoration-color: purple; } }`: only color properties.
- `.link { &:visited:hover { color: purple; } }`: still `:visited`, still colors.
- `.link:not(:visited) { text-decoration-line: none; }`: a link that isn't visited applies everything.
- `.link:is(:visited, :hover) { text-decoration-line: none; }` and `.link:visited, .link:hover { … }`: they apply on hover too.
- `.card:has(:visited) { … }`: `:has()` never matches `:visited`.
- `.link { --s-color: blue; color: var(--s-color); &:hover { --s-color: navy; } &:visited { color: purple; } }`: the `:visited` exception to binding once.

## Options

None, and it reads no `statefulcss.config` setting.
