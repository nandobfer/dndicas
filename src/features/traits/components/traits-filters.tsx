"use client";

import { SearchInput } from '@/components/ui/search-input';
import { StatusChips, type StatusFilter } from '@/components/ui/status-chips';
import { cn } from '@/core/utils';
import type { TraitsFilters } from '../types/traits.types';

export interface TraitsFiltersProps {
  filters: TraitsFilters;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: TraitsFilters['status']) => void;
  isSearching?: boolean;
  className?: string;
}

export function TraitsFilters({
  filters,
  onSearchChange,
  onStatusChange,
  isSearching = false,
  className,
}: TraitsFiltersProps) {
  return (
      <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
          <div className="flex-1 w-full sm:max-w-md">
              <SearchInput 
                value={filters.search || ""} 
                onChange={onSearchChange} 
                isLoading={isSearching} 
                placeholder="Buscar habilidades por nome, descrição ou fonte..." 
              />
          </div>

          <div className="flex flex-wrap items-center gap-3">
              <StatusChips 
                value={filters.status || "all"} 
                onChange={onStatusChange as (status: StatusFilter) => void} 
              />
          </div>
      </div>
  )
}
