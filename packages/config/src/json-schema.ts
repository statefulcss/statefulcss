import * as z from "zod";

import { configSchema } from "./schema.js";

/**
 * The JSON Schema for `statefulcss.config.json`, generated from the config schema and written to `schema.json` at
 * build time. It describes what a file may contain, so settings with a default aren't required.
 */
export const jsonSchema = z.toJSONSchema(configSchema, { io: "input" });
