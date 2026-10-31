"use client"

import { motion } from "framer-motion"
import { GlassHeader } from "@/components/ui/glass-header"
import { LiquidGlassBackground } from "@/components/ui/glass-background"
import { motionConfig } from "@/lib/config/motion-configs"
import { cn } from "@/core/utils"
import { GlassFooter } from "@/components/ui/glass-footer"
import { useWarmSearchCache } from "@/core/hooks/useWarmSearchCache"
import { DiceRollerProvider } from "@/features/dice-roller/components/dice-roll-context"
import { GlobalFabGroup } from "@/features/dice-roller/components/global-fab-group"
import { OpexScopeProvider } from "@/features/opex-agent/components/OpexScopeProvider"
import { useIsOwlbearCatalogEmbed } from "@/features/owlbear/hooks/use-is-owlbear-catalog-embed"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    useWarmSearchCache()
    // Catálogo aberto dentro da extensão do Owlbear: só o conteúdo, sem header nem rodapé.
    const isOwlbearCatalogEmbed = useIsOwlbearCatalogEmbed()

    return (
        <OpexScopeProvider>
        <DiceRollerProvider>
        <div className="relative flex min-h-screen w-full bg-background overflow-hidden">
            {/* Liquid Glass Background */}
            <LiquidGlassBackground />

            {!isOwlbearCatalogEmbed && <GlassHeader />}

            {/* Main Content Area - largura toda, abaixo do header fixo */}
            <div className={cn("relative z-10 flex flex-1 flex-col min-w-0", !isOwlbearCatalogEmbed && "pt-16")}>
                {/* Page Content */}
                <motion.main
                    data-dashboard-content
                    className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6"
                    variants={motionConfig.variants.fadeInUp}
                    initial="initial"
                    animate="animate"
                    transition={motionConfig.transitions.normal}
                >
                    {children}
                </motion.main>

                {!isOwlbearCatalogEmbed && <GlassFooter />}
            </div>

            <GlobalFabGroup />
        </div>
        </DiceRollerProvider>
        </OpexScopeProvider>
    )
}
