"use client";

import { SearchInput } from "@/components/ui/search-input"
import { StatusChips, type StatusFilter } from "@/components/ui/status-chips"
import { GlassSelector } from "@/components/ui/glass-selector"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/core/utils"
import { diceColors } from "@/lib/config/colors"
import type { ClassesFilters, HitDiceType, SpellcastingTier } from "../types/classes.types"

const HIT_DICE_OPTIONS: { value: HitDiceType; label: string; activeColor: string; textColor: string }[] = [
    { value: "d6", label: "d6", activeColor: diceColors.d6.bg, textColor: diceColors.d6.text },
    { value: "d8", label: "d8", activeColor: diceColors.d8.bg, textColor: diceColors.d8.text },
    { value: "d10", label: "d10", activeColor: diceColors.d10.bg, textColor: diceColors.d10.text },
    { value: "d12", label: "d12", activeColor: diceColors.d12.bg, textColor: diceColors.d12.text },
]

const SPELLCASTING_OPTIONS: { value: SpellcastingTier; label: string; activeColor: string; textColor: string }[] = [
    { value: "Nenhum", label: "Nenhum", activeColor: "bg-slate-400/20", textColor: "text-slate-400" },
    { value: "Terço", label: "Terço", activeColor: "bg-blue-400/20", textColor: "text-blue-400" },
    { value: "Metade", label: "Metade", activeColor: "bg-purple-400/20", textColor: "text-purple-400" },
    { value: "Completo", label: "Completo", activeColor: "bg-amber-400/20", textColor: "text-amber-400" },
]

export interface ClassesFiltersProps {
    filters: ClassesFilters & { search?: string }
    onSearchChange: (search: string) => void
    onStatusChange: (status: ClassesFilters["status"]) => void
    onHitDiceChange: (hitDice: string[]) => void
    onSpellcastingChange: (spellcasting: string[]) => void
    isSearching?: boolean
    className?: string
}

export function ClassesFilters({
    filters,
    onSearchChange,
    onStatusChange,
    onHitDiceChange,
    onSpellcastingChange,
    isSearching = false,
    className,
}: ClassesFiltersProps) {
    const { isAdmin } = useAuth()

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            {/* Top Row: Search + Status */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                <div className="flex-1 w-full lg:max-w-sm">
                    <SearchInput
                        value={filters.search || ""}
                        onChange={onSearchChange}
                        isLoading={isSearching}
                        placeholder="Buscar classes por nome ou descrição..."
                    />
                </div>

                {isAdmin && (
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                            Status:
                        </span>
                        <StatusChips
                            value={(filters.status as StatusFilter) || "all"}
                            onChange={(v) => onStatusChange(v as ClassesFilters["status"])}
                        />
                    </div>
                )}
            </div>

            {/* Second Row: Hit Dice + Spellcasting */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                        Dado de Vida:
                    </span>
                    <GlassSelector
                        options={HIT_DICE_OPTIONS}
                        value={(filters.hitDice as HitDiceType[]) || []}
                        onChange={(v) => onHitDiceChange(Array.isArray(v) ? (v as string[]) : [v as string])}
                        mode="multi"
                        layout="horizontal"
                        size="sm"
                        layoutId="filter-hit-dice"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">
                        Conjuração:
                    </span>
                    <GlassSelector
                        options={SPELLCASTING_OPTIONS}
                        value={(filters.spellcasting as SpellcastingTier[]) || []}
                        onChange={(v) => onSpellcastingChange(Array.isArray(v) ? (v as string[]) : [v as string])}
                        mode="multi"
                        layout="horizontal"
                        size="sm"
                        layoutId="filter-spellcasting"
                    />
                </div>
            </div>
        </div>
    )
}
