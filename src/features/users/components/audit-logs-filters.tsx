'use client';

import * as React from "react"
import { SearchInput } from "@/components/ui/search-input"
import { ActionMultiSelect } from "@/components/ui/action-multiselect"
import { PeriodFilter } from "@/components/ui/period-filter"
import { DataTableFilters } from "@/components/ui/data-table-filters"
import type { AuditAction } from "../types/audit.types"
import type { AuditLogsFilterState } from "../hooks/useAuditLogsFilters"

interface AuditLogsFiltersProps {
    filters: AuditLogsFilterState
    isLoading?: boolean
    onActionsChange: (actions: AuditAction[]) => void
    onActorEmailChange: (email: string | undefined) => void
    onDateRangeChange: (startDate?: string, endDate?: string) => void
    onReset: () => void
}

export function AuditLogsFilters({ filters, isLoading, onActionsChange, onActorEmailChange, onDateRangeChange, onReset }: AuditLogsFiltersProps) {
    const hasActiveFilters = !!((filters.actions && filters.actions.length > 0) || filters.actorEmail || filters.startDate || filters.endDate)

    return (
        <DataTableFilters
            searchValue={filters.actorEmail || ""}
            searchPlaceholder="Digite para buscar..."
            onSearchChange={(value) => onActorEmailChange(value || undefined)}
            isSearching={isLoading}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={onReset}
        >
            <ActionMultiSelect value={filters.actions || []} onChange={onActionsChange} />
            <PeriodFilter startDate={filters.startDate} endDate={filters.endDate} onChange={onDateRangeChange} />
        </DataTableFilters>
    )
}

AuditLogsFilters.displayName = 'AuditLogsFilters';
