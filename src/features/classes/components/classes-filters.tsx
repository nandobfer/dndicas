"use client";

import { SearchInput } from "@/components/ui/search-input"
import { StatusChips, type StatusFilter } from "@/components/ui/status-chips"
import { GlassSelector } from "@/components/ui/glass-selector"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/core/utils"
import type { ClassesFilters } from "../types/classes.types"

export interface ClassesFiltersProps {
    filters: ClassesFilters & { search?: string }
    onSearchChange: (search: string) => void
    onStatusChange: (status: ClassesFilters["status"]) => void
    onHitDiceChange: (hitDice: string[]) => void
    onSpellcastingChange: (spellcasting: string[]) => void
    isSearching?: boolean
    className?: string
}

export function ClassesFilters({ filters, onSearchChange, onStatusChange, onHitDiceChange, onSpellcastingChange, isSearching = false, className }: ClassesFiltersProps) {
    const { isAdmin } = useAuth()

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            {/* Top Row: Search + Status */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                <div className="flex-1 w-full lg:max-w-sm">
                    <SearchInput value={filters.search || ""} onChange={onSearchChange} isLoading={isSearching} placeholder="Buscar classes por nome ou descrição..." />
                </div>

                {isAdmin && (
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Status:</span>
                        <StatusChips value={(filters.status as StatusFilter) || "all"} onChange={(v) => onStatusChange(v as ClassesFilters["status"])} />
                    </div>
                )}
            </div>
        </div>
    )
}
