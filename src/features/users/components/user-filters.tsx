"use client";

/**
 * @fileoverview User filters component with search, role tabs, and status chips.
 *
 * @see specs/000/spec.md - FR-013, FR-014, FR-015, FR-019
 */

import { SearchInput } from '@/components/ui/search-input';
import { useRoles } from '@/features/perfix/hooks/usePerfixAdmin';
import { StatusChips, type StatusFilter } from '@/components/ui/status-chips';
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from '@/core/utils';
import type { UserFilters } from '../types/user.types';

export interface UserFiltersProps {
  /** Current filters */
  filters: UserFilters;
  /** Search change handler */
  onSearchChange: (search: string) => void;
  /** Role change handler */
  onRoleChange: (roleId: string) => void;
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
  const isAdmin = useAuth().can("users.view")
  const roles = useRoles()

  return (
      <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
          {/* Left side: Search */}
          <div className="flex-1">
              <SearchInput
                  value={filters.search || ""}
                  onChange={onSearchChange}
                  isLoading={isSearching}
                  placeholder="Buscar por nome, username ou email..."
              />
          </div>

          {/* Right side: Filters */}
          <div className="flex flex-wrap items-center gap-3">
              {/* Role tabs */}
              <select aria-label="Filtrar por perfil" className="rounded border bg-background p-2 text-sm" value={filters.roleId || ""} onChange={event => onRoleChange(event.target.value)}><option value="">Todos os perfis</option>{roles.data?.roles.map(role => <option key={role.id} value={role.id}>{role.nome}</option>)}</select>

              {/* Status chips */}
              <StatusChips value={filters.status || "all"} onChange={onStatusChange as (status: StatusFilter) => void} />
          </div>
      </div>
  )
}
