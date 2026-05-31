import { Command } from "commander";
import { readFileSync } from "node:fs";

type PackageJson = {
	version?: unknown;
};

export function readPackageVersion(): string {
	const packageJsonUrl = new URL("../package.json", import.meta.url);
	const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as PackageJson;

	if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
		return "0.0.0";
	}

	return packageJson.version;
}

export function createProgram(version = readPackageVersion()): Command {
	const program = new Command();

	program
		.name("statefulcss")
		.description("Command line tools for Stateful CSS")
		.version(version, "-v, --version", "Print the current version.")
		.helpOption("-h, --help", "Print command help.")
		.showHelpAfterError();

	return program;
}
