"use client"

import { toast } from "sonner"
import { GlassSelector } from "@/components/ui/glass-selector"
import { feedbackStatusConfig } from "@/lib/config/colors"
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

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-white/35">Status manual</label>
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
    )
}
