#!/usr/bin/env bash
# Installs the packed packages into an empty project with npm, the way users do,
# and checks they work on the current Node version.
# Usage: package-smoke-test.sh <directory with packed .tgz files>
set -euo pipefail

packs="$(cd "${1:?usage: package-smoke-test.sh <packs-dir>}" && pwd)"
work="$(mktemp -d)"
cd "$work"

echo "Node $(node --version), npm $(npm --version)"
npm init -y >/dev/null

# Exits 0 when the current Node is at least the given version (major.minor or major.minor.patch).
node_at_least() {
	node -e '
		const have = process.versions.node.split(".").map(Number);
		const want = process.argv[1].split(".").map(Number);
		for (let i = 0; i < 3; i++) {
			const [a, b] = [have[i] ?? 0, want[i] ?? 0];
			if (a !== b) process.exit(a > b ? 0 : 1);
		}
		process.exit(0);
	' "$1"
}

check_plugin() {
	local version
	version="$(npx --no-install stylelint --version)"
	if ! output="$(npx --no-install stylelint fixture.css 2>&1)"; then
		echo "Expected Stylelint $version to pass fixture.css with the recommended config, but it failed:"
		echo "$output"
		exit 1
	fi
	echo "Stylelint plugin with Stylelint $version: ok"
}

# Stylelint plugin, with core and config (>=22.18.0, the first Node 22 that strips types from .ts configs).
# All three install together: the plugin's tarball depends on the exact versions of the other two.
if node_at_least 22.18; then
	npm install --no-audit --no-fund \
		"$packs"/statefulcss-config-*.tgz \
		"$packs"/statefulcss-core-*.tgz \
		"$packs"/statefulcss-stylelint-plugin-*.tgz \
		stylelint@17

	node --input-type=module -e '
		await import("@statefulcss/config");
		await import("@statefulcss/core");
		import.meta.resolve("@statefulcss/config/schema.json");
	'
	echo "Config and core: ok"

	# The config as users write it: a .ts config that imports defineConfig, then configs that are wrong on purpose.
	# Each is in its own folder, the nearest config for the file there.
	mkdir config-ts config-commonjs config-broken
	printf '{ "type": "module" }\n' >config-ts/package.json
	printf 'import { defineConfig } from "@statefulcss/config";\n\nexport default defineConfig({ strict: true });\n' \
		>config-ts/statefulcss.config.ts
	printf '{ "type": "commonjs" }\n' >config-commonjs/package.json # what npm 11's npm init writes
	cp config-ts/statefulcss.config.ts config-commonjs/
	printf '{ "blockingState": [":disabled"] }\n' >config-broken/statefulcss.config.json
	node --input-type=module -e '
		import { ConfigError, loadConfig } from "@statefulcss/config";

		const settings = await loadConfig("config-ts/fixture.css");
		if (settings.strict !== true) {
			throw new Error(`Expected strict: true from config-ts/statefulcss.config.ts, got ${JSON.stringify(settings)}`);
		}
		console.log("A .ts config with defineConfig: ok");

		async function expectError(file, kind, text) {
			try {
				await loadConfig(file);
			} catch (error) {
				if (error instanceof ConfigError && error.kind === kind && error.message.includes(text)) {
					console.log(`The ${kind} error: ok\n  ${error.message}`);
					return;
				}
				throw error;
			}
			throw new Error(`Expected a ${kind} error for ${file}`);
		}
		await expectError("config-broken/fixture.css", "unknown-key", "Did you mean \"blockingStates\"?");
		await expectError("config-commonjs/fixture.css", "unreadable", "set \"type\": \"module\" in package.json");
	'

	printf '.button {\n\tcolor: red;\n}\n' >fixture.css
	printf '{ "extends": ["@statefulcss/stylelint-plugin/recommended"] }\n' >.stylelintrc.json

	# The latest Stylelint 17, then the lowest version the plugin's peer range allows.
	check_plugin
	npm install --no-audit --no-fund stylelint@17.0.0
	check_plugin

	# The latest Stylelint 18, on the Node versions it supports (^22.22.2 || ^24.15.0 || >=26).
	if node_at_least 24.15.0 || { node_at_least 22.22.2 && ! node_at_least 23.0.0; }; then
		npm install --no-audit --no-fund stylelint@18
		check_plugin
	else
		echo "Stylelint plugin with Stylelint 18: skipped (requires Node ^22.22.2, ^24.15.0 or >=26)"
	fi
else
	echo "Config, core and the Stylelint plugin: skipped (require Node >=22.18.0)"
fi

# CLI (Commander 15 requires >=22.12.0, the lowest Node in the matrix)
npm install --no-audit --no-fund "$packs"/statefulcss-[0-9]*.tgz
npx --no-install statefulcss --version
echo "CLI: ok"
