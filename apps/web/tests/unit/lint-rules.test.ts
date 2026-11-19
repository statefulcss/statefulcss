import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseRuleReadme } from "../../src/loaders/lint-rules";

const rulesFolder = new URL("../../../../packages/stylelint-plugin/src/rules/", import.meta.url);
const readme = (body = "## Checks\n\nText.\n") =>
	`# bind-once\n\nEach property is declared once per element.\n\nSeverity: error. Fixable: no.\n\n${body}`;

describe("rule READMEs", () => {
	it("reads the summary, severity and fixable line, and keeps the rest as the body", () => {
		expect(parseRuleReadme(readme(), "bind-once")).toEqual({
			summary: "Each property is declared once per element.",
			severity: "error",
			severityText: "error",
			fixable: false,
			body: "\n## Checks\n\nText.\n",
		});
	});

	it("keeps a qualified severity's text", () => {
		const source = readme().replace(
			"Severity: error.",
			"Severity: error, and a warning for a variable no part reads.",
		);

		expect(parseRuleReadme(source, "bind-once")).toMatchObject({
			severity: "error",
			severityText: "error, and a warning for a variable no part reads",
		});
	});

	it("points links to another rule's README at its page", () => {
		const { body } = parseRuleReadme(
			readme(
				"See [`theme-tokens`](../theme-tokens/README.md#checks) and [the guide](https://example.com/).\n",
			),
			"bind-once",
		);

		expect(body).toContain("[`theme-tokens`](/docs/lint-rules/theme-tokens/#checks)");
		expect(body).toContain("[the guide](https://example.com/)");
	});

	it("fails on a README that doesn't start with the name, a summary and the severity line", () => {
		expect(() => parseRuleReadme("# bind-once\n\nNo severity line.\n", "bind-once")).toThrow(
			/must start with/,
		);
		expect(() => parseRuleReadme(readme(), "theme-tokens")).toThrow(/headed "# bind-once"/);
	});

	it("reads every README the plugin ships", () => {
		const rules = readdirSync(rulesFolder, { withFileTypes: true }).filter((entry) => entry.isDirectory());

		expect(rules.length).toBeGreaterThan(0);
		for (const { name } of rules) {
			const source = readFileSync(new URL(`${name}/README.md`, rulesFolder), "utf8");
			expect(() => parseRuleReadme(source, name)).not.toThrow();
		}
	});
});
