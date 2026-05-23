import type { APIRoute, GetStaticPaths } from "astro";

import { getOgImageDefinitions, type OgImageDefinition } from "@og/pages";
import { renderOgImage } from "@og/render";

interface Props {
	definition: OgImageDefinition;
}

export const getStaticPaths: GetStaticPaths = async () => {
	const definitions = await getOgImageDefinitions();

	return definitions.map((definition) => ({
		params: {
			slug: definition.imagePath.replace(/^\/og\//, "").replace(/\.png$/, ""),
		},
		props: {
			definition,
		},
	}));
};

export const GET: APIRoute<Props> = async ({ props }) => {
	const png = await renderOgImage({
		title: props.definition.title,
		variant: props.definition.variant,
	});
	const body = new Uint8Array(png).buffer;

	return new Response(body, {
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
};
