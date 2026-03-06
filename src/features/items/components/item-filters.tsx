/**
 * @fileoverview Item filters component.
 */

"use client";

import { SearchInput } from "@/components/ui/search-input"
import { StatusChips, type StatusFilter } from "@/components/ui/status-chips"
import { useAuth } from "@/core/hooks/useAuth"
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
    { value: "ferramenta", label: "Ferramenta" },
    { value: "consumível", label: "Consumível" },
    { value: "munição", label: "Munição" },
    { value: "escudo", label: "Escudo" },
    { value: "qualquer", label: "Qualquer" },
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

export function ItemFilters({ 
    filters, 
    onSearchChange, 
    onStatusChange, 
    onTypeChange,
    onRarityChange,
    isSearching = false, 
    className 
}: ItemFiltersProps) {
    const { isAdmin } = useAuth()

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 min-w-0">
                    <SearchInput
                        value={filters.search || ""}
                        onChange={onSearchChange}
                        isLoading={isSearching}
                        placeholder="Buscar itens por nome, descrição ou fonte..."
                    />
                </div>

                <div className="flex items-center gap-2 min-w-[200px]">
                    <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Tipo:</span>
                    <GlassSelector
                        value={filters.type || "all"}
                        onChange={(val) => onTypeChange?.(val as any)}
                        options={ITEM_TYPES}
                        className="w-full"
                        layoutId="item-type-selector"
                    />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white/[0.02] p-2 rounded-lg border border-white/5">
                <div className="flex items-center gap-2 min-w-[200px] w-full sm:w-auto">
                    <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Raridade:</span>
                    <GlassSelector
                        value={filters.rarity || "all"}
                        onChange={(val) => onRarityChange?.(val as any)}
                        options={ITEM_RARITIES}
                        className="w-full sm:w-auto"
                        layoutId="item-rarity-selector"
                    />
                </div>

                {isAdmin && (
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        <span className="text-[10px] sm:text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Status:</span>
                        <StatusChips
                            value={(filters.status as StatusFilter) || "all"}
                            onChange={(v) => onStatusChange?.(v as any)}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
