'use client';

/**
 * @fileoverview TanStack Query hooks for audit logs data fetching.
 *
 * Provides:
 * - useAuditLogs: Fetches paginated audit logs with filters
 * - useRefreshAuditLogs: Invalidates audit logs cache
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useAuditLogs({ action: 'CREATE', page: 1 });
 * ```
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query"
import type { AuditLog, AuditAction } from '../types/audit.types';

/** Filter options for audit logs query */
export interface AuditLogsFilters {
    actions?: AuditAction[]
    entityTypes?: string[]
    actorEmail?: string
    startDate?: string
    endDate?: string
    page?: number
    limit?: number
}

/** Response shape from audit logs API */
export interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

async function fetchAuditLogs(filters: AuditLogsFilters): Promise<AuditLogsResponse> {
  const params = new URLSearchParams();
  
  if (filters.actions && filters.actions.length > 0) {
    filters.actions.forEach(action => params.append('action', action));
  }
  if (filters.entityTypes && filters.entityTypes.length > 0) {
      filters.entityTypes.forEach((type) => params.append("entityType", type))
  }
  if (filters.actorEmail) params.set('actorEmail', filters.actorEmail);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  
  const response = await fetch(`/api/audit-logs?${params.toString()}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Erro ao carregar logs de auditoria');
  }
  
  const result = await response.json()
  return {
      logs: result.data,
      pagination: result.pagination,
  }
}

export const auditLogKeys = {
    all: ["audit-logs"] as const,
    lists: () => [...auditLogKeys.all, "list"] as const,
    list: (filters: AuditLogsFilters) => [...auditLogKeys.lists(), filters] as const,
    infinite: (filters: Omit<AuditLogsFilters, "page">) => [...auditLogKeys.lists(), "infinite", filters] as const
}

export function useAuditLogs(filters: AuditLogsFilters = {}, options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: auditLogKeys.list(filters),
        queryFn: () => fetchAuditLogs(filters),
        staleTime: 30 * 1000, // 30 seconds
        refetchOnWindowFocus: false,
        ...options
    })
}

export function useInfiniteAuditLogs(filters: Omit<AuditLogsFilters, "page"> = {}, options?: { enabled?: boolean }) {
    return useInfiniteQuery<AuditLogsResponse, Error>({
        queryKey: auditLogKeys.infinite(filters),
        queryFn: ({ pageParam = 1 }) => fetchAuditLogs({ ...filters, page: pageParam as number }),
        getNextPageParam: (lastPage) => {
            return lastPage.pagination.page < lastPage.pagination.totalPages ? lastPage.pagination.page + 1 : undefined
        },
        initialPageParam: 1,
        ...options
    })
}

export function useRefreshAuditLogs() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
  };
}
