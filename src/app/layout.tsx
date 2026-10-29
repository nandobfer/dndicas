import Script from "next/script";
import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/core/utils";
import { AppProvider } from "@/core/context/app-context"
import { Toaster } from "@/core/ui/toast"
import { GlassTooltipProvider } from "@/components/ui/glass-tooltip"
import { ScrollToTop } from "@/core/ui/scroll-to-top"
import { WindowProvider } from "@/core/context/window-context"
import { ChunkLoadRecovery } from "@/core/ui/chunk-load-recovery"
import { AuthSessionProvider } from "@/features/auth/auth-session-provider"
import { PusherConfigBridge } from "@/lib/pusher/PusherConfigBridge"
import { getPusherPublicConfig } from "@/lib/pusher/public-config"
import { getAnalyticsConfig } from "@/lib/integrations/analytics"

/**
 * Sempre renderizado por requisição: Pusher e Analytics vêm das integrações (banco → .env legado).
 * Estático, o `next build` (que roda no Docker sem o banco) congelaria os valores do build.
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Dungeons & Dicas",
    description: "Dungeons & Dragons em Português",
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const [pusherConfig, analytics] = await Promise.all([getPusherPublicConfig(), getAnalyticsConfig()])
    return (
        <html lang="pt-BR" className="dark">
            <head>
                {analytics && <Script id="umami-analytics" src={analytics.scriptUrl} data-website-id={analytics.websiteId} strategy="afterInteractive" />}
            </head>
            <body className={cn("min-h-screen bg-background font-sans antialiased")}>
                <PusherConfigBridge config={pusherConfig} />
                <ChunkLoadRecovery />
                <ScrollToTop />
                <AuthSessionProvider>
                    <AppProvider>
                        <GlassTooltipProvider>
                            <WindowProvider>
                                {children}
                                <Toaster />
                            </WindowProvider>
                        </GlassTooltipProvider>
                    </AppProvider>
                </AuthSessionProvider>
            </body>
        </html>
    )
}
