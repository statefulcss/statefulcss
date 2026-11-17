---
"@statefulcss/core": patch
---

`Guard.blocking` lists the entries of `blockingStates` as the settings write them, so a rule can compare it with the settings directly. A guard written `:not(:nth-child(2n + 1))` covers the entry `:nth-child(2n+1)`, which it matches. The guard's condition keeps the text as written.
