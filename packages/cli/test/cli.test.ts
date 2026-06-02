import { describe, expect, it } from "vitest";
import { createProgram } from "../src/index.js";

describe("statefulcss CLI", () => {
	it("prints help", () => {
		const program = createProgram("1.2.3");

		expect(program.helpInformation()).toContain("Usage: statefulcss [options]");
		expect(program.helpInformation()).toContain("--help");
		expect(program.helpInformation()).toContain("--version");
	});

	it("prints the package version", () => {
		const program = createProgram("1.2.3");
		let output = "";

		program.exitOverride();
		program.configureOutput({
			writeOut: (value) => {
				output += value;
			},
		});

		try {
			program.parse(["node", "statefulcss", "--version"]);
		} catch (error) {
			expect(error).toMatchObject({ code: "commander.version" });
		}

		expect(output.trim()).toBe("1.2.3");
	});
});
