# @statefulcss/config

## 0.0.5

### Patch Changes

- 5156755: Every config error now says what's wrong and how to fix it. An unknown key suggests the setting it most likely meant ("Did you mean "blockingStates"?") or lists the settings. A wrong value says what the setting must be, with an example, and what it is now. An empty JSON file, a missing default export, and a `.js` or `.ts` config that uses `import` in a CommonJS package each get their own fix.
- 35dca89: `loadConfig(fromPath)` finds and loads the nearest config: `statefulcss.config.json` (comments and trailing commas allowed), `.js`, `.mjs`, `.ts`, or a `"statefulcss"` key in `package.json`. It searches up from the file's folder to the repository root, checks the config against the schema and fills in the defaults; no config means the defaults. Configs are cached per folder and read again when they change. A config that can't be used throws a `ConfigError` with its `kind`, `file` and `key`, including `multiple-files` when a folder has more than one config.

## 0.0.4

### Patch Changes

- 16ee6b8: Define every setting in one schema: `themeAttribute`, `themeFiles`, `baseTheme`, `blockingStates`, `interactionStates`, `stateAttributes`, `layers`, `strict` and `ignoreLayers`, each with its type, default and a one-line description. `StatefulCSSConfig`, `Settings`, `defaults` and `schema.json` come from it, and `schema.json` gives editors each setting's description, default and an example.

## 0.0.3

### Patch Changes

- 06c968f: Require Node.js 22.18.0 or newer (`>=22.18.0`), the first Node 22 that strips TypeScript types natively, so a `statefulcss.config.ts` loads without a TypeScript loader. Node 20 has reached end of life.

## 0.0.2

### Patch Changes

- ef8352b: First release through CI, published with provenance. The packages are still in development and not ready for use.
