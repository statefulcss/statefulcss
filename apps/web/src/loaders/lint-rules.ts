import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Loader } from "astro/loaders";

export interface RuleReadme {
	summary: string;
	severity: "error" | "warning";
	/** The severity as the README writes it, with any qualification ("error, and a warning for …"). */
	severityText: string;
	fixable: boolean;
	/** The README after its first three lines, with links to other rules pointing at their pages. */
	body: string;
}

const HEAD =
	/^# (?<name>[a-z-]+)\r?\n\r?\n(?<summary>[^\r\n]+)\r?\n\r?\nSeverity: (?<severityText>(?<severity>error|warning)(?:, [^.\r\n]+)?)\. Fixable: (?<fixable>yes|no)\.\r?\n/;
const RULE_LINK = /\]\(\.\.\/([a-z-]+)\/README\.md(#[^)\s]*)?\)/g;

export function getRulePath(name: string): string {
	return `/docs/lint-rules/${name}/`;
}

/**
 * Reads a rule's README: its `# name` heading, the sentence after it and its `Severity: …. Fixable: ….` line, then
 * the rest. Throws when the README doesn't start that way, so a change to its shape fails the build.
 */
export function parseRuleReadme(source: string, name: string): RuleReadme {
	const match = HEAD.exec(source);
	const head = match?.groups;
	if (!match || !head) {
		throw new Error(
			`The README of ${name} must start with "# ${name}", a one-sentence summary and a "Severity: …. Fixable: …." line.`,
		);
	}
	if (head.name !== name) throw new Error(`The README in ${name}/ is headed "# ${head.name}".`);

	return {
		summary: head.summary ?? "",
		severity: head.severity === "warning" ? "warning" : "error",
		severityText: head.severityText ?? "",
		fixable: head.fixable === "yes",
		body: source
			.slice(match[0].length)
			.replace(RULE_LINK, (_, rule: string, hash = "") => `](${getRulePath(rule)}${hash})`),
	};
}

/** Loads each rule's README from the plugin, in the order given, rendered with the site's Markdown pipeline. */
export function lintRulesLoader({ folder, rules }: { folder: URL; rules: readonly string[] }): Loader {
	return {
		name: "statefulcss:lint-rules",
		async load({ config, generateDigest, logger, parseData, renderMarkdown, store, watcher }) {
			const root = fileURLToPath(config.root);
			const folderPath = fileURLToPath(folder);

			async function sync() {
				store.clear();
				for (const [order, name] of rules.entries()) {
					const file = new URL(`${name}/README.md`, folder);
					const source = await readFile(file, "utf8");
					const { body, ...details } = parseRuleReadme(source, name);
					const filePath = path.relative(root, fileURLToPath(file));
					const data = await parseData({ id: name, data: { title: name, order, ...details }, filePath });

					store.set({
						id: name,
						data,
						body,
						filePath,
						digest: generateDigest(source),
						rendered: await renderMarkdown(body, { fileURL: file }),
					});
				}
			}

			await sync();

			watcher?.add(folderPath);
			watcher?.on("change", (changed) => {
				if (!changed.startsWith(folderPath) || !changed.endsWith("README.md")) return;
				logger.info(`Reloading the lint rules after a change to ${path.relative(root, changed)}`);
				void sync();
			});
		},
	};
}
