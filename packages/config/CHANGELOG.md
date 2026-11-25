# @statefulcss/config

## 0.1.0

### Patch Changes

- 5156755: Every config error now says what's wrong and how to fix it. An unknown key suggests the setting it most likely meant ("Did you mean "blockingStates"?") or lists the settings. A wrong value says what the setting must be, with an example, and what it is now. An empty JSON file, a missing default export, and a `.js` or `.ts` config that uses `import` in a CommonJS package each get their own fix.
- cc56f34: `findConfig(fromPath)` gives the settings `loadConfig` gives, with the folder they came from: the config file's folder, or, with no config, the repository root (the filesystem root outside a repository). `themeFiles` patterns are matched against a file's path relative to that folder.
- 35dca89: `loadConfig(fromPath)` finds and loads the nearest config: `statefulcss.config.json` (comments and trailing commas allowed), `.js`, `.mjs`, `.ts`, or a `"statefulcss"` key in `package.json`. It searches up from the file's folder to the repository root, checks the config against the schema and fills in the defaults; no config means the defaults. Configs are cached per folder and read again when they change. A config that can't be used throws a `ConfigError` with its `kind`, `file` and `key`, including `multiple-files` when a folder has more than one config.
- 94d8731: `componentAttribute`, `partAttribute` and `slotAttribute` let a project name the attributes for component roots, parts and slots. The `blockingStates` description now explains that blocking states set only their own look and a guard keeps interaction states off blocked elements.
- 1b6b6b6: The state lists each take one form, and the loader no longer goes past what it can't read.

  - Each entry of `blockingStates` and `interactionStates` is one pseudo-class or one attribute selector, such as `:disabled` or `[data-loading]`. Each entry of `stateAttributes` is an attribute name in lowercase, such as `data-state`. The other form, a compound, a list and space around an entry are errors that name the entry and say what to write: `data-busy` in `blockingStates` gets "Write "[data-busy]"", and `[data-mode="on"]` in `stateAttributes` gets "Write the attribute name "data-mode"". Before, these loaded and never matched.
  - A state list can't ask about the attribute a setting gives to components, parts, slots or themes: `[data-part="spinner"]` in `blockingStates` and `data-part` in `stateAttributes` say what an element is, not its state. Nor can it ask about `data-color-scheme`, the light and dark switch.
  - `schema.json` has the outline of each list's entries, so an editor marks an entry of the other form. The loader stays the full check.
  - `data-color-scheme` is the light and dark switch, so `themeAttribute`, `componentAttribute`, `partAttribute` and `slotAttribute` can't use it.
  - Only a missing file or folder lets the search go on to the folder above. A config, `package.json` or folder whose details can't be read is an `unreadable` error that names it and keeps the cause. Before, the search went past it and used the settings of a config further up. A folder is asked for each config by name and never listed, so a folder on the way up that can't be listed, such as `/home` on a shared machine, doesn't stop the search.
  - A CommonJS `statefulcss.config.js` or `.ts` that's edited is read again without a restart, as an ESM one already was.
  - `nonStatePseudoClasses` is exported: the pseudo-classes that are never a state, such as `:not()` and `:root`. Config refuses them in a state list, and core takes its own lists from it.

## 0.0.4

### Patch Changes

- 16ee6b8: Define every setting in one schema: `themeAttribute`, `themeFiles`, `baseTheme`, `blockingStates`, `interactionStates`, `stateAttributes`, `layers`, `strict` and `ignoreLayers`, each with its type, default and a one-line description. `StatefulCSSConfig`, `Settings`, `defaults` and `schema.json` come from it, and `schema.json` gives editors each setting's description, default and an example.

## 0.0.3

### Patch Changes

- 06c968f: Require Node.js 22.18.0 or newer (`>=22.18.0`), the first Node 22 that strips TypeScript types natively, so a `statefulcss.config.ts` loads without a TypeScript loader. Node 20 has reached end of life.

## 0.0.2

### Patch Changes

- ef8352b: First release through CI, published with provenance. The packages are still in development and not ready for use.
