# @statefulcss/config

## 0.0.4

### Patch Changes

- 16ee6b8: Define every setting in one schema: `themeAttribute`, `themeFiles`, `baseTheme`, `blockingStates`, `interactionStates`, `stateAttributes`, `layers`, `strict` and `ignoreLayers`, each with its type, default and a one-line description. `StatefulCSSConfig`, `Settings`, `defaults` and `schema.json` come from it, and `schema.json` gives editors each setting's description, default and an example.

## 0.0.3

### Patch Changes

- 06c968f: Require Node.js 22.18.0 or newer (`>=22.18.0`), the first Node 22 that strips TypeScript types natively, so a `statefulcss.config.ts` loads without a TypeScript loader. Node 20 has reached end of life.

## 0.0.2

### Patch Changes

- ef8352b: First release through CI, published with provenance. The packages are still in development and not ready for use.
