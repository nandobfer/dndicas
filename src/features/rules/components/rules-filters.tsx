"use client";

import { SearchInput } from '@/components/ui/search-input';
import { StatusChips, type StatusFilter } from '@/components/ui/status-chips';
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from '@/core/utils';
import type { RulesFilters } from '../types/rules.types';
import { SourceFilter } from "@/components/ui/source-filter"

export interface RulesFiltersProps {
  filters: RulesFilters;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: RulesFilters['status']) => void;
  onSourcesChange: (sources: string[]) => void;
  isSearching?: boolean;
  className?: string;
}

export function RulesFilter({ filters, onSearchChange, onStatusChange, onSourcesChange, isSearching = false, className }: RulesFiltersProps) {
    return (
        <div className={cn("flex flex-col gap-4", className)}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                    <div className="flex-1 w-full sm:max-w-md">
                        <SearchInput value={filters.search || ""} onChange={onSearchChange} isLoading={isSearching} placeholder="Buscar regras por nome, descrição ou fonte..." />
                    </div>
                    <SourceFilter
                        value={filters.sources || []}
                        onChange={onSourcesChange}
                        entityType="rules"
                    />
                </div>

                <div className="w-full sm:w-auto">
                    <StatusChips value={filters.status || "all"} onChange={onStatusChange as (status: StatusFilter) => void} fullWidth className="w-full sm:w-auto" />
                </div>
            </div>
        </div>
    )
}
