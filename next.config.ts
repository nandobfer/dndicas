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
                "/owlbear/catalog.svg",
                "/owlbear/sheet.svg",
                "/owlbear/npc.svg",
                "/owlbear/dice.svg",
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
