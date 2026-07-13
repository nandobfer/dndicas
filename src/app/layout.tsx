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
export const metadata: Metadata = {
    title: "Dungeons & Dicas",
    description: "Dungeons & Dragons em Português",
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="pt-BR" className="dark">
            <head>
                <Script
                    id="umami-analytics"
                    src="https://analytics.nandoburgos.dev/script.js"
                    data-website-id="6914445b-f309-4d5a-85b3-ef9c5fc30866"
                    strategy="afterInteractive"
                />
            </head>
            <body className={cn("min-h-screen bg-background font-sans antialiased")}>
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
