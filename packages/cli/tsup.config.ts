import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/bin.ts"],
	format: ["esm"],
	dts: false,
	clean: true,
	outDir: "dist",
	target: "node24",
});
