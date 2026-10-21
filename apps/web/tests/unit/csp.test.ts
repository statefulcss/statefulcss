import { describe, expect, it } from "vitest";

import { addPolicyToHeaders, buildPolicy } from "../../integrations/csp";

const directive = (policy: string, name: string) =>
	policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

describe("buildPolicy", () => {
	it("hashes inline scripts and styles but skips JSON-LD and external scripts", () => {
		const policy = buildPolicy([
			`<script type="application/ld+json">{"@type":"WebSite"}</script>
			<script type="module" src="/_astro/app.js"></script>
			<script>console.log("inline")</script>
			<style>body{margin:0}</style>`,
		]);

		expect(directive(policy, "script-src").match(/'sha256-/g)).toHaveLength(1);
		expect(directive(policy, "style-src").match(/'sha256-/g)).toHaveLength(1);
	});

	it("allows the analytics origins only where they are needed", () => {
		const policy = buildPolicy([], {
			scriptOrigins: ["https://static.cloudflareinsights.com"],
			connectOrigins: ["https://cloudflareinsights.com"],
		});

		expect(directive(policy, "script-src")).toContain("https://static.cloudflareinsights.com");
		expect(directive(policy, "connect-src")).toContain("https://cloudflareinsights.com");
		expect(directive(policy, "connect-src")).not.toContain("static.cloudflareinsights.com");
	});

	it("never allows inline scripts wholesale", () => {
		expect(directive(buildPolicy([]), "script-src")).not.toContain("'unsafe-inline'");
	});
});

describe("addPolicyToHeaders", () => {
	it("adds the policy to the existing /* rule instead of a second one", () => {
		const headers = "/*\n  X-Frame-Options: DENY\n\n/_astro/*\n  Cache-Control: immutable\n";
		const result = addPolicyToHeaders(headers, "default-src 'self'");

		expect(result.match(/^\/\*$/gm)).toHaveLength(1);
		expect(result).toContain(
			"/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'\n\n/_astro/*",
		);
	});

	it("creates a /* rule when there is none", () => {
		expect(addPolicyToHeaders("", "default-src 'self'")).toBe(
			"\n\n/*\n  Content-Security-Policy: default-src 'self'\n",
		);
	});
});
