---
"@statefulcss/core": patch
---

A value of an attribute that the same compound writes as a state is a condition of that state, not a variant. In `[hidden]:where(:not([hidden="until-found" i]))`, the `:not()` says which form of the hidden state it is, so the block is one semantic state. Written on its own, or on another element, `[hidden="until-found"]` is still a variant.
