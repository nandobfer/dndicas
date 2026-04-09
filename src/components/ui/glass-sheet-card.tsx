"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { ScrollText, Trash2, Star, Shield } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { cn } from "@/core/utils"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"
import { attributeColors } from "@/lib/config/colors"
import { MentionContent } from "@/features/rules/components/mention-badge"

const isHtmlContent = (s: string) => s.includes("<")

function RichFieldValue({ value }: { value: string }) {
    if (isHtmlContent(value)) {
        return <MentionContent html={value} mode="inline" />
    }
    return <span>{value}</span>
}

const ATTR_LABELS: {
    key: keyof CharacterSheet
    label: string
    bgAlpha: string
    text: string
    border: string
}[] = [
    { key: "strength",      label: "FOR", ...attributeColors["Força"] },
    { key: "dexterity",     label: "DES", ...attributeColors["Destreza"] },
    { key: "constitution",  label: "CON", ...attributeColors["Constituição"] },
    { key: "intelligence",  label: "INT", ...attributeColors["Inteligência"] },
    { key: "wisdom",        label: "SAB", ...attributeColors["Sabedoria"] },
    { key: "charisma",      label: "CAR", ...attributeColors["Carisma"] },
]

const formatMod = (score: number): string => {
    const mod = Math.floor((score - 10) / 2)
    if (mod > 0) return `+${mod}`
    return String(mod)
}

interface GlassSheetCardProps {
    sheet: CharacterSheet
    onRequestDelete: (sheet: CharacterSheet) => void
    isDeleting?: boolean
}

export function GlassSheetCard({ sheet, onRequestDelete, isDeleting }: GlassSheetCardProps) {
    const router = useRouter()

    const handleOpen = () => {
        router.push(`/sheets/${sheet.slug}`)
    }

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        onRequestDelete(sheet)
    }

    const ca = sheet.armorClassOverride ?? 10

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
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                            <ScrollText className="w-4 h-4 text-violet-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-bold text-white truncate leading-tight">
                                    {sheet.name}
                                </h3>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {sheet.level > 0 && (
                                        <div className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-400/80">
                                            <Star className="w-3 h-3" />
                                            <span>{sheet.level}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-0.5 text-[10px] font-semibold text-sky-400/80">
                                        <Shield className="w-3 h-3" />
                                        <span>{ca}</span>
                                    </div>
                                </div>
                            </div>
                            {(sheet.class || sheet.race || sheet.origin) && (
                                <p className="text-[10px] text-white/50 font-semibold tracking-wider truncate mt-0.5">
                                    {[
                                        sheet.class ? <RichFieldValue key="class" value={sheet.class} /> : null,
                                        sheet.subclass ? <RichFieldValue key="subclass" value={sheet.subclass} /> : null,
                                        sheet.race ? <RichFieldValue key="race" value={sheet.race} /> : null,
                                        sheet.origin ? <RichFieldValue key="origin" value={sheet.origin} /> : null,
                                    ].filter(Boolean).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, " · ", el]), [])}
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
                {/* Attribute modifiers */}
                <div className="grid grid-cols-6 gap-1">
                    {ATTR_LABELS.map(({ key, label, bgAlpha, text, border }) => (
                        <div key={key} className={cn("flex flex-col items-center gap-0.5 rounded py-1 px-0.5 border", bgAlpha, border)}>
                            <span className="text-[8px] font-bold uppercase text-white/40">{label}</span>
                            <span className={cn("text-[10px] font-bold", text)}>{formatMod(sheet[key] as number)}</span>
                        </div>
                    ))}
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
