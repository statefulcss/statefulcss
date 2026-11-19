# Stateful CSS Config

Finds, loads and checks `statefulcss.config.json`, the settings file the Stateful CSS tools share.

Its API is for tools, not for projects: you don't install it directly, it comes with the Stylelint plugin. Before 1.0, its API can change in any minor version.

## The settings file

A project writes its settings once, in the nearest of `statefulcss.config.json` (comments and trailing commas allowed), `.js`, `.mjs`, `.ts`, or a `"statefulcss"` key in `package.json`. Every setting is optional; with no file, every setting has its default. The [Stylelint plugin's README](https://github.com/statefulcss/statefulcss/blob/main/packages/stylelint-plugin/README.md#settings) lists them.

```json
{
	"$schema": "./node_modules/@statefulcss/config/schema.json",
	"blockingStates": [":disabled", "[aria-disabled=\"true\"]", "[data-loading]", "[inert]"]
}
```

`schema.json` lets an editor complete and check the file. A `.js` or `.ts` config gets its types from `defineConfig`:

```js
// statefulcss.config.mjs
import { defineConfig } from "@statefulcss/config";

export default defineConfig({ stateAttributes: ["data-state"] });
```

## What it does

```js
import { findConfig, loadConfig } from "@statefulcss/config";

const settings = await loadConfig("src/components/button.css");
const { settings: same, folder } = await findConfig("src/components/button.css");
```

- `loadConfig(fromPath)` searches up from the file's folder to the repository root (the folder with `.git`), or the filesystem root outside a repository, and loads the nearest config. It checks it and fills in the defaults. The settings it returns are frozen.
- `findConfig(fromPath)` gives the same settings, with the config's folder: a file's path relative to it is what `themeFiles` matches. With no config, the folder is where the search stopped.
- Configs are cached per folder and read again when they change, a `.js` or `.ts` one included.
- `defaults` is the settings with no config.
- A config that can't be used throws a `ConfigError`. Its message says what's wrong and how to fix it, and its `kind` says which problem it is: `unreadable`, `multiple-files`, `unknown-key` or `invalid-value`, with the `file` and the `key`.
- `nonStatePseudoClasses` lists the pseudo-classes that are never a state, such as `:not()` and `:root`, which a state list refuses.

## License

MIT. See [LICENSE](./LICENSE).

Maintained by [Human Interface Studio](https://humaninterface.studio).
