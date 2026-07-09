"use client"

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { Trash2, Star, Shield } from "lucide-react"
import { GlassCard } from "@/components/ui/glass-card"
import { GlassImage } from "@/components/ui/glass-image"
import { cn } from "@/core/utils"
import type { CharacterSheet } from "@/features/character-sheets/types/character-sheet.types"
import { attributeColors } from "@/lib/config/colors"

function extractPlainText(value: string): string {
    if (!value.includes("<")) return value.replace(/\s+/g, " ").trim()

    if (typeof document !== "undefined") {
        const element = document.createElement("div")
        element.innerHTML = value
        return (element.textContent ?? "").replace(/\s+/g, " ").trim()
    }

    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
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
    onRequestDelete?: (sheet: CharacterSheet) => void
    onOpen?: (sheet: CharacterSheet) => void
    showDelete?: boolean
    isDeleting?: boolean
    interactive?: boolean
    actionLabel?: string
    actionIcon?: LucideIcon
    actionTone?: "danger" | "warning"
    onAction?: (sheet: CharacterSheet) => void
    isActionPending?: boolean
}

export function GlassSheetCard({
    sheet,
    onRequestDelete,
    onOpen,
    showDelete = true,
    isDeleting,
    interactive = true,
    actionLabel,
    actionIcon: ActionIcon = Trash2,
    actionTone = "danger",
    onAction,
    isActionPending,
}: GlassSheetCardProps) {
    const handleOpen = () => {
        onOpen?.(sheet)
    }

    const handleAction = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (onAction) {
            onAction(sheet)
            return
        }
        onRequestDelete?.(sheet)
    }

    const ca = sheet.computedArmorClass ?? 10
    const fallbackInitial = (sheet.name || "?").trim().charAt(0).toUpperCase() || "?"
    const shouldShowAction = showDelete && (onAction || onRequestDelete)
    const actionDisabled = isDeleting || isActionPending
    const sheetDetails = [sheet.class, sheet.subclass, sheet.race, sheet.origin]
        .map((value) => value ? extractPlainText(value) : "")
        .filter(Boolean)
    const actionButtonClassName = cn(
        "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
        "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
        actionTone === "warning"
            ? "bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 hover:text-amber-300"
            : "bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300",
        actionDisabled && "opacity-50 pointer-events-none",
    )

    return (
        <GlassCard
            className={cn(
                "group overflow-hidden transition-all duration-200",
                interactive
                    ? "cursor-pointer hover:border-white/25 hover:shadow-lg hover:shadow-black/30"
                    : "cursor-default",
                "bg-white/[0.03] backdrop-blur-sm",
                isDeleting && "opacity-50 pointer-events-none",
            )}
            onClick={interactive ? handleOpen : undefined}
        >
            {/* Top accent bar */}
            <div className="h-0.5 w-full bg-gradient-to-r from-violet-500/40 via-blue-400/40 to-transparent" />

            <div className="flex gap-3 p-4">
                <div className="h-[128px] w-[88px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                    {sheet.photo ? (
                        <GlassImage
                            src={sheet.photo}
                            alt={`Imagem de ${sheet.name}`}
                            triggerClassName="h-full w-full"
                            className="h-full w-full rounded-lg aspect-auto"
                            imageClassName="object-cover mix-blend-normal"
                            showOverlay={false}
                            expandLabel={`Abrir imagem ampliada de ${sheet.name}`}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/10 via-violet-500/10 to-sky-500/10 text-3xl font-black text-white/25">
                            {fallbackInitial}
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
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
                            {sheetDetails.length > 0 && (
                                <p className="text-[10px] text-white/50 font-semibold tracking-wider truncate mt-0.5">
                                    {sheetDetails.join(" · ")}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Secondary action button */}
                    {shouldShowAction && (
                        <motion.button
                            onClick={handleAction}
                            disabled={actionDisabled}
                            className={actionButtonClassName}
                            whileTap={{ scale: 0.9 }}
                            aria-label={actionLabel ?? "Excluir ficha"}
                        >
                            <ActionIcon className={cn("w-3.5 h-3.5", isActionPending && "animate-spin")} />
                        </motion.button>
                    )}
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
            </div>
        </GlassCard>
    )
}
