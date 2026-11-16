---
"@statefulcss/core": patch
---

A rule whose body is empty, or holds only what core can't read such as an `@include`, is now a block with no declarations. Its selector is read like any other: its path, its conditions and how it writes the scope's root. Such a block doesn't split the declarations of the rule around it.
