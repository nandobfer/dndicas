"use client"

import { toast } from "sonner"
import { GlassSelector } from "@/components/ui/glass-selector"
import { feedbackPriorityConfig, feedbackStatusConfig } from "@/lib/config/colors"
import { useUpdateFeedback } from "../hooks/useFeedback"
import type { Feedback } from "../types/feedback.types"

export function FeedbackAdminStatusControl({ feedback, isAdmin }: { feedback: Feedback; isAdmin: boolean }) {
    const updateFeedback = useUpdateFeedback()

    if (!isAdmin) return null

    async function handleStatusChange(value: string | string[]) {
        if (Array.isArray(value)) return
        if (value === feedback.status) return

        try {
            await updateFeedback.mutateAsync({
                id: feedback.id,
                data: { status: value as Feedback["status"] },
            })
            toast.success("Status atualizado")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o status")
        }
    }

    async function handlePriorityChange(value: string | string[]) {
        if (Array.isArray(value)) return
        if (value === feedback.priority) return

        try {
            await updateFeedback.mutateAsync({
                id: feedback.id,
                data: { priority: value as Feedback["priority"] },
            })
            toast.success("Prioridade atualizada")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a prioridade")
        }
    }

    return (
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35">Status</label>
                <GlassSelector
                    value={feedback.status}
                    onChange={handleStatusChange}
                    options={Object.entries(feedbackStatusConfig).map(([key, config]) => ({
                        value: key,
                        label: config.label,
                        activeColor: config.badge,
                    }))}
                    disabled={updateFeedback.isPending}
                    fullWidth
                    layoutId={`feedback-detail-status-${feedback.id}`}
                />
            </div>

            <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-white/35">Prioridade</label>
                <GlassSelector
                    value={feedback.priority || ""}
                    onChange={handlePriorityChange}
                    options={Object.entries(feedbackPriorityConfig).map(([key, config]) => ({
                        value: key,
                        label: config.label,
                        activeColor: config.badge,
                    }))}
                    disabled={updateFeedback.isPending}
                    fullWidth
                    layoutId={`feedback-detail-priority-${feedback.id}`}
                />
            </div>
        </div>
    )
}
