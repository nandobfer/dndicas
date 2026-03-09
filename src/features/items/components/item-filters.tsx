/**
 * @fileoverview Item filters component.
 */

"use client";

import { SearchInput } from "@/components/ui/search-input"
import { StatusChips, type StatusFilter } from "@/components/ui/status-chips"
import { useAuth } from "@/core/hooks/useAuth"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { cn } from "@/core/utils"
import { ItemType, ItemRarity } from "../types/items.types"
import { GlassSelector } from "@/components/ui/glass-selector"

export interface ItemFiltersProps {
    filters: {
        search: string
        status?: "active" | "inactive" | "all"
        type?: ItemType | "all"
        rarity?: ItemRarity | "all"
    }
    onSearchChange: (search: string) => void
    onStatusChange?: (status: "active" | "inactive" | "all") => void
    onTypeChange?: (type: ItemType | "all") => void
    onRarityChange?: (rarity: ItemRarity | "all") => void
    isSearching?: boolean
    className?: string
}

const ITEM_TYPES: { value: ItemType | "all"; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "arma", label: "Arma" },
    { value: "armadura", label: "Armadura" },
    { value: "escudo", label: "Escudo" },
    { value: "ferramenta", label: "Ferramenta" },
    { value: "consumível", label: "Consumível" },
    { value: "munição", label: "Munição" },
    { value: "qualquer", label: "Outro" },
]

const ITEM_RARITIES: { value: ItemRarity | "all"; label: string }[] = [
    { value: "all", label: "Todas" },
    { value: "comum", label: "Comum" },
    { value: "incomum", label: "Incomum" },
    { value: "raro", label: "Raro" },
    { value: "muito raro", label: "Muito Raro" },
    { value: "lendário", label: "Lendário" },
    { value: "artefato", label: "Artefato" },
]

export function ItemFilters({ filters, onSearchChange, onStatusChange, onTypeChange, onRarityChange, isSearching = false, className }: ItemFiltersProps) {
    const { isAdmin } = useAuth()
    const isMobile = useIsMobile()

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            {/* Top Row: Search + Rarity */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                <div className="flex-1 min-w-0">
                    <SearchInput value={filters.search || ""} onChange={onSearchChange} isLoading={isSearching} placeholder="Buscar itens por nome, descrição ou fonte..." />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
                    <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Raridade:</span>
                    <GlassSelector
                        value={filters.rarity || "all"}
                        onChange={(val) => onRarityChange?.(val as any)}
                        options={ITEM_RARITIES}
                        className="w-full lg:w-auto"
                        layoutId="item-rarity-selector"
                        layout={isMobile ? "grid" : "horizontal"}
                        cols={isMobile ? 3 : undefined}
                    />
                </div>
            </div>

            {/* Bottom Row: Type + Status */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Tipo:</span>
                    <GlassSelector
                        value={filters.type || "all"}
                        onChange={(val) => onTypeChange?.(val as any)}
                        options={ITEM_TYPES}
                        className="w-full sm:w-auto"
                        layoutId="item-type-selector"
                        layout={isMobile ? "grid" : "horizontal"}
                        cols={isMobile ? 3 : undefined}
                    />
                </div>

                {isAdmin && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto sm:ml-auto">
                        <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Status:</span>
                        <StatusChips value={(filters.status as StatusFilter) || "all"} onChange={(v) => onStatusChange?.(v as any)} />
                    </div>
                )}
            </div>
        </div>
    )
}
