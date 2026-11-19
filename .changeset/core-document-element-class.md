---
"@statefulcss/core": patch
---

A class on the document element (`html.dark`, `:root.dark`) is a condition of the page, read the way `html[data-color-scheme="dark"]` is, not a component named after the class. The element is the global `html` or `:root`, and the class is one of its conditions; before `.card`, it's the Card's context. A class written on its own (`.dark .card`) is still read as a component.
