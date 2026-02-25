"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent } from "@/components/ui/glass-card"
import { cn } from "@/core/utils"
import { entityConfig, EntityType } from "@/lib/config/colors"
import { MiniLineChart } from "./charts"
import { LucideIcon } from "lucide-react"

/**
 * T033: Generalized entity card component for dashboard catalog grid.
 * 
 * Displays entity statistics with:
 * - Icon and title with entity color theming
 * - Active count badge
 * - Growth chart
 * - Hover animations
 */
export function EntityCard({
    entityType,
    stats,
    loading,
    index,
    title,
    icon: Icon,
    description,
}: {
    entityType: EntityType
    stats?: { total: number; active: number; growth?: Array<{ count: number }> }
    loading: boolean
    index: number
    title: string
    icon: LucideIcon
    description?: string
}) {
    const config = entityConfig[entityType]

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 + index * 0.05 }}
        >
            <GlassCard className={cn("h-full group transition-colors relative overflow-hidden", config.border, config.hoverBorder)}>
                <GlassCardHeader className="pb-0">
                    <div className="flex items-start justify-between">
                        <div className={cn("p-2 rounded-lg border transition-colors", config.bgAlpha, config.border, config.text, "group-hover:text-white")}>
                            <Icon className="h-5 w-5" />
                        </div>
                        <div className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", config.badge, config.border)}>
                            {loading ? 0 : stats?.active} ativas
                        </div>
                    </div>
                    <GlassCardTitle className="text-white/90 group-hover:text-white mt-3 transition-colors">
                        {title}
                    </GlassCardTitle>
                    <GlassCardDescription className="text-white/40 text-xs min-h-[32px]">
                        {description}
                    </GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="pt-4">
                    <div className="space-y-3">
                        {loading || !stats?.growth ? (
                            <div className="h-8 w-full flex items-end opacity-20 group-hover:opacity-40 transition-opacity">
                                <div className={cn("w-full h-1 bg-gradient-to-r from-transparent via-current to-transparent", config.text)} />
                            </div>
                        ) : (
                            <div className="opacity-60 group-hover:opacity-100 transition-opacity h-12 flex flex-col justify-end">
                                <MiniLineChart data={stats.growth} color={config.hex} />
                            </div>
                        )}
                    </div>
                </GlassCardContent>
            </GlassCard>
        </motion.div>
    )
}
