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

import { useQuery, useQueryClient } from '@tanstack/react-query';
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

export function useAuditLogs(filters: AuditLogsFilters = {}) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => fetchAuditLogs(filters),
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });
}

export function useRefreshAuditLogs() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
  };
}
