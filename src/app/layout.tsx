import Script from "next/script";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";
import { cn } from "@/core/utils";
import { AppProvider } from "@/core/context/app-context"
import { ptBR } from "@clerk/localizations"
import { Toaster } from "@/core/ui/toast"
import { GlassTooltipProvider } from "@/components/ui/glass-tooltip"
import { ScrollToTop } from "@/core/ui/scroll-to-top"
import { WindowProvider } from "@/core/context/window-context"
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
        <ClerkProvider
            localization={ptBR}
            appearance={{
                baseTheme: dark,
                variables: {
                    colorPrimary: "#3B82F6",
                    colorBackground: "#0a0a0a",
                    colorInputBackground: "rgba(255, 255, 255, 0.05)",
                    colorInputText: "#ffffff",
                    colorText: "#ffffff",
                    colorTextOnPrimaryBackground: "#ffffff",
                    colorTextSecondary: "rgba(255, 255, 255, 0.6)",
                    colorNeutral: "rgba(255, 255, 255, 0.3)",
                    colorDanger: "#EF4444",
                    colorSuccess: "#10B981",
                    colorWarning: "#F59E0B",
                },
                elements: {
                    rootBox: "bg-transparent",
                    card: "bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl",
                    headerTitle: "text-white",
                    headerSubtitle: "text-white/60",
                    socialButtonsBlockButton: "bg-white/5 border border-white/10 text-white hover:bg-white/10",
                    formButtonPrimary: "bg-blue-500 hover:bg-blue-600 text-white",
                    formFieldInput: "bg-white/10 border border-white/10 text-white focus:border-blue-500 focus:ring-blue-500/50",
                    formFieldLabel: "text-white/80",
                    footerActionLink: "text-blue-400 hover:text-blue-300",
                    identityPreviewText: "text-white",
                    identityPreviewEditButton: "text-blue-400 hover:text-blue-300",
                    formFieldInputShowPasswordButton: "text-white/60 hover:text-white",
                },
            }}
        >
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
                    <ScrollToTop />
                    <AppProvider>
                        <GlassTooltipProvider>
                            <WindowProvider>
                                {children}
                                <Toaster />
                            </WindowProvider>
                        </GlassTooltipProvider>
                    </AppProvider>
                </body>
            </html>
        </ClerkProvider>
    )
}
