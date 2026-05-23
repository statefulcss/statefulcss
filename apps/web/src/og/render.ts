import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg, initWasm } from "@resvg/resvg-wasm";
import satori from "satori";

import { ogImageHeight, ogImageWidth, renderOgTemplate, type OgImageTemplateProps } from "./templates";

const switzerRegularFontPath = resolve(process.cwd(), "src/assets/fonts/Switzer-Regular.otf");
const switzerSemiboldFontPath = resolve(process.cwd(), "src/assets/fonts/Switzer-Semibold.otf");

let fontsPromise: Promise<Awaited<Parameters<typeof satori>[1]>["fonts"]> | undefined;
let wasmPromise: Promise<void> | undefined;

function getFonts() {
	fontsPromise ??= Promise.all([readFile(switzerRegularFontPath), readFile(switzerSemiboldFontPath)]).then(
		([switzerRegular, switzerSemibold]) => [
			{
				name: "Switzer",
				data: switzerRegular,
				weight: 400,
				style: "normal",
			},
			{
				name: "Switzer",
				data: switzerSemibold,
				weight: 600,
				style: "normal",
			},
		],
	);

	return fontsPromise;
}

async function ensureWasm() {
	if (!wasmPromise) {
		const wasmUrl = import.meta.resolve("@resvg/resvg-wasm/index_bg.wasm");
		const wasm = await readFile(fileURLToPath(wasmUrl));
		wasmPromise = initWasm(wasm);
	}

	return wasmPromise;
}

export async function renderOgSvg(props: OgImageTemplateProps): Promise<string> {
	return satori(
		renderOgTemplate(props) as Parameters<typeof satori>[0],
		{
			width: ogImageWidth,
			height: ogImageHeight,
			fonts: await getFonts(),
		} as Parameters<typeof satori>[1],
	);
}

export async function renderOgImage(props: OgImageTemplateProps): Promise<Uint8Array> {
	await ensureWasm();

	const svg = await renderOgSvg(props);
	const resvg = new Resvg(svg, {
		fitTo: {
			mode: "width",
			value: ogImageWidth,
		},
		font: {
			loadSystemFonts: false,
		},
	});
	const image = resvg.render();

	try {
		return image.asPng();
	} finally {
		image.free();
		resvg.free();
	}
}
