---
"@statefulcss/config": patch
---

`loadConfig(fromPath)` finds and loads the nearest config: `statefulcss.config.json` (comments and trailing commas allowed), `.js`, `.mjs`, `.ts`, or a `"statefulcss"` key in `package.json`. It searches up from the file's folder to the repository root, checks the config against the schema and fills in the defaults; no config means the defaults. Configs are cached per folder and read again when they change. A config that can't be used throws a `ConfigError` with its `kind`, `file` and `key`, including `multiple-files` when a folder has more than one config.
