---
"@statefulcss/config": patch
---

The state lists each take one form, and the loader no longer goes past what it can't read.

- Each entry of `blockingStates` and `interactionStates` is one pseudo-class or one attribute selector, such as `:disabled` or `[data-loading]`. Each entry of `stateAttributes` is an attribute name, such as `data-state`. The other form, a compound and a list are errors that name the entry and say what to write: `data-busy` in `blockingStates` gets "Write "[data-busy]"", and `[data-mode="on"]` in `stateAttributes` gets "Write the attribute name "data-mode"". Before, these loaded and never matched. Space around an entry is dropped.
- `data-color-scheme` is the light and dark switch, so `themeAttribute`, `componentAttribute`, `partAttribute` and `slotAttribute` can't use it.
- Only a missing file or folder lets the search go on to the folder above. A folder that can't be listed, or a config whose details can't be read, is an `unreadable` error that names it and keeps the cause. Before, the search went past it and used the settings of a config further up.
- A CommonJS `statefulcss.config.js` or `.ts` that's edited is read again without a restart, as an ESM one already was.
