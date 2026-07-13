"use client"

import * as React from "react"
import { Bot, Loader2 } from "lucide-react"
import { Button } from "@/core/ui/button"
import { Textarea } from "@/core/ui/textarea"
import type { Feedback } from "../types/feedback.types"
import { useApproveFeedback, useQueueFeedbackImplementation, useQueueFeedbackIteration, useQueueFeedbackPlan } from "../hooks/useFeedback"
import { FeedbackOpenCodeModelSelect } from "./feedback-opencode-model-select"

export function FeedbackAgentActions({ feedback, isAdmin }: { feedback: Feedback; isAdmin?: boolean }) {
    const [model, setModel] = React.useState(feedback.selectedModel ?? "")
    const [message, setMessage] = React.useState("")
    const queuePlan = useQueueFeedbackPlan(feedback.id)
    const queueImplementation = useQueueFeedbackImplementation(feedback.id)
    const queueIteration = useQueueFeedbackIteration(feedback.id)
    const approveFeedback = useApproveFeedback(feedback.id)

    if (!isAdmin) return null

    const canRequestPlan = ["aberto", "plano_pronto", "falhou"].includes(feedback.developmentStatus ?? "aberto")
    const canImplement = ["plano_pronto", "falhou"].includes(feedback.developmentStatus ?? "aberto")
    const canIterate = ["aguardando_teste", "ajustes_solicitados", "falhou"].includes(feedback.developmentStatus ?? "aberto") && Boolean(feedback.pullRequestUrl)
    const canApprove = feedback.developmentStatus === "aguardando_teste" && Boolean(feedback.pullRequestNumber)
    const isBusy = queuePlan.isPending || queueImplementation.isPending || queueIteration.isPending || approveFeedback.isPending

    async function handlePlan() {
        if (!model) return
        await queuePlan.mutateAsync({ model, message: message.trim() || undefined })
        setMessage("")
    }

    async function handleImplementation() {
        if (!model) return
        await queueImplementation.mutateAsync({ model, message: message.trim() || undefined })
        setMessage("")
    }

    async function handleIteration() {
        if (!model || !message.trim()) return
        await queueIteration.mutateAsync({ model, message: message.trim() })
        setMessage("")
    }

    return (
        <div className="space-y-4 rounded-xl border border-blue-400/20 bg-blue-500/10 p-4">
            <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                    <Bot className="h-4 w-4 text-blue-300" />
                    Desenvolvimento agêntico
                </h3>
                <p className="mt-1 text-xs text-white/50">Escolha o modelo e solicite o plano. O worker manual processa a fila com OpenCode real.</p>
            </div>

            <FeedbackOpenCodeModelSelect value={model} changeAction={setModel} disabled={isBusy} />

            <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Mensagem opcional para orientar o plano..."
                className="min-h-[90px] border-white/10 bg-white/5 text-white placeholder:text-white/30"
                disabled={isBusy}
            />

            {(queuePlan.error || queueImplementation.error || queueIteration.error || approveFeedback.error) && (
                <p className="text-xs text-red-300">{queuePlan.error?.message || queueImplementation.error?.message || queueIteration.error?.message || approveFeedback.error?.message}</p>
            )}

            <Button type="button" onClick={handlePlan} disabled={!canRequestPlan || !model || isBusy} className="w-full bg-blue-600 text-white hover:bg-blue-700">
                {queuePlan.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar plano
            </Button>

            <Button type="button" onClick={handleImplementation} disabled={!canImplement || !model || isBusy} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                {queueImplementation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Implementar em PR
            </Button>

            <Button type="button" onClick={handleIteration} disabled={!canIterate || !model || !message.trim() || isBusy} className="w-full bg-amber-600 text-white hover:bg-amber-700">
                {queueIteration.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Solicitar nova iteração
            </Button>

            <Button type="button" onClick={() => approveFeedback.mutate()} disabled={!canApprove || isBusy} className="w-full bg-purple-600 text-white hover:bg-purple-700">
                {approveFeedback.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Aprovar e fazer merge
            </Button>

            {!canRequestPlan && <p className="text-xs text-amber-200/80">O status atual não permite solicitar um novo plano.</p>}
        </div>
    )
}
