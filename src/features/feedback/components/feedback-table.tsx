"use client";

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreHorizontal, Pencil, MessageSquare, AlertCircle, CheckCircle2, XCircle, Bug, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/core/utils';
import { GlassCard, GlassCardContent } from '@/components/ui/glass-card';
import { Chip } from '@/components/ui/chip';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { GlassDropdownMenu, GlassDropdownMenuTrigger, GlassDropdownMenuContent, GlassDropdownMenuItem } from '@/components/ui/glass-dropdown-menu';
import { motionConfig } from '@/lib/config/motion-configs';
import { feedbackStatusConfig, feedbackTypeConfig, feedbackPriorityConfig, FeedbackStatus, FeedbackPriority, FeedbackType } from '@/lib/config/colors';
import type { Feedback } from '../types/feedback.types';

export interface FeedbackTableProps {
    feedbacks: Feedback[];
    total: number;
    page: number;
    limit: number;
    isLoading?: boolean;
    onEdit: (feedback: Feedback) => void;
    onPageChange: (page: number) => void;
}

const columns = [
    { key: "status", label: "Status", className: "w-[120px]" },
    { key: "type", label: "Tipo", className: "w-[120px]" },
    { key: "title", label: "Título", className: "w-full pl-0" },
    { key: "priority", label: "Prioridade", className: "w-[120px]" },
    { key: "updatedAt", label: "Última Atualização", className: "w-[180px] text-right" },
    { key: "actions", label: "", className: "w-[80px] text-right" },
]

export function FeedbackTable({ feedbacks, total, page, limit, isLoading = false, onEdit, onPageChange }: FeedbackTableProps) {
    const totalPages = Math.ceil(total / limit)

    if (isLoading && feedbacks.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-12">
                    <LoadingState variant="skeleton" message="Carregando feedbacks..." />
                </GlassCardContent>
            </GlassCard>
        )
    }

    if (!isLoading && feedbacks.length === 0) {
        return (
            <GlassCard>
                <GlassCardContent className="py-12">
                    <EmptyState 
                        title="Nenhum feedback encontrado" 
                        description="Tente ajustar os filtros ou envie um novo feedback" 
                        icon={MessageSquare} 
                    />
                </GlassCardContent>
            </GlassCard>
        )
    }

    return (
        <GlassCard>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className={cn(
                                        "px-4 py-3 text-left text-xs font-medium text-white/50 uppercase tracking-wider", 
                                        col.className
                                    )}
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-white/5">
                        <AnimatePresence mode="popLayout" initial={false}>
                            {feedbacks.map((feedback, index) => {
                                const statusInfo = feedbackStatusConfig[feedback.status as FeedbackStatus];
                                const typeInfo = feedbackTypeConfig[feedback.type as FeedbackType];
                                const priorityInfo = feedback.priority ? feedbackPriorityConfig[feedback.priority as FeedbackPriority] : null;

                                return (
                                    <motion.tr
                                        key={feedback.id}
                                        variants={motionConfig.variants.tableRow}
                                        initial="initial"
                                        animate="animate"
                                        exit="exit"
                                        transition={{ delay: index * 0.05 }}
                                        className={cn("group transition-colors hover:bg-white/5", isLoading && "opacity-50")}
                                    >
                                        <td className="px-4 py-3">
                                            <Chip variant={statusInfo?.color as any} size="sm">
                                                {statusInfo?.label}
                                            </Chip>
                                        </td>

                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                {feedback.type === 'bug' ? (
                                                    <Bug className="h-3 w-3 text-red-400 opacity-70" />
                                                ) : (
                                                    <Sparkles className="h-3 w-3 text-blue-400 opacity-70" />
                                                )}
                                                <span className={cn(
                                                    "text-[10px] font-bold uppercase tracking-tight",
                                                    feedback.type === 'bug' ? "text-red-400" : "text-blue-400"
                                                )}>
                                                    {typeInfo?.label}
                                                </span>
                                            </div>
                                        </td>

                                        <td className="py-3 pl-0 truncate max-w-[300px]">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-white truncate">{feedback.title}</span>
                                                <span className="text-[10px] text-white/30 truncate">por {feedback.creatorName}</span>
                                            </div>
                                        </td>

                                        <td className="px-4 py-3">
                                            {priorityInfo ? (
                                                <Chip variant={priorityInfo.color as any} size="sm">
                                                    {priorityInfo.label}
                                                </Chip>
                                            ) : (
                                                <span className="text-white/20 text-[10px] italic">Não definida</span>
                                            )}
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            <span className="text-[10px] text-white/40 tabular-nums">
                                                {format(new Date(feedback.updatedAt), "dd/MM HH:mm", { locale: ptBR })}
                                            </span>
                                        </td>

                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => onEdit(feedback)}
                                                className={cn(
                                                    "p-2 rounded-lg transition-colors inline-flex items-center gap-2",
                                                    "text-white/40 hover:text-white hover:bg-white/10",
                                                    "group-hover:opacity-100 focus:opacity-100"
                                                )}
                                                aria-label="Ver e editar feedback"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            <DataTablePagination 
                page={page} 
                totalPages={totalPages} 
                total={total} 
                limit={limit} 
                onPageChange={onPageChange} 
                itemLabel="feedbacks" 
            />
        </GlassCard>
    )
}
