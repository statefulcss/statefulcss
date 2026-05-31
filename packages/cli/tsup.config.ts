import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/bin.ts", "src/index.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	outDir: "dist",
	target: "node24",
});
