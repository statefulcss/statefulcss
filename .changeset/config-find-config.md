---
"@statefulcss/config": patch
---

`findConfig(fromPath)` gives the settings `loadConfig` gives, with the folder they came from: the config file's folder, or, with no config, the repository root (the filesystem root outside a repository). `themeFiles` patterns are matched against a file's path relative to that folder.
