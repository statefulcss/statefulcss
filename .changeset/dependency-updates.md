---
"@statefulcss/core": patch
"@statefulcss/stylelint-plugin": patch
---

Core depends on `postcss-selector-parser` `^7.2.1`, and the plugin on `stylelint-config-recommended` `^19.1.0`. The plugin works with Stylelint 18.1, which runs the rules again on the fixed code with `--fix` and reports where the fixed code has each problem.
