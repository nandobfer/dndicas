/**
 * @fileoverview Hook for managing user list filters state.
 *
 * @see specs/000/spec.md - FR-013, FR-014, FR-015
 */

import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { UserFilters } from '../types/user.types';

/**
 * Default filter values.
 */
const DEFAULT_FILTERS: UserFilters = {
  search: '',
  role: 'all',
  status: 'active',
  page: 1,
  limit: 10,
};

/**
 * Hook for managing user filters with URL sync.
 *
 * @example
 * ```tsx
 * const { filters, setSearch, setRole, resetFilters } = useUsersFilters();
 * ```
 */
export function useUsersFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse filters from URL
  const filtersFromUrl = useMemo<UserFilters>(() => ({
    search: searchParams.get('search') || DEFAULT_FILTERS.search,
    role: (searchParams.get('role') as UserFilters['role']) || DEFAULT_FILTERS.role,
    status: (searchParams.get('status') as UserFilters['status']) || DEFAULT_FILTERS.status,
    page: parseInt(searchParams.get('page') || String(DEFAULT_FILTERS.page), 10),
    limit: parseInt(searchParams.get('limit') || String(DEFAULT_FILTERS.limit), 10),
  }), [searchParams]);

  // Local state for immediate updates
  const [filters, setFilters] = useState<UserFilters>(filtersFromUrl);

  /**
   * Update URL with new filters.
   */
  const updateUrl = useCallback(
    (newFilters: UserFilters) => {
      const params = new URLSearchParams();

      if (newFilters.search) {
        params.set('search', newFilters.search);
      }
      if (newFilters.role && newFilters.role !== 'all') {
        params.set('role', newFilters.role);
      }
      if (newFilters.status && newFilters.status !== 'all') {
        params.set('status', newFilters.status);
      }
      if (newFilters.page && newFilters.page > 1) {
        params.set('page', String(newFilters.page));
      }
      if (newFilters.limit && newFilters.limit !== 10) {
        params.set('limit', String(newFilters.limit));
      }

      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname]
  );

  /**
   * Set search filter.
   */
  const setSearch = useCallback(
    (search: string) => {
      const newFilters = { ...filters, search, page: 1 };
      setFilters(newFilters);
      updateUrl(newFilters);
    },
    [filters, updateUrl]
  );

  /**
   * Set role filter.
   */
  const setRole = useCallback(
    (role: UserFilters['role']) => {
      const newFilters = { ...filters, role, page: 1 };
      setFilters(newFilters);
      updateUrl(newFilters);
    },
    [filters, updateUrl]
  );

  /**
   * Set status filter.
   */
  const setStatus = useCallback(
    (status: UserFilters['status']) => {
      const newFilters = { ...filters, status, page: 1 };
      setFilters(newFilters);
      updateUrl(newFilters);
    },
    [filters, updateUrl]
  );

  /**
   * Set page number.
   */
  const setPage = useCallback(
    (page: number) => {
      const newFilters = { ...filters, page };
      setFilters(newFilters);
      updateUrl(newFilters);
    },
    [filters, updateUrl]
  );

  /**
   * Set items per page limit.
   */
  const setLimit = useCallback(
    (limit: number) => {
      const newFilters = { ...filters, limit, page: 1 };
      setFilters(newFilters);
      updateUrl(newFilters);
    },
    [filters, updateUrl]
  );

  /**
   * Reset all filters to defaults.
   */
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  /**
   * Check if any filters are active.
   */
  const hasActiveFilters = useMemo(
    () =>
      filters.search !== DEFAULT_FILTERS.search ||
      filters.role !== DEFAULT_FILTERS.role ||
      filters.status !== DEFAULT_FILTERS.status,
    [filters]
  );

  return {
    filters,
    setSearch,
    setRole,
    setStatus,
    setPage,
    setLimit,
    resetFilters,
    hasActiveFilters,
  };
}
