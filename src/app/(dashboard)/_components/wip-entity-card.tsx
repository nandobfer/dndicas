"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardDescription, GlassCardContent } from "@/components/ui/glass-card"
import { Sparkles, Clock } from "lucide-react"

/**
 * Placeholder card for WIP features.
 */
export function WipEntityCard({
    title,
    icon: Icon,
    description,
    index,
}: {
    title: string
    icon?: any
    description?: string
    index: number
    stats?: any
    loading?: boolean
}) {
    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + index * 0.05 }}>
            <GlassCard className="h-full border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors relative group overflow-hidden">
                <GlassCardHeader className="pb-0">
                    <div className="flex items-start justify-between">
                        <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 group-hover:text-white/60 transition-colors">
                            {Icon ? <Icon className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                        </div>
                        <div className="text-[10px] font-bold text-white/20 group-hover:text-white/40 transition-colors">Vem aí</div>
                    </div>
                    <GlassCardTitle className="text-white/90 group-hover:text-white mt-3 transition-colors">{title}</GlassCardTitle>
                    <GlassCardDescription className="text-white/40 text-xs min-h-[32px]">{description || "Em breve..."}</GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="pt-4">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="text-[10px] text-white/20 italic">em desenvolvimento</div>
                        </div>

                        <div className="flex items-end gap-0.5 h-8 w-full opacity-20 group-hover:opacity-30 transition-opacity">
                            {[...Array(12)].map((_, i) => (
                                <div
                                    key={i}
                                    className="flex-1 rounded-t-[1px] bg-white/40"
                                    style={{ height: `${20 + ((i * 7 + index * 13) % 80)}%` }}
                                />
                            ))}
                        </div>
                    </div>
                </GlassCardContent>

                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                    <div className="flex flex-col items-center gap-2">
                        <Clock className="h-6 w-6 text-white/60 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Coming Soon</span>
                    </div>
                </div>
            </GlassCard>
        </motion.div>
    )
}
