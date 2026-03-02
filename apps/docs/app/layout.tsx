import { Switzer } from "@/app/assets/fonts";
import "@/styles/index.css";
import type { Metadata } from "next";
import styles from "./layout.module.css";

const siteURL = "https://statefulcss.com";
const siteName = "Stateful CSS";
const defaultDescription = "Stateful CSS";
const defaultOgImage = `${siteURL}/og-default.png`;

export const metadata: Metadata = {
	metadataBase: new URL(siteURL),
	title: {
		default: siteName,
		template: `%s — ${siteName}`,
	},
	description: defaultDescription,
	openGraph: {
		type: "website",
		locale: "en_US",
		url: siteURL,
		title: {
			default: siteName,
			template: `%s — ${siteName}`,
		},
		description: defaultDescription,
		images: [
			{
				url: defaultOgImage,
				width: 1200,
				height: 630,
				alt: siteName,
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: {
			default: siteName,
			template: `%s — ${siteName}`,
		},
		description: defaultDescription,
		creator: "@omerbalyali",
		site: "@statefulcss",
		images: [defaultOgImage],
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" data-theme="default" data-scheme="dark">
			<body className={`${Switzer.className}`}>
				<div className={`${styles.Layout} app-container`}>
					<main className={styles.Page}>{children}</main>
				</div>
			</body>
		</html>
	);
}
