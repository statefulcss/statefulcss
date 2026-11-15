---
"@statefulcss/config": patch
---

The state lists each take one form, and the loader no longer goes past what it can't read.

- Each entry of `blockingStates` and `interactionStates` is one pseudo-class or one attribute selector, such as `:disabled` or `[data-loading]`. Each entry of `stateAttributes` is an attribute name in lowercase, such as `data-state`. The other form, a compound, a list and space around an entry are errors that name the entry and say what to write: `data-busy` in `blockingStates` gets "Write "[data-busy]"", and `[data-mode="on"]` in `stateAttributes` gets "Write the attribute name "data-mode"". Before, these loaded and never matched.
- A state list can't ask about the attribute a setting gives to components, parts, slots or themes: `[data-part="spinner"]` in `blockingStates` and `data-part` in `stateAttributes` say what an element is, not its state. Nor can it ask about `data-color-scheme`, the light and dark switch.
- `schema.json` has the outline of each list's entries, so an editor marks an entry of the other form. The loader stays the full check.
- `data-color-scheme` is the light and dark switch, so `themeAttribute`, `componentAttribute`, `partAttribute` and `slotAttribute` can't use it.
- Only a missing file or folder lets the search go on to the folder above. A config, `package.json` or folder whose details can't be read is an `unreadable` error that names it and keeps the cause. Before, the search went past it and used the settings of a config further up. A folder is asked for each config by name and never listed, so a folder on the way up that can't be listed, such as `/home` on a shared machine, doesn't stop the search.
- A CommonJS `statefulcss.config.js` or `.ts` that's edited is read again without a restart, as an ESM one already was.
- `nonStatePseudoClasses` is exported: the pseudo-classes that are never a state, such as `:not()` and `:root`. Config refuses them in a state list, and core takes its own lists from it.
