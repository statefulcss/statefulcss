/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
