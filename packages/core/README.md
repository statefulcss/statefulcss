# Stateful CSS Core

Reads a stylesheet the way Stateful CSS sees it, and describes it: its components, their parts, the kind of every block, and the role of every variable. The Stylelint plugin and the other Stateful CSS tools read the same model.

Its API is for tools, not for projects: you don't install it directly, it comes with the Stylelint plugin. Before 1.0, the model can change in any minor version.

## What it does

```js
import { defaults } from "@statefulcss/config";
import { analyze } from "@statefulcss/core";
import postcss from "postcss";

const root = postcss.parse(css, { from: "button.css" });
const model = analyze(root, defaults);
```

`analyze(root, settings)` takes a PostCSS root, or the document a `.vue` file parses to, and the project's settings from `@statefulcss/config`. It returns the model.

- **It describes; it doesn't judge.** The model says "this read reaches the Button's own `--s-display`". Whether that's allowed is a rule's question.
- **It reads one file.** What takes several files, such as a part variable declared in another file, is left to the tool that has them all.
- **It never parses, reads a file or changes the tree.** It works on the tree Stylelint or another tool already parsed, in plain CSS, SCSS, or a Vue file's `<style>` blocks.
- **It never throws on input.** Syntax it can't read is listed in `model.unknowns`.

## The model

The model is plain, read-only data. Its facts are in lists, and they point at each other by id: an id is the index into a list, so `model.blocks[declaration.block]` is a declaration's block. There are no cycles. Every PostCSS node sits in a field called `node`, plus the model's own `root`; drop those and the rest is JSON.

| List             | Holds                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `components`     | Each component: how the file names it, its name, its root element, its scopes and its elements |
| `scopes`         | Each `@scope`: its root and its limit as written, and its component                            |
| `elements`       | Everything with its own declarations                                                           |
| `blocks`         | Each place declarations sit: one resolved selector of one rule, in document order              |
| `guards`         | Each `:not()` that lists a blocking state, with the blocks inside it                           |
| `declarations`   | Each declaration, with its block and, for a custom property, its role                          |
| `variables`      | One for each custom property on each element                                                   |
| `reads`          | Each `var()` and each style query                                                              |
| `partReferences` | Each place a selector names a part                                                             |
| `registrations`  | Each `@property` rule                                                                          |
| `docComments`    | Each doc comment, with its tags and its component                                              |
| `atRules`        | At-rules that aren't about elements, such as `@import` and `@keyframes`                        |
| `unknowns`       | What core couldn't read                                                                        |

`model.sheets` lists a file's stylesheets. A Vue file's plain `<style>` blocks are one, its scoped blocks another, and each `<style module>` its own.

### Components and elements

A component is a top-level block for a class or for `[data-component="name"]`, with every rule that starts from it and its `@scope (root) to ([data-component])`. Its name is the `@component` tag of its doc comment, else the attribute's value, else the class in kebab-case.

An element belongs to at most one component: the one whose root block or scope selects it.

| Kind             | Is                                                                               |
| ---------------- | -------------------------------------------------------------------------------- |
| `root`           | A component's root                                                               |
| `part`           | What a component selects by `data-part`. No class is a part                      |
| `slot`           | What a component selects by `data-slot`                                          |
| `pseudo-element` | A pseudo-element, on its host                                                    |
| `content`        | Plain elements and other classes a component selects                             |
| `global`         | A selector with no class and no component attribute: `a`, `:root`, a theme scope |
| `utility`        | A class block in the utilities layer                                             |
| `foreign`        | What `:deep()`, `:slotted()` or `:global()` selects                              |

### Blocks

A rule whose body is empty, or holds only what core can't read such as an `@include`, is a block with no declarations, so its selector is read like any other. A block has its resolved selector, its element, the path from the component root to its subject, and how it reaches the element: directly, inside a scope, or from the root block with a combinator.

Its kind is `own` (no condition), `variant`, `state` with its groups (`context`, `interaction`, `semantic`, `blocking`, `visited`), `supports`, or `unknown`. Each condition of its selector has its own kind and says which compound it's written on. The queries around a block list the style queries they make.

### Variables and reads

A custom property's role comes from its prefix: `token`, `component`, `state`, `part`, `private` or `query`. An unprefixed name is `library` when the component's doc comment lists it in `@sets` or `@reads`, and `none` otherwise.

A variable is one custom property on one element. It has its writes, its default (its first write in a block with no variant or state), the elements it's named for (`--p-title-color` for the title), the reads that reach it, and whether a variant or a state changes it, directly or through what its value reads.

A read reaches the nearest variable of its name inside its component: the element's own, else its host's or the part it's under, else the component root's. Tokens and component variables come from outside, so their reads have no source.

### What core can't read

SCSS interpolation and at-rules, template placeholders, unknown at-rules and selectors the parser rejects are listed in `unknowns`, each with its reason and the elements it sits in. What's inside isn't given to any element. A declaration whose property is readable and whose value isn't (`padding: $gap`) is kept and marked `valueUnread`.

## Helpers

- `roleOf(name)` and `rolePrefixes`: a custom property's role from its name, and the six prefixes.
- `readsOf(value)`: the variables a value reads, fallbacks included.
- `namedFor(name, names)`: the longest of `names` that starts a variable's name.
- `longhandsOf(property)`: every longhand a shorthand sets.
- `overlaps(a, b)`: whether two properties set the same thing, as a shorthand with its longhand does, or a logical property with a physical one.

## License

MIT. See [LICENSE](./LICENSE).

Maintained by [Human Interface Studio](https://humaninterface.studio).
