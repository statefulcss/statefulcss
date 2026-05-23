import { siteConfig } from "@config/site";

export type OgImageVariant = "content" | "default";

export const ogImageHeight = 630;
export const ogImageWidth = 1200;

export interface OgImageTemplateProps {
	title: string;
	variant: OgImageVariant;
}

type ElementProps = Record<string, unknown> & {
	children?: ElementNode | ElementNode[];
};
type ElementNode = string | number | { type: string; props: ElementProps };

function h(type: string, props: ElementProps, ...children: ElementNode[]): ElementNode {
	return {
		type,
		props: {
			...props,
			children: children.length <= 1 ? children[0] : children,
		},
	};
}

const colors = {
	background: "hsl(0 0% 99%)",
	foreground: "hsl(0 0% 5%)",
};

const rootStyle = {
	width: `${ogImageWidth}px`,
	height: `${ogImageHeight}px`,
	display: "flex",
	flexDirection: "column",
	background: colors.background,
	color: colors.foreground,
	fontFamily: "Switzer",
	padding: "72px",
	position: "relative",
	overflow: "hidden",
};

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path fill="${colors.foreground}" d="M67 53.54c0-.86.73-1.54 1.59-1.5C84.42 52.87 97 65.96 97 82s-12.58 29.13-28.41 29.96c-.86.04-1.59-.63-1.59-1.5zM61 74.46c0 .86-.73 1.54-1.59 1.5C43.58 75.13 31 62.04 31 46s12.58-29.13 28.41-29.96c.86-.04 1.59.63 1.59 1.5z"/><circle fill="${colors.foreground}" cx="82" cy="31" r="15"/><circle fill="${colors.foreground}" cx="46" cy="97" r="15"/></svg>`;
const logoDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;

export function getOgImagePath(path: string, options: { index?: boolean } = {}): string {
	const pathname = getPathname(path).replace(/^\/|\/$/g, "");
	const slug = pathname || "index";

	return `/og/${options.index && pathname ? `${slug}/index` : slug}.png`;
}

function getPathname(path: string): string {
	if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
		return new URL(path).pathname;
	}

	return `/${path.replace(/^\//, "")}`.split(/[?#]/)[0] ?? "/";
}

function LogoLockup({ height }: { height: number }): ElementNode {
	const lockupHeight = height;
	const lockupGap = lockupHeight * 0.125;
	const markSize = lockupHeight;
	const wordmarkSize = lockupHeight * 0.65;

	return h(
		"div",
		{
			style: {
				display: "flex",
				alignItems: "center",
				gap: `${lockupGap}px`,
				height: `${lockupHeight}px`,
				color: colors.foreground,
			},
		},
		h("img", {
			src: logoDataUrl,
			width: markSize,
			height: markSize,
			alt: "",
			style: {
				display: "flex",
				width: `${markSize}px`,
				height: `${markSize}px`,
			},
		}),
		h(
			"div",
			{
				style: {
					fontSize: `${wordmarkSize}px`,
					fontWeight: 600,
					letterSpacing: "-0.01em",
					lineHeight: 1,
				},
			},
			siteConfig.name,
		),
	);
}

export function renderOgTemplate(props: OgImageTemplateProps): ElementNode {
	if (props.variant === "default") {
		return h(
			"div",
			{
				style: {
					...rootStyle,
					alignItems: "center",
					justifyContent: "center",
					padding: "72px",
				},
			},
			h(
				"div",
				{
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					},
				},
				LogoLockup({ height: 116 }),
			),
		);
	}

	return h(
		"div",
		{
			style: {
				...rootStyle,
				justifyContent: "flex-start",
				padding: "72px 72px 48px",
			},
		},
		h(
			"div",
			{
				style: {
					display: "flex",
					alignItems: "center",
					height: "64px",
				},
			},
			LogoLockup({ height: 64 }),
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "flex-start",
					flex: "1",
					position: "relative",
				},
			},
			h(
				"div",
				{
					style: {
						display: "flex",
						fontSize: "74px",
						fontWeight: 600,
						lineHeight: 1.125,
						letterSpacing: "-0.005em",
						maxWidth: "980px",
					},
				},
				props.title,
			),
		),
	);
}
