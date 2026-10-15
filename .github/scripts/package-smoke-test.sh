#!/usr/bin/env bash
# Installs the packed packages into an empty project with npm, the way users do,
# and checks they work on the current Node version.
# Usage: package-smoke-test.sh <directory with packed .tgz files>
set -euo pipefail

packs="$(cd "${1:?usage: package-smoke-test.sh <packs-dir>}" && pwd)"
work="$(mktemp -d)"
cd "$work"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
echo "Node $(node --version), npm $(npm --version)"
npm init -y >/dev/null

# Stylelint plugin (supports the same Node versions as Stylelint 17: >=20.19.0)
npm install --no-audit --no-fund "$packs"/statefulcss-stylelint-plugin-*.tgz stylelint@17
printf ':root { --t-color-primary: red; }\n' >fixture.css
printf '{ "plugins": ["@statefulcss/stylelint-plugin"], "rules": { "statefulcss/no-theme-token-reassign": true } }\n' >.stylelintrc.json

if output="$(npx --no-install stylelint fixture.css 2>&1)"; then
	echo "Expected Stylelint to report fixture.css, but it passed:"
	echo "$output"
	exit 1
fi
if ! grep -q "statefulcss/no-theme-token-reassign" <<<"$output"; then
	echo "Stylelint failed without reporting the plugin rule:"
	echo "$output"
	exit 1
fi
echo "Stylelint plugin: ok"

# CLI (Commander 15 requires >=22.12.0)
if [ "$node_major" -ge 22 ]; then
	npm install --no-audit --no-fund "$packs"/statefulcss-[0-9]*.tgz
	npx --no-install statefulcss --version
	echo "CLI: ok"
else
	echo "CLI: skipped (requires Node >=22.12.0)"
fi
