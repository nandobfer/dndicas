'use client';

/**
 * @fileoverview Audit logs table component with server-side pagination.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, User } from 'lucide-react';
import { cn } from '@/core/utils';
import { GlassCard, GlassCardContent } from '@/components/ui/glass-card';
import { ActionChip } from '@/components/ui/action-chip';
import { UserMini } from "@/components/ui/user-mini"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { DataTablePagination } from "@/components/ui/data-table-pagination"
import { motionConfig } from "@/lib/config/motion-configs"
import type { AuditLog } from "../types/audit.types"

interface AuditLogsTableProps {
    logs: AuditLog[]
    isLoading: boolean
    pagination: {
        total: number
        page: number
        limit: number
        totalPages: number
    }
    onPageChange: (page: number) => void
    onRowClick?: (log: AuditLog) => void
}

/**
 * Table header columns.
 */
const columns = [
    { key: "action", label: "Ação", className: "w-[15%]" },
    { key: "entity", label: "Entidade", className: "w-[20%]" },
    { key: "user", label: "Usuário", className: "w-[35%]" },
    { key: "date", label: "Data", className: "w-[30%]" },
]

function formatDate(date: Date | string | undefined | null): string {
    if (!date) return "Data indisponível"

    const d = new Date(date)

    // Check if date is valid (finite)
    if (isNaN(d.getTime())) {
        return "Data inválida"
    }

    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(d)
}

function formatEntityType(entityType: string): string {
    if (!entityType) return "Sistema"
    const labels: Record<string, string> = {
        User: "Usuário",
        Company: "Empresa",
        Organization: "Organização",
    }
    return labels[entityType] || entityType
}

export function AuditLogsTable({ logs, isLoading, pagination, onPageChange, onRowClick }: AuditLogsTableProps) {
    // Loading state
    if (isLoading && logs.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-12">
                    <LoadingState variant="skeleton" message="Carregando logs..." />
                </GlassCardContent>
            </GlassCard>
        )
    }

    // Empty state
    if (!isLoading && logs.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-12">
                    <EmptyState title="Nenhum log encontrado" description="Tente ajustar os filtros ou aguarde novas ações" icon={Clock} />
                </GlassCardContent>
            </GlassCard>
        )
    }

    return (
        <GlassCard>
            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    {/* Header */}
                    <thead>
                        <tr className="border-b border-white/10">
                            {columns.map((col) => (
                                <th key={col.key} className={cn("px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider", col.className)}>
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody className="divide-y divide-white/5">
                        <AnimatePresence mode="popLayout">
                            {logs.map((log, index) => (
                                <motion.tr
                                    key={log._id}
                                    variants={motionConfig.variants.tableRow}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    transition={{ delay: index * 0.05 }}
                                    className={cn("group transition-colors", onRowClick && "cursor-pointer hover:bg-white/5", isLoading && "opacity-50")}
                                    onClick={() => onRowClick?.(log)}
                                >
                                    {/* Action */}
                                    <td className="px-4 py-3">
                                        <ActionChip action={log.action} />
                                    </td>

                                    {/* Entity */}
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-white">{formatEntityType(log.entity)}</span>
                                            <span className="text-xs text-white/40 font-mono truncate max-w-[120px]">{log.entityId}</span>
                                        </div>
                                    </td>

                                    {/* User */}
                                    <td className="px-4 py-3">
                                        {log.performedByUser?.username ? (
                                            <UserMini
                                                name={log.performedByUser.name}
                                                username={log.performedByUser.username}
                                                email={log.performedByUser.email}
                                                avatarUrl={log.performedByUser.avatarUrl}
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                                    <User className="h-4 w-4 text-white/40" />
                                                </div>
                                                <span className="text-sm font-medium text-white/40">Sistema</span>
                                            </div>
                                        )}
                                    </td>

                                    {/* Date */}
                                    <td className="px-4 py-3 text-sm text-white/60">{formatDate((log as any).createdAt || (log as any).timestamp)}</td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <DataTablePagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onPageChange={onPageChange} itemLabel="logs" />
        </GlassCard>
    )
}

AuditLogsTable.displayName = 'AuditLogsTable';
