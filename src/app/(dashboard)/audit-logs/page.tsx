"use client"

import { Suspense } from "react"
import { motion } from "framer-motion"
import { Clock } from "lucide-react"
import { LoadingState } from "@/components/ui/loading-state"
import { ErrorState } from "@/components/ui/error-state"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { fade } from "@/lib/config/motion-configs"
import { AuditLogsFilters } from "@/features/users/components/audit-logs-filters"
import { AuditLogsTable } from "@/features/users/components/audit-logs-table"
import { AuditLogList } from "@/features/users/components/audit-log-list"
import { AuditLogDetailModal } from "@/features/users/components/audit-log-detail-modal"
import { useAuditLogsPage } from "@/features/users/hooks/useAuditLogsPage"

function AuditLogsContent() {
    const { isMobile, filters, pagination, data, actions, modals } = useAuditLogsPage()

    const activeData = isMobile ? data.mobile : data.desktop

    if (activeData.isError) {
        return (
            <ErrorState
                title="Erro ao carregar logs"
                description="Não foi possível carregar os logs de auditoria."
                onRetry={() => activeData.refetch()}
            />
        )
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <motion.div {...fade}>
                <div className="flex items-center gap-3 mb-2">
                    <Clock className="h-6 w-6 text-purple-400" />
                    <h1 className="text-2xl font-bold text-foreground">Logs de Auditoria</h1>
                </div>
                <p className="text-muted-foreground">Visualize todas as ações realizadas no sistema</p>
            </motion.div>

            {/* Filters */}
            <GlassCard>
                <GlassCardContent className="py-4">
                    <AuditLogsFilters
                        filters={filters}
                        isLoading={activeData.isLoading}
                        onActionsChange={actions.setActions}
                        onEntityTypesChange={actions.setEntityTypes}
                        onDateRangeChange={actions.setDateRange}
                        onReset={actions.resetFilters}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Content: Table for Desktop, List for Mobile */}
            {isMobile ? (
                <AuditLogList
                    items={data.mobile.items}
                    isLoading={data.mobile.isLoading}
                    hasNextPage={data.mobile.hasNextPage}
                    isFetchingNextPage={data.mobile.isFetchingNextPage}
                    onLoadMore={data.mobile.fetchNextPage}
                    onLogClick={actions.handleLogClick}
                />
            ) : (
                <AuditLogsTable
                    logs={data.desktop.items}
                    isLoading={data.desktop.isLoading}
                    pagination={pagination}
                    onPageChange={pagination.setPage}
                    onRowClick={actions.handleLogClick}
                />
            )}

            {/* Detail Modal with Diff View */}
            <AuditLogDetailModal log={modals.selectedLog} open={modals.isDetailOpen} onOpenChange={modals.setIsDetailOpen} />
        </div>
    )
}

export default function AuditLogsPage() {
    return (
        <Suspense fallback={<LoadingState variant="spinner" message="Carregando..." />}>
            <AuditLogsContent />
        </Suspense>
    )
}
