import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: "https",
                hostname: "img.clerk.com"
            }
        ]
    },
    async headers() {
        return [
            {
                source: "/favicon.ico",
                headers: [
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
                    { key: "Access-Control-Allow-Headers", value: "Content-Type" },
                ],
            },
            {
                source: "/dndicas-1.svg",
                headers: [
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
                    { key: "Access-Control-Allow-Headers", value: "Content-Type" },
                ],
            },
            ...[
                "/owlbear-catalog-action.svg",
                "/owlbear-sheet-action.svg",
                "/owlbear-npcs-action.svg",
                "/owlbear-dice-action.svg",
            ].map((source) => ({
                source,
                headers: [
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
                    { key: "Access-Control-Allow-Headers", value: "Content-Type" },
                ],
            })),
        ]
    },
}

export default nextConfig;
