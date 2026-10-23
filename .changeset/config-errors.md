---
"@statefulcss/config": patch
---

Every config error now says what's wrong and how to fix it. An unknown key suggests the setting it most likely meant ("Did you mean "blockingStates"?") or lists the settings. A wrong value says what the setting must be, with an example, and what it is now. An empty JSON file, a missing default export, and a `.js` or `.ts` config that uses `import` in a CommonJS package each get their own fix.
