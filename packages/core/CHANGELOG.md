# @statefulcss/core

## 0.1.0

### Patch Changes

- 71d47a8: A rule whose body is empty, or holds only what core can't read such as an `@include`, is now a block with no declarations. Its selector is read like any other: its path, its conditions and how it writes the scope's root. Such a block doesn't split the declarations of the rule around it.
- 8f717fb: A class on the document element (`html.dark`, `:root.dark`) is a condition of the page, read the way `html[data-color-scheme="dark"]` is, not a component named after the class. The element is the global `html` or `:root`, and the class is one of its conditions; before `.card`, it's the Card's context. A class written on its own (`.dark .card`) is still read as a component.
- 1b6b6b6: `analyze(root, settings)` reads a stylesheet into the Stateful CSS model, for the parts model. A component is a top-level block for a class or for `[data-component="name"]`, with its `@scope (root) to ([data-component])` and its doc comment; its elements are its root, its parts (`data-part`), its slots (`data-slot`), pseudo-elements and content. No class is ever a part, a class in the utilities layer is a utility, and a selector with no class and no component attribute is a global element, with theme scopes and `[data-color-scheme]` selectors marked. Every block has its resolved selector, its element, the path from the component root, its conditions and its kind: the element's own block, a variant, a state with its groups (context, interaction, semantic, blocking), or `@supports`. The guard around interaction states is read with the blocking states it lists, `:has()` with the part it names, and `@container style()` with the variable it asks about. Every declaration has its role (token, component variable, state variable, part variable, private, query variable, or a library variable the doc comment names), and every variable has its writes, its default, the part it's named for, the reads that reach it and whether a variant or a state changes it. Every place a selector names a part says where it is: inside the component's scope, on a placement path into a slot, inside `:has()` on the root, or outside. The model is plain, read-only data that points by id, so it's JSON once its PostCSS nodes are dropped. Syntax core can't read is recorded in `unknowns` with the elements it sits in, never thrown on; a declaration whose value can't be read is kept and marked. Works the same on plain CSS, SCSS and Vue files. `roleOf`, `rolePrefixes`, `readsOf`, `namedFor`, `longhandsOf` and `overlaps` are exported for tools.
- 928e671: `Guard.blocking` lists the entries of `blockingStates` as the settings write them, so a rule can compare it with the settings directly. A guard written `:not(:nth-child(2n + 1))` covers the entry `:nth-child(2n+1)`, which it matches. The guard's condition keeps the text as written.
- ff8fd59: A block inside a scope says where it writes the scope's root: `Block.scopeRootAt` is the position of the written `:scope` or `&`, in the block's own rule or in the rule around it that wrote it, so a tool can point at it or rewrite it.
- 806573d: A value of an attribute that the same compound writes as a state is a condition of that state, not a variant. In `[hidden]:where(:not([hidden="until-found" i]))`, the `:not()` says which form of the hidden state it is, so the block is one semantic state. Written on its own, or on another element, `[hidden="until-found"]` is still a variant.
- 957e130: Astro's and Svelte's scoped `<style>` blocks. Core reads an `.astro` file's plain `<style>` blocks as one scoped sheet, and its `is:global` and `is:inline` blocks as one plain sheet. `Sheet.scopesLimits` says whether a sheet's build adds the file's scope to `@scope` limits, which only Astro's scoped sheet does. `Scope.limitIsGlobalComponents` says whether a limit is `:global([data-component])`, and `Scope.sheet` names its sheet. `parts-in-scope` checks a limit as it will ship: `to (:global([data-component]))` in an Astro `<style>`, and `to ([data-component])` everywhere else. `recommended` accepts `:global()` in `.astro` and `.svelte` files.
- Updated dependencies [5156755]
- Updated dependencies [cc56f34]
- Updated dependencies [35dca89]
- Updated dependencies [94d8731]
- Updated dependencies [1b6b6b6]
  - @statefulcss/config@0.1.0

## 0.0.4

### Patch Changes

- Updated dependencies [16ee6b8]
  - @statefulcss/config@0.0.4

## 0.0.3

### Patch Changes

- 06c968f: Require Node.js 22.18.0 or newer (`>=22.18.0`), the first Node 22 that strips TypeScript types natively, so a `statefulcss.config.ts` loads without a TypeScript loader. Node 20 has reached end of life.
- Updated dependencies [06c968f]
  - @statefulcss/config@0.0.3

## 0.0.2

### Patch Changes

- ef8352b: First release through CI, published with provenance. The packages are still in development and not ready for use.
- Updated dependencies [ef8352b]
  - @statefulcss/config@0.0.2
