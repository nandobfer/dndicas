'use client';

/**
 * @fileoverview Filter state management hook for audit logs.
 * Synchronizes filter state with URL search params for shareable URLs.
 *
 * Features:
 * - URL-synced filter state
 * - Auto-reset to page 1 on filter change
 * - Individual setters for each filter type
 *
 * @example
 * ```tsx
 * const { filters, setAction, setPage, resetFilters } = useAuditLogsFilters();
 * ```
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { AuditAction } from '../types/audit.types';

export interface AuditLogsFilterState {
  action?: AuditAction;
  entityType?: string;
  actorEmail?: string;
  startDate?: string;
  endDate?: string;
  page: number;
  limit: number;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_PAGE = 1;

export function useAuditLogsFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: AuditLogsFilterState = useMemo(() => ({
    action: (searchParams.get('action') as AuditAction) || undefined,
    entityType: searchParams.get('entityType') || undefined,
    actorEmail: searchParams.get('actorEmail') || undefined,
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
    page: Number(searchParams.get('page')) || DEFAULT_PAGE,
    limit: Number(searchParams.get('limit')) || DEFAULT_LIMIT,
  }), [searchParams]);

  const setFilters = useCallback((updates: Partial<AuditLogsFilterState>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    // Reset to page 1 when changing filters (except when changing page itself)
    if (!('page' in updates)) {
      params.set('page', '1');
    }

    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === '' || value === null) {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    router.push(`${pathname}?${params.toString()}`);
  }, [searchParams, router, pathname]);

  const setPage = useCallback((page: number) => {
    setFilters({ page });
  }, [setFilters]);

  const setAction = useCallback((action: AuditAction | undefined) => {
    setFilters({ action });
  }, [setFilters]);

  const setEntityType = useCallback((entityType: string | undefined) => {
    setFilters({ entityType });
  }, [setFilters]);

  const setActorEmail = useCallback((actorEmail: string | undefined) => {
    setFilters({ actorEmail });
  }, [setFilters]);

  const setDateRange = useCallback((startDate?: string, endDate?: string) => {
    setFilters({ startDate, endDate });
  }, [setFilters]);

  const resetFilters = useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  return {
    filters,
    setFilters,
    setPage,
    setAction,
    setEntityType,
    setActorEmail,
    setDateRange,
    resetFilters,
  };
}
