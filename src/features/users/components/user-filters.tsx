"use client";

/**
 * @fileoverview User filters component with search, role tabs, and status filter.
 *
 * @see specs/000/spec.md - FR-013, FR-014, FR-015, FR-019
 */

import { SearchInput } from '@/components/ui/search-input';
import { RoleTabs, type RoleFilter } from '@/components/ui/role-tabs';
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
 * Status filter options.
 */
const statusOptions: Array<{ value: UserFilters['status']; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
];

/**
 * UserFilters component combining search, role tabs, and status selector.
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
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      {/* Left side: Search */}
      <div className="flex-1 max-w-md">
        <SearchInput
          value={filters.search || ''}
          onChange={onSearchChange}
          isLoading={isSearching}
          placeholder="Buscar por nome, username ou email..."
        />
      </div>

      {/* Right side: Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Role tabs */}
        <RoleTabs
          value={filters.role || 'all'}
          onChange={onRoleChange}
        />

        {/* Status selector */}
        <select
          value={filters.status || 'active'}
          onChange={(e) => onStatusChange(e.target.value as UserFilters['status'])}
          className={cn(
            'h-9 px-3 rounded-lg text-sm',
            'bg-white/5 border border-white/10 text-white',
            'outline-none transition-all',
            'focus:ring-2 focus:ring-white/20',
            'cursor-pointer appearance-none',
            'bg-no-repeat bg-right pr-8',
          )}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='rgba(255,255,255,0.5)' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
            backgroundSize: '16px',
            backgroundPosition: 'right 8px center',
          }}
          aria-label="Filtrar por status"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value} className="bg-gray-900 text-white">
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
