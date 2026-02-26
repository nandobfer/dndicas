"use client";

import * as React from 'react';
import { useAuditLogs, useInfiniteAuditLogs } from './useAuditLogs';
import { useAuditLogsFilters } from './useAuditLogsFilters';
import { useIsMobile } from '@/core/hooks/useMediaQuery';
import type { AuditLog } from '../types/audit.types';

/**
 * Hook for logic of the Audit Logs page, featuring responsive data fetching 
 * (Query for desktop/Table, InfiniteQuery for mobile/List).
 */
export function useAuditLogsPage() {
    const isMobile = useIsMobile();
    const { 
        filters, 
        setPage, 
        setActions, 
        setEntityTypes, 
        setDateRange, 
        resetFilters 
    } = useAuditLogsFilters();

    /**
     * Data Fetching
     * Uses regular query for desktop table and infinite query for mobile list.
     */
    
    // Desktop View Data
    const desktopData = useAuditLogs({
        ...filters,
    }, { enabled: !isMobile });

    // Mobile View Data
    // Omit page from filters for infinite query
    const { page: _, ...infiniteFilters } = filters;
    const mobileData = useInfiniteAuditLogs(infiniteFilters, { enabled: isMobile });

    // UI state
    const [selectedLog, setSelectedLog] = React.useState<AuditLog | null>(null);
    const [isDetailOpen, setIsDetailOpen] = React.useState(false);

    // Handlers
    const handleLogClick = (log: AuditLog) => {
        setSelectedLog(log);
        setIsDetailOpen(true);
    };

    return {
        isMobile,
        filters,
        pagination: {
            page: filters.page || 1,
            setPage,
            total: desktopData.data?.pagination.total || 0,
            limit: filters.limit || 10,
            totalPages: desktopData.data?.pagination.totalPages || 0,
        },
        data: {
            desktop: {
                items: desktopData.data?.logs || [],
                isLoading: desktopData.isLoading,
                isFetching: desktopData.isFetching,
                isError: desktopData.isError,
                refetch: desktopData.refetch,
            },
            mobile: {
                items: mobileData.data?.pages.flatMap(p => p.logs) || [],
                isLoading: mobileData.isLoading,
                isFetchingNextPage: mobileData.isFetchingNextPage,
                hasNextPage: !!mobileData.hasNextPage,
                fetchNextPage: mobileData.fetchNextPage,
                isError: mobileData.isError,
                refetch: mobileData.refetch,
            }
        },
        actions: {
            setActions,
            setEntityTypes,
            setDateRange,
            resetFilters,
            handleLogClick,
        },
        modals: {
            isDetailOpen,
            setIsDetailOpen,
            selectedLog,
        }
    };
}
