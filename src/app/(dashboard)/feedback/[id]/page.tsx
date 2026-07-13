"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Bug, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { Button } from "@/core/ui/button"
import { useAuth } from "@/core/hooks/useAuth"
import { feedbackPriorityConfig, feedbackStatusConfig, feedbackTypeConfig } from "@/lib/config/colors"
import { Chip } from "@/components/ui/chip"
import { useCreateFeedbackComment, useFeedback, useFeedbackTimeline } from "@/features/feedback/hooks/useFeedback"
import { FeedbackTimeline } from "@/features/feedback/components/feedback-timeline"
import { FeedbackCommentComposer } from "@/features/feedback/components/feedback-comment-composer"
import { FeedbackDevelopmentSidebar } from "@/features/feedback/components/feedback-development-sidebar"
import { FeedbackAgentActions } from "@/features/feedback/components/feedback-agent-actions"
import { FeedbackDevelopmentStatusBadge } from "@/features/feedback/components/feedback-development-status-badge"
import { useFeedbackRealtime } from "@/features/feedback/hooks/useFeedbackRealtime"
import { FeedbackAdminStatusControl } from "@/features/feedback/components/feedback-admin-status-control"

function stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export default function FeedbackDetailPage() {
    const params = useParams<{ id: string }>()
    const id = params.id
    const { isAdmin } = useAuth()
    useFeedbackRealtime(id)
    const feedbackQuery = useFeedback(id, { refetchInterval: 30000 })
    const timelineQuery = useFeedbackTimeline(id, { refetchInterval: 30000 })
    const commentMutation = useCreateFeedbackComment(id)

    async function handleComment(message: string) {
        await commentMutation.mutateAsync({ message })
        toast.success("Comentário publicado")
    }

    if (feedbackQuery.isLoading) {
        return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-white/60">Carregando feedback...</div>
    }

    if (feedbackQuery.error || !feedbackQuery.data) {
        return <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-8 text-red-100">Não foi possível carregar este feedback.</div>
    }

    const feedback = feedbackQuery.data
    const typeInfo = feedbackTypeConfig[feedback.type]
    const statusInfo = feedbackStatusConfig[feedback.status]
    const priorityInfo = feedback.priority ? feedbackPriorityConfig[feedback.priority] : null
    const TypeIcon = feedback.type === "bug" ? Bug : Sparkles

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                    <div>
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white">
                                <Link href="/feedback" aria-label="Voltar para feedbacks">
                                    <ArrowLeft className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Chip variant={feedback.type === "bug" ? "artifact" : "rare"} size="sm">
                                <TypeIcon className="mr-1 h-3 w-3" />
                                {typeInfo.label}
                            </Chip>
                            <Chip variant={statusInfo.color} size="sm">{statusInfo.label}</Chip>
                            {priorityInfo && <Chip variant={priorityInfo.color} size="sm">{priorityInfo.label}</Chip>}
                            <FeedbackDevelopmentStatusBadge status={feedback.developmentStatus} />
                        </div>
                        <h1 className="text-2xl font-bold text-white">{feedback.title}</h1>
                        <p className="mt-2 text-sm text-white/45">Criado por {feedback.creatorName}</p>
                    </div>
                </div>
            </div>

            <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <main className="min-w-0 space-y-5">
                    <GlassCard>
                        <GlassCardContent className="p-5">
                            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/35">Descrição original</h2>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/75">{stripHtml(feedback.description) || "Sem descrição."}</p>
                        </GlassCardContent>
                    </GlassCard>

                    <FeedbackTimeline events={timelineQuery.data ?? []} isLoading={timelineQuery.isLoading} />

                    {commentMutation.error && <p className="text-sm text-red-300">{commentMutation.error.message}</p>}
                    <FeedbackCommentComposer submitAction={handleComment} isSubmitting={commentMutation.isPending} />
                </main>

                <aside className="min-w-0">
                    <div className="space-y-4">
                        <FeedbackAgentActions feedback={feedback} isAdmin={isAdmin} />
                        <FeedbackAdminStatusControl feedback={feedback} isAdmin={isAdmin} />
                        <FeedbackDevelopmentSidebar feedback={feedback} />
                    </div>
                </aside>
            </div>
        </div>
    )
}
