import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	ConfigError,
	defaults,
	loadConfig,
	nonStatePseudoClasses,
	type Settings,
	type StatefulCSSConfig,
} from "@statefulcss/config";
import { afterEach, describe, expect, it } from "vitest";

import { inEverySyntax } from "../testing/syntaxes.js";
import { classify, vocabularyFrom } from "./classify.js";
import { namesFrom } from "./names.js";
import { walk } from "./walk.js";

// Sources: the shared-settings decision (each state list has one form) and the second audit's 3.1. A spelling
// config accepts must mean the same to core, so both are tested through the config file.

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** The settings a project gets from this config, as the loader reads and checks it. */
async function settingsFrom(config: StatefulCSSConfig): Promise<Settings> {
	const root = await mkdtemp(path.join(tmpdir(), "statefulcss-core-"));
	roots.push(root);
	await mkdir(path.join(root, ".git"));
	await writeFile(path.join(root, "statefulcss.config.json"), JSON.stringify(config));
	return loadConfig(path.join(root, "button.css"));
}

describe("a state list's entry means the same in config and core", () => {
	// Each entry as config accepts it, and a selector that has that state.
	const selectors: [entry: string, selector: string][] = [
		[":disabled", ".button:disabled"],
		[":DISABLED", ".button:disabled"],
		[":disabled", ".button:DISABLED"],
		[":state(loading)", ".button:state(loading)"],
		[":state(loading)", ".button:state( loading )"],
		[":lang(en,fr)", ".button:lang(en , fr)"],
		// `An+B` with and without the space around its sign, in either case
		[":nth-child(2n + 1)", ".button:nth-child(2n + 1)"],
		[":nth-child(2n+1)", ".button:nth-child(2n + 1)"],
		[":nth-child(2n + 1)", ".button:nth-child(2n+1)"],
		[":nth-child( 2N - 1 )", ".button:nth-child(2n-1)"],
		[":nth-last-child(even)", ".button:nth-last-child( EVEN )"],
		[":nth-child(2n+1 of [data-busy], .busy)", ".button:nth-child(2n + 1 of [ data-busy ] , .busy)"],
		["[data-busy]", ".button[data-busy]"],
		["[ data-busy ]", ".button[data-busy]"],
		["[DATA-BUSY]", ".button[data-busy]"],
		["[data-busy]", ".button[ data-busy ]"],
		['[aria-disabled="true"]', '.button[aria-disabled="true"]'],
		["[aria-disabled='true']", '.button[aria-disabled="true"]'],
		["[aria-disabled=true]", '.button[aria-disabled="true"]'],
		['[aria-disabled="true"]', ".button[aria-disabled=true]"],
		['[ aria-disabled = "true" ]', ".button[aria-disabled='true']"],
		['[data-mode="on" i]', '.button[data-mode="on" i]'],
		['[data-label="a ] b, c"]', '.button[data-label="a ] b, c"]'],
		['[data-tags~="busy"]', '.button[data-tags~="busy"]'],
		['[data-tags*="busy"]', ".button[data-tags*=busy]"],
	];

	inEverySyntax("an entry of blockingStates is a blocking state", async ({ parse }) => {
		for (const [entry, selector] of selectors) {
			const settings = await settingsFrom({ blockingStates: [entry] });
			expect([entry, selector, ...groupsOf(parse(`${selector} { color: red; }`), settings)]).toEqual([
				entry,
				selector,
				"blocking",
			]);
		}
	});

	inEverySyntax("an entry of interactionStates is an interaction state", async ({ parse }) => {
		for (const [entry, selector] of selectors) {
			// A state in both lists is blocking, and `:disabled` is in the default one.
			const settings = await settingsFrom({ blockingStates: [], interactionStates: [entry] });
			expect([entry, selector, ...groupsOf(parse(`${selector} { color: red; }`), settings)]).toEqual([
				entry,
				selector,
				"interaction",
			]);
		}
	});

	inEverySyntax(
		"an entry of stateAttributes makes every value of the attribute a state",
		async ({ parse }) => {
			const css = '.button[data-mode="on"] { color: red; } .button[DATA-MODE="off"] { color: blue; }';
			expect(kindsOf(parse(css), await settingsFrom({}))).toEqual(["variant", "variant"]);
			const settings = await settingsFrom({ stateAttributes: ["data-mode"] });
			expect(kindsOf(parse(css), settings)).toEqual(["state", "state"]);
		},
	);

	inEverySyntax("arguments that differ in more than spacing are another state", ({ parse }) => {
		const settings = { ...defaults, blockingStates: [":nth-child(2n+1)", ":state(loading)"] };
		const css = ".button:nth-child(2n+2) { color: red; } .button:state(Loading) { color: red; }";
		expect(groupsOf(parse(css), settings)).not.toContain("blocking");
	});

	// Config owns these names and core takes its lists from them. Listed in spite of config, none is compared.
	inEverySyntax(
		"a pseudo-class that's never a state is never compared with a state list",
		async ({ parse }) => {
			const { matchesAny, holders, identity, wrappers, pseudoElements } = nonStatePseudoClasses;
			const written = [
				...[...matchesAny, ...holders, ...wrappers].map((name) => `${name}([data-busy])`),
				...identity,
				...pseudoElements,
			];
			for (const entry of written) {
				const settings = { ...defaults, blockingStates: [entry], interactionStates: [entry] };
				const groups = groupsOf(parse(`.button${entry} { color: red; }`), settings);
				expect([entry, ...groups]).not.toContain("blocking");
				expect([entry, ...groups]).not.toContain("interaction");
				await expect(settingsFrom({ blockingStates: [entry] })).rejects.toMatchObject({
					kind: "invalid-value",
					key: "blockingStates[0]",
				});
			}
		},
	);

	// The audit's probes: these loaded, and core read each as something else.
	it.each<[key: string, config: StatefulCSSConfig]>([
		["blockingStates[0]", { blockingStates: ["data-busy"] }],
		["interactionStates[0]", { interactionStates: ["data-drag"] }],
		["stateAttributes[0]", { stateAttributes: ['[data-mode="on"]'] }],
		["blockingStates[0]", { blockingStates: [":disabled[data-busy]"] }],
		["interactionStates[0]", { interactionStates: [":hover:active"] }],
		["stateAttributes[0]", { stateAttributes: ["data-state[data-busy]"] }],
		// Core reads these as the part and the slot, whatever a state list says.
		["blockingStates[0]", { blockingStates: ['[data-part="spinner"]'] }],
		["interactionStates[0]", { interactionStates: ["[data-slot]"] }],
	])("the other form never reaches core: %s in %j", async (key, config) => {
		const error = await settingsFrom(config).catch((error: unknown) => error);
		expect(error).toBeInstanceOf(ConfigError);
		expect(error).toMatchObject({ kind: "invalid-value", key });
	});
});

type Sheet = Parameters<typeof walk>[0];

function classified(root: Sheet, settings: Settings) {
	const vocabulary = vocabularyFrom(settings, namesFrom(settings));
	return walk(root).blocks.map((block) => classify(block, vocabulary));
}

const kindsOf = (root: Sheet, settings: Settings) => classified(root, settings).map((block) => block.kind);
const groupsOf = (root: Sheet, settings: Settings) =>
	classified(root, settings).flatMap((block) => block.groups);
