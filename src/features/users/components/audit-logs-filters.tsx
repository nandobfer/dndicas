'use client';

import * as React from "react"
import { X } from "lucide-react"
import { ActionMultiSelect } from "@/components/ui/action-multiselect"
import { EntityMultiSelect } from "@/components/ui/entity-multiselect"
import { PeriodFilter } from "@/components/ui/period-filter"
import { DataTableFilters } from "@/components/ui/data-table-filters"
import { useIsMobile } from "@/core/hooks/useMediaQuery"
import { cn } from "@/core/utils"
import type { AuditAction } from "../types/audit.types"
import type { AuditLogsFilterState } from "../hooks/useAuditLogsFilters"

interface AuditLogsFiltersProps {
    filters: AuditLogsFilterState
    isLoading?: boolean
    onActionsChange: (actions: AuditAction[]) => void
    onEntityTypesChange: (entities: string[]) => void
    onDateRangeChange: (startDate?: string, endDate?: string) => void
    onReset: () => void
}

export function AuditLogsFilters({ filters, isLoading, onActionsChange, onEntityTypesChange, onDateRangeChange, onReset }: AuditLogsFiltersProps) {
    const isMobile = useIsMobile()
    const hasActiveFilters = !!(
        (filters.actions && filters.actions.length > 0) ||
        (filters.entityTypes && filters.entityTypes.length > 0) ||
        filters.startDate ||
        filters.endDate
    )

    return (
        <DataTableFilters isSearching={isLoading} hasActiveFilters={hasActiveFilters} onClearFilters={isMobile ? undefined : onReset}>
            <div className="grid grid-cols-2 w-full gap-2 md:contents">
                <ActionMultiSelect
                    value={filters.actions || []}
                    onChange={onActionsChange}
                    className="w-full md:w-auto max-w-none md:max-w-[200px]"
                />
                <EntityMultiSelect
                    value={filters.entityTypes || []}
                    onChange={onEntityTypesChange}
                    className="w-full md:w-auto max-w-none md:max-w-[200px]"
                />
            </div>

            <div className="flex w-full items-center gap-2 md:contents">
                <PeriodFilter
                    startDate={filters.startDate}
                    endDate={filters.endDate}
                    onChange={onDateRangeChange}
                    className="w-full md:w-auto flex-1 md:flex-none"
                />

                {isMobile && hasActiveFilters && (
                    <button
                        type="button"
                        onClick={onReset}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap min-h-[40px]",
                            "text-white/60 hover:text-white",
                            "bg-white/5 hover:bg-white/10",
                            "border border-white/10",
                            "transition-colors",
                            "flex items-center justify-center gap-2",
                            isMobile ? "w-[40px] px-4" : "px-4"
                        )}
                    >
                        <X className="h-4 w-4" />
                        {!isMobile && "Limpar"}
                    </button>
                )}
            </div>
        </DataTableFilters>
    )
}

AuditLogsFilters.displayName = 'AuditLogsFilters';
