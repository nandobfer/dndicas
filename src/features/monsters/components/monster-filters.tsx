"use client"

import { SearchInput } from "@/components/ui/search-input"
import { StatusChips, type StatusFilter } from "@/components/ui/status-chips"
import { GlassInput } from "@/components/ui/glass-input"
import { OptionAutocomplete } from "@/components/ui/option-autocomplete"
import { SourceFilter } from "@/components/ui/source-filter"
import { useAuth } from "@/core/hooks/useAuth"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { cn } from "@/core/utils"
import type { MonsterSize, MonsterType } from "../types/monsters.types"
import { MONSTER_SIZE_OPTIONS, MONSTER_TYPE_OPTIONS } from "./monster-options"

export function MonsterFilters({
    filters,
    onSearchChange,
    onTypeChange,
    onSizeChange,
    onChallengeRatingChange,
    onStatusChange,
    onSourcesChange,
    isSearching = false,
    sourceEntityType = "monsters",
    className,
}: {
    filters: {
        search: string
        type?: MonsterType[]
        size?: MonsterSize[]
        challengeRating?: string
        status?: "active" | "inactive" | "all"
        sources?: string[]
    }
    onSearchChange: (value: string) => void
    onTypeChange: (value: MonsterType[]) => void
    onSizeChange: (value: MonsterSize[]) => void
    onChallengeRatingChange: (value: string) => void
    onStatusChange: (value: "active" | "inactive" | "all") => void
    onSourcesChange: (value: string[]) => void
    isSearching?: boolean
    sourceEntityType?: string
    className?: string
}) {
    const { isAdmin } = useAuth()
    const isMobile = useIsMobile()

    const handleCrInput = (value: string) => {
        onChallengeRatingChange(value.replace(/[^\d/]/g, ""))
    }

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                <div className="flex-1 min-w-0">
                    <SearchInput value={filters.search || ""} onChange={onSearchChange} isLoading={isSearching} placeholder="Buscar monstros por nome, descrição ou fonte..." />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
                    <SourceFilter value={filters.sources || []} onChange={onSourcesChange} entityType={sourceEntityType} />
                    {isAdmin && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                            <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap hidden sm:inline">Status:</span>
                            <StatusChips value={(filters.status as StatusFilter) || "all"} onChange={(value) => onStatusChange(value as "active" | "inactive" | "all")} fullWidth={isMobile} className={isMobile ? "w-full" : ""} />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Tipo:</span>
                    <OptionAutocomplete value={filters.type || []} onChange={(value) => onTypeChange((Array.isArray(value) ? value : value ? [value] : []) as MonsterType[])} options={MONSTER_TYPE_OPTIONS} placeholder="Todos os tipos" title="Filtrar por tipo" className="w-full sm:w-auto" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Tamanho:</span>
                    <OptionAutocomplete value={filters.size || []} onChange={(value) => onSizeChange((Array.isArray(value) ? value : value ? [value] : []) as MonsterSize[])} options={MONSTER_SIZE_OPTIONS} placeholder="Todos os tamanhos" title="Filtrar por tamanho" className="w-full sm:w-auto" accentClass="amber" />
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">CR:</span>
                    <GlassInput type="text" inputMode="numeric" value={filters.challengeRating || ""} onChange={(event) => handleCrInput(event.target.value)} placeholder="Todos" className="w-20 px-2 h-10 text-center" containerClassName="w-auto" />
                </div>
            </div>
        </div>
    )
}
