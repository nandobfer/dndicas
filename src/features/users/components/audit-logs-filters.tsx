'use client';

import * as React from "react"
import { ActionMultiSelect } from "@/components/ui/action-multiselect"
import { EntityMultiSelect } from "@/components/ui/entity-multiselect"
import { PeriodFilter } from "@/components/ui/period-filter"
import { DataTableFilters } from "@/components/ui/data-table-filters"
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
    const hasActiveFilters = !!(
        (filters.actions && filters.actions.length > 0) ||
        (filters.entityTypes && filters.entityTypes.length > 0) ||
        filters.startDate ||
        filters.endDate
    )

    return (
        <DataTableFilters isSearching={isLoading} hasActiveFilters={hasActiveFilters} onClearFilters={onReset}>
            <ActionMultiSelect value={filters.actions || []} onChange={onActionsChange} />
            <EntityMultiSelect value={filters.entityTypes || []} onChange={onEntityTypesChange} />
            <PeriodFilter startDate={filters.startDate} endDate={filters.endDate} onChange={onDateRangeChange} />
        </DataTableFilters>
    )
}

AuditLogsFilters.displayName = 'AuditLogsFilters';
