'use client';

/**
 * @fileoverview Audit logs table component with server-side pagination.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, User, Copy, Check } from "lucide-react"
import { cn } from "@/core/utils"
import { toast } from "sonner"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { ActionChip } from "@/components/ui/action-chip"
import { UserMini } from "@/components/ui/user-mini"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/core/ui/skeleton"
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
    { key: "entity", label: "Entidade", className: "w-[30%]" },
    { key: "user", label: "Autor", className: "w-[35%]" },
    { key: "date", label: "Data", className: "w-[20%] text-right" },
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
        Rule: "Regra",
        Reference: "Regra",
        Trait: "Habilidade", // T046: Added Trait entity type mapping
    }
    return labels[entityType] || entityType
}

export function AuditLogsTable({ logs, isLoading, pagination, onPageChange, onRowClick }: AuditLogsTableProps) {
    const { limit = 10 } = pagination

    // Loading state with skeleton table
    if (isLoading && logs.length === 0) {
        return (
            <GlassCard>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10">
                                {columns.map((col) => (
                                    <th
                                        key={col.key}
                                        className={cn("px-4 py-3 text-xs font-medium text-white/50 uppercase tracking-wider", !col.className?.includes("text-right") && "text-left", col.className)}
                                    >
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[...Array(limit)].map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    {/* Action */}
                                    <td className="px-4 py-4">
                                        <Skeleton className="h-6 w-20 rounded-full" />
                                    </td>
                                    {/* Entity */}
                                    <td className="px-4 py-4">
                                        <div className="space-y-2">
                                            <Skeleton className="h-4 w-24" />
                                            <Skeleton className="h-3 w-48 opacity-50" />
                                        </div>
                                    </td>
                                    {/* Author */}
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="h-8 w-8 rounded-full" />
                                            <div className="space-y-2">
                                                <Skeleton className="h-4 w-32" />
                                                <Skeleton className="h-3 w-20 opacity-50" />
                                            </div>
                                        </div>
                                    </td>
                                    {/* Date */}
                                    <td className="px-4 py-4 text-right">
                                        <Skeleton className="h-4 w-32 ml-auto" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
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
                                <th
                                    key={col.key}
                                    className={cn(
                                        "px-4 py-3 text-xs font-medium text-white/50 uppercase tracking-wider",
                                        !col.className?.includes("text-right") && "text-left",
                                        col.className,
                                    )}
                                >
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
                                    className={cn(
                                        "group transition-colors",
                                        onRowClick && "cursor-pointer hover:bg-white/5",
                                        isLoading && "opacity-50",
                                    )}
                                    onClick={() => onRowClick?.(log)}
                                >
                                    {/* Action */}
                                    <td className="px-4 py-3">
                                        <ActionChip action={log.action} />
                                    </td>

                                    {/* Entity */}
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm font-medium text-white">{formatEntityType(log.entity)}</span>
                                            <div className="flex items-center gap-2 group/id">
                                                <span className="text-[10px] text-white/40 font-mono tracking-tight">{log.entityId}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        navigator.clipboard.writeText(log.entityId)
                                                        toast.success("ID copiado com sucesso!")
                                                    }}
                                                    className="opacity-0 group-hover/id:opacity-100 p-1 rounded-md bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                                                    title="Copiar ID"
                                                >
                                                    <Copy className="h-2.5 w-2.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </td>

                                    {/* User (Author) */}
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
                                    <td className="px-4 py-3 text-sm text-white/60 text-right whitespace-nowrap">{formatDate(log.createdAt)}</td>
                                </motion.tr>
                            ))}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <DataTablePagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                limit={pagination.limit}
                onPageChange={onPageChange}
                itemLabel="logs"
            />
        </GlassCard>
    )
}

AuditLogsTable.displayName = 'AuditLogsTable';
