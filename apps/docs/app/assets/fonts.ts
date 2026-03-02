import localFont from "next/font/local";

export const Switzer = localFont({
	src: [
		{
			path: "./fonts/Switzer-Variable.woff2",
			weight: "100 900",
			style: "normal",
		},
		{
			path: "./fonts/Switzer-VariableItalic.woff2",
			weight: "100 900",
			style: "italic",
		},
	],
	display: "swap",
	variable: "--font-switzer",
});
