/**
 * @fileoverview Background calculation and lookup filters.
 */

"use client";

import { SearchInput } from "@/components/ui/search-input"
import { StatusChips, type StatusFilter } from "@/components/ui/status-chips"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/core/utils"

export interface BackgroundFiltersProps {
    filters: {
        search: string
        status?: string
    }
    onSearchChange: (search: string) => void
    onStatusChange?: (status: any) => void
    isSearching?: boolean
    className?: string
}

export function BackgroundFilters({ filters, onSearchChange, onStatusChange, isSearching = false, className }: BackgroundFiltersProps) {
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
                        placeholder="Buscar origens por nome, descrição ou fonte..."
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
