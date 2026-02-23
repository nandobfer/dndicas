"use client"

import { Suspense, useState } from "react"
import { motion } from "framer-motion"
import { Clock } from "lucide-react"
import { LoadingState } from "@/components/ui/loading-state"
import { ErrorState } from "@/components/ui/error-state"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { fade } from "@/lib/config/motion-configs"
import { AuditLogsFilters } from "@/features/users/components/audit-logs-filters"
import { AuditLogsTable } from "@/features/users/components/audit-logs-table"
import { AuditLogDetailModal } from "@/features/users/components/audit-log-detail-modal"
import { useAuditLogs } from "@/features/users/hooks/useAuditLogs"
import { useAuditLogsFilters } from "@/features/users/hooks/useAuditLogsFilters"
import type { AuditLog } from "@/features/users/types/audit.types"

function AuditLogsContent() {
    const { filters, setPage, setActions, setEntityTypes, setDateRange, resetFilters } = useAuditLogsFilters()
    const { data, isLoading, isError, refetch } = useAuditLogs(filters)
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)

    const handleRowClick = (log: AuditLog) => {
        setSelectedLog(log)
        setDialogOpen(true)
    }

    if (isError) {
        return <ErrorState title="Erro ao carregar logs" description="Não foi possível carregar os logs de auditoria." onRetry={() => refetch()} />
    }

    const logs = data?.logs || []
    const pagination = data?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 }

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
                        isLoading={isLoading}
                        onActionsChange={setActions}
                        onEntityTypesChange={setEntityTypes}
                        onDateRangeChange={setDateRange}
                        onReset={resetFilters}
                    />
                </GlassCardContent>
            </GlassCard>

            {/* Table */}
            <AuditLogsTable logs={logs} isLoading={isLoading} pagination={pagination} onPageChange={setPage} onRowClick={handleRowClick} />

            {/* Detail Modal with Diff View */}
            <AuditLogDetailModal log={selectedLog} open={dialogOpen} onOpenChange={setDialogOpen} />
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
