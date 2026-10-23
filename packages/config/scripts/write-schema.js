// Writes schema.json, the JSON Schema the package exports, from the built source.
import { writeFile } from "node:fs/promises";

import { jsonSchema } from "../dist/json-schema.js";

await writeFile(new URL("../schema.json", import.meta.url), `${JSON.stringify(jsonSchema, null, "\t")}\n`);
