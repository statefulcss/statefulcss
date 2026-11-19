---
"@statefulcss/core": patch
---

A block inside a scope says where it writes the scope's root: `Block.scopeRootAt` is the position of the written `:scope` or `&`, in the block's own rule or in the rule around it that wrote it, so a tool can point at it or rewrite it.
