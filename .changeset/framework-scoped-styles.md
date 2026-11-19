---
"@statefulcss/core": patch
"@statefulcss/stylelint-plugin": patch
---

Astro's and Svelte's scoped `<style>` blocks. Core reads an `.astro` file's plain `<style>` blocks as one scoped sheet, and its `is:global` and `is:inline` blocks as one plain sheet. `Sheet.scopesLimits` says whether a sheet's build adds the file's scope to `@scope` limits, which only Astro's scoped sheet does. `Scope.limitIsGlobalComponents` says whether a limit is `:global([data-component])`, and `Scope.sheet` names its sheet. `parts-in-scope` checks a limit as it will ship: `to (:global([data-component]))` in an Astro `<style>`, and `to ([data-component])` everywhere else. `recommended` accepts `:global()` in `.astro` and `.svelte` files.
