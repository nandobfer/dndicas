"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { ScrollText, Trash2, User, Swords, Star } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { cn } from "@/core/utils"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"

interface GlassSheetCardProps {
    sheet: CharacterSheet
    onDelete: (id: string) => void
    isDeleting?: boolean
}

export function GlassSheetCard({ sheet, onDelete, isDeleting }: GlassSheetCardProps) {
    const router = useRouter()

    const handleOpen = () => {
        router.push(`/sheets/${sheet.slug}`)
    }

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        onDelete(sheet._id)
    }

    return (
        <GlassCard
            className={cn(
                "group cursor-pointer overflow-hidden transition-all duration-200",
                "hover:border-white/25 hover:shadow-lg hover:shadow-black/30",
                "bg-white/[0.03] backdrop-blur-sm",
                isDeleting && "opacity-50 pointer-events-none",
            )}
            onClick={handleOpen}
        >
            {/* Top accent bar */}
            <div className="h-0.5 w-full bg-gradient-to-r from-violet-500/40 via-blue-400/40 to-transparent" />

            <div className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                            <ScrollText className="w-4 h-4 text-violet-400" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold text-white truncate leading-tight">
                                {sheet.name}
                            </h3>
                            {sheet.class && (
                                <p className="text-[10px] text-white/50 uppercase font-semibold tracking-wider truncate mt-0.5">
                                    {sheet.class}{sheet.subclass ? ` · ${sheet.subclass}` : ""}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Delete button */}
                    <motion.button
                        onClick={handleDelete}
                        className={cn(
                            "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                            "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
                            "bg-red-500/10 hover:bg-red-500/20 border border-red-500/20",
                            "text-red-400 hover:text-red-300",
                        )}
                        whileTap={{ scale: 0.9 }}
                        aria-label="Excluir ficha"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 flex-wrap">
                    {sheet.level > 0 && (
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-400/80">
                            <Star className="w-3 h-3" />
                            <span>Nível {sheet.level}</span>
                        </div>
                    )}
                    {sheet.race && (
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-white/40">
                            <User className="w-3 h-3" />
                            <span>{sheet.race}</span>
                        </div>
                    )}
                    {sheet.origin && (
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-white/40">
                            <Swords className="w-3 h-3" />
                            <span>{sheet.origin}</span>
                        </div>
                    )}
                </div>

                {/* HP bar */}
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">HP</span>
                        <span className="text-[10px] font-bold text-white/50">
                            {sheet.hpCurrent ?? 0} / {sheet.hpMax ?? 0}
                        </span>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-500/60 to-green-400/40 rounded-full transition-all duration-300"
                            style={{
                                width: (sheet.hpMax ?? 0) > 0
                                    ? `${Math.max(0, Math.min(100, ((sheet.hpCurrent ?? 0) / (sheet.hpMax ?? 1)) * 100))}%`
                                    : "0%",
                            }}
                        />
                    </div>
                </div>
            </div>
        </GlassCard>
    )
}
