---
"@statefulcss/stylelint-plugin": patch
---

`@statefulcss/stylelint-plugin/rule-names` exports `ruleNames` on its own, so a tool can list the rules without loading Stylelint, the settings or the rules.
