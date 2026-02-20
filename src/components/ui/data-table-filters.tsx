"use client";

/**
 * @fileoverview Reusable filter component for data tables.
 * Provides search, multiselect, and period filters with clear button.
 * 
 * @example
 * ```tsx
 * <DataTableFilters
 *   searchValue={filters.search}
 *   searchPlaceholder="Buscar por email..."
 *   onSearchChange={setSearch}
 * >
 *   <ActionMultiSelect value={filters.actions} onChange={setActions} />
 *   <PeriodFilter startDate={filters.startDate} endDate={filters.endDate} onChange={setDateRange} />
 * </DataTableFilters>
 * ```
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { SearchInput } from '@/components/ui/search-input';
import { glassConfig } from '@/lib/config/glass-config';
import { fade } from '@/lib/config/motion-configs';
import { cn } from '@/core/utils';

export interface DataTableFiltersProps {
    /** Search input value */
    searchValue?: string
    /** Search input placeholder */
    searchPlaceholder?: string
    /** Search change callback */
    onSearchChange?: (value: string) => void
    /** Whether there are active filters */
    hasActiveFilters?: boolean
    /** Clear filters callback */
    onClearFilters?: () => void
    /** Whether search is loading */
    isSearching?: boolean
    /** Additional filter components (multiselect, period, etc.) */
    children?: React.ReactNode
    /** Additional CSS classes */
    className?: string
}

/**
 * Reusable filters container for data tables.
 * Renders search input and custom filter components with clear button.
 */
export function DataTableFilters({
    searchValue,
    searchPlaceholder = "Buscar...",
    onSearchChange,
    isSearching = false,
    hasActiveFilters = false,
    onClearFilters,
    children,
    className,
}: DataTableFiltersProps) {
    return (
        <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
            {/* Search bar - max-w-md on desktop */}
            {onSearchChange && (
                <div className="flex-1 max-w-md">
                    <SearchInput placeholder={searchPlaceholder} value={searchValue || ""} onChange={onSearchChange} isLoading={isSearching} />
                </div>
            )}

            {/* Filters row */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Custom filters (children) */}
                {children}

                {/* Clear filters button */}
                {hasActiveFilters && onClearFilters && (
                    <button
                        type="button"
                        onClick={onClearFilters}
                        className={cn(
                            "px-3 py-2 rounded-lg text-sm font-medium",
                            "text-white/60 hover:text-white",
                            "bg-white/5 hover:bg-white/10",
                            "border border-white/10",
                            "transition-colors",
                            "flex items-center gap-2",
                        )}
                    >
                        <X className="h-3 w-3" />
                        Limpar
                    </button>
                )}
            </div>
        </div>
    )
}

DataTableFilters.displayName = 'DataTableFilters';
