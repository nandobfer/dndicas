/**
 * @fileoverview Race filters component.
 */

"use client";

import { SearchInput } from "@/components/ui/search-input"
import { StatusChips, type StatusFilter } from "@/components/ui/status-chips"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/core/utils"
import { SourceFilter } from "@/components/ui/source-filter"

export interface RaceFiltersProps {
    filters: {
        search: string
        status?: string
        sources?: string[]
    }
    onSearchChange: (search: string) => void
    onStatusChange?: (status: any) => void
    onSourcesChange?: (sources: string[]) => void
    isSearching?: boolean
    className?: string
}

export function RaceFilters({ filters, onSearchChange, onStatusChange, onSourcesChange, isSearching = false, className }: RaceFiltersProps) {
    const { isAdmin } = useAuth()

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                    <div className="flex-1 w-full lg:max-w-sm">
                        <SearchInput
                            value={filters.search || ""}
                            onChange={onSearchChange}
                            isLoading={isSearching}
                            placeholder="Buscar raças por nome, descrição ou fonte..."
                        />
                    </div>
                    <SourceFilter
                        value={filters.sources || []}
                        onChange={(sources) => onSourcesChange?.(sources)}
                        entityType="races"
                    />
                </div>

                {isAdmin && (
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-white/40 uppercase tracking-wider whitespace-nowrap">Status:</span>
                        <StatusChips
                            value={(filters.status as StatusFilter) || "all"}
                            onChange={(v) => onStatusChange?.(v)}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
