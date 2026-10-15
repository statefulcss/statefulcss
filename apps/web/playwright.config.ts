/* eslint-disable turbo/no-undeclared-env-vars -- Playwright runs outside turbo; CI and PLAYWRIGHT_PORT only configure the test runner. */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4322);

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	workers: process.env.CI ? 2 : undefined,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		trace: "on-first-retry",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	// Serve the built site through Wrangler, like Cloudflare does, so `_headers` and 404 handling apply.
	// Build first: `pnpm build`.
	webServer: {
		command: `wrangler dev --env="" --ip 127.0.0.1 --port ${PORT} --show-interactive-dev-session=false`,
		url: `http://127.0.0.1:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
		env: { WRANGLER_SEND_METRICS: "false" },
	},
});
