"use client";

/**
 * @fileoverview User filters component with search, role tabs, and status chips.
 *
 * @see specs/000/spec.md - FR-013, FR-014, FR-015, FR-019
 */

import { SearchInput } from '@/components/ui/search-input';
import { RoleTabs, type RoleFilter } from '@/components/ui/role-tabs';
import { StatusChips, type StatusFilter } from '@/components/ui/status-chips';
import { cn } from '@/core/utils';
import type { UserFilters } from '../types/user.types';

export interface UserFiltersProps {
  /** Current filters */
  filters: UserFilters;
  /** Search change handler */
  onSearchChange: (search: string) => void;
  /** Role change handler */
  onRoleChange: (role: RoleFilter) => void;
  /** Status change handler */
  onStatusChange: (status: UserFilters['status']) => void;
  /** Whether search is loading */
  isSearching?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * UserFilters component combining search, role tabs, and status chips.
 *
 * @example
 * ```tsx
 * <UserFilters
 *   filters={filters}
 *   onSearchChange={setSearch}
 *   onRoleChange={setRole}
 *   onStatusChange={setStatus}
 *   isSearching={isLoading}
 * />
 * ```
 */
export function UserFilters({
  filters,
  onSearchChange,
  onRoleChange,
  onStatusChange,
  isSearching = false,
  className,
}: UserFiltersProps) {
  return (
      <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
          {/* Left side: Search */}
          <div className="flex-1">
              <SearchInput value={filters.search || ""} onChange={onSearchChange} isLoading={isSearching} placeholder="Buscar por nome, username ou email..." />
          </div>

          {/* Right side: Filters */}
          <div className="flex flex-wrap items-center gap-3">
              {/* Role tabs */}
              <RoleTabs value={filters.role || "all"} onChange={onRoleChange} />

              {/* Status chips */}
              <StatusChips value={filters.status || "active"} onChange={onStatusChange as (status: StatusFilter) => void} />
          </div>
      </div>
  )
}
