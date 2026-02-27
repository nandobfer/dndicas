"use client";

import { MessageSquare, Calendar, User as UserIcon, Bug, Sparkles, AlertCircle, CheckCircle2, XCircle, Pencil } from "lucide-react"
import { Chip } from "@/components/ui/chip"
import { cn } from "@/core/utils"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { motion } from "framer-motion"
import { useFeedbackPermissions } from "../hooks/use-feedback-permissions"
import { feedbackStatusConfig, feedbackTypeConfig, feedbackPriorityConfig, FeedbackStatus, FeedbackPriority, FeedbackType, rarityToTailwind } from "@/lib/config/colors"
import type { Feedback } from "../types/feedback.types"

export interface FeedbackCardProps {
    feedback: Feedback
    showStatus?: boolean
    onEdit?: (item: Feedback) => void
}

const statusIcons = {
    pendente: AlertCircle,
    concluido: CheckCircle2,
    cancelado: XCircle,
}

/**
 * Common Feedback Card component used in the mobile list view.
 * Styled to match the entity previews while being specialized for feedback data.
 */
export function FeedbackCard({ feedback, onEdit }: FeedbackCardProps) {
    const { canEdit } = useFeedbackPermissions(feedback)
    const statusInfo = feedbackStatusConfig[feedback.status as FeedbackStatus]
    const typeInfo = feedbackTypeConfig[feedback.type as FeedbackType]
    const priorityInfo = feedback.priority ? feedbackPriorityConfig[feedback.priority as FeedbackPriority] : null

    const TypeIcon = feedback.type === "bug" ? Bug : Sparkles
    const StatusIcon = statusInfo ? statusIcons[feedback.status as keyof typeof statusIcons] : AlertCircle
    const statusStyles = statusInfo ? rarityToTailwind[statusInfo.color] : null

    return (
        <div className="space-y-4 w-full relative">
            {/* Header: Identity + Role/Status */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                        className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0 overflow-hidden bg-white/5",
                            feedback.type === "bug" ? "border-red-500/30" : "border-blue-500/30",
                        )}
                    >
                        <TypeIcon className={cn("h-5 w-5", feedback.type === "bug" ? "text-red-400" : "text-blue-400")} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-white leading-tight break-words">{feedback.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <Chip variant={feedback.type === "bug" ? "artifact" : "rare"} size="sm">
                                {typeInfo.label}
                            </Chip>
                            {priorityInfo && (
                                <Chip variant={priorityInfo.color as any} size="sm">
                                    {priorityInfo.label}
                                </Chip>
                            )}
                        </div>
                    </div>
                </div>

                {/* Edit Action Button */}
                {canEdit && onEdit && (
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onEdit(feedback)}
                        className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        title="Editar / Ver Detalhes"
                    >
                        <Pencil className="h-4 w-4" />
                    </motion.button>
                )}
            </div>

            {/* Properties: Description & Creator */}
            <div className="space-y-2 pb-2 border-b border-white/5">
                <div className="text-xs text-white/70 line-clamp-3 prose prose-invert prose-xs" dangerouslySetInnerHTML={{ __html: feedback.description }} />

                <div className="flex items-center gap-2 pt-2 text-[10px] font-bold text-white/30 uppercase tracking-widest">
                    <UserIcon className="h-3 w-3" />
                    <span>Enviado por: {feedback.creatorName}</span>
                </div>
            </div>

            {/* Timestamps & Status */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-2">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-white/40">
                    <Calendar className="w-3 h-3" />
                    <span>
                        Atualizado em: <span className="text-white/60">{format(new Date(feedback.updatedAt), "dd MMM yyyy", { locale: ptBR })}</span>
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                    {statusInfo && statusStyles && (
                        <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-white/5", statusStyles.bg, statusStyles.border)}>
                            <StatusIcon className={cn("h-3 w-3", statusStyles.text)} />
                            <span className={cn("text-[9px] font-bold uppercase tracking-tighter", statusStyles.text)}>{statusInfo.label}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
