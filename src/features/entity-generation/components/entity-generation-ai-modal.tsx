"use client"

import * as React from "react"
import { Check, Loader2, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/core/utils"
import {
    GlassModal,
    GlassModalContent,
    GlassModalDescription,
    GlassModalFooter,
    GlassModalHeader,
    GlassModalTitle,
} from "@/components/ui/glass-modal"
import type { EntityGenerationProgress } from "../types/entity-generation.types"

export interface EntityGenerationAdapter<TEntity, TCandidate> {
    entityName: string
    getId: (entity: TEntity) => string
    getTitle: (entity: TEntity) => string
    getCandidateId: (candidate: TCandidate) => string
    getCandidateLabel: (candidate: TCandidate) => string
    streamUrl: (entity: TEntity) => string
    apply: (entity: TEntity, candidate: TCandidate) => Promise<unknown>
    renderComparison: (entity: TEntity, candidate: TCandidate) => React.ReactNode
}

interface EntityGenerationAIModalProps<TEntity, TCandidate> {
    open: boolean
    entity: TEntity | null
    adapter: EntityGenerationAdapter<TEntity, TCandidate>
    onOpenChange: (open: boolean) => void
    onApplied?: () => void
}

type Phase = "idle" | "loading" | "ready" | "saving" | "error"

export function EntityGenerationAIModal<TEntity, TCandidate>({ open, entity, adapter, onOpenChange, onApplied }: EntityGenerationAIModalProps<TEntity, TCandidate>) {
    const [phase, setPhase] = React.useState<Phase>("idle")
    const [progress, setProgress] = React.useState<EntityGenerationProgress>({ current: 0, total: 1, message: "Preparando geração..." })
    const [candidates, setCandidates] = React.useState<TCandidate[]>([])
    const [selectedId, setSelectedId] = React.useState<string | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const [entitySnapshot, setEntitySnapshot] = React.useState<TEntity | null>(null)

    const activeEntity = entity ?? entitySnapshot

    React.useEffect(() => {
        if (!open || !entity) return

        setEntitySnapshot(entity)
        setPhase("loading")
        setProgress({ current: 0, total: 1, message: "Buscando fonte de dados..." })
        setCandidates([])
        setSelectedId(null)
        setError(null)

        const source = new EventSource(adapter.streamUrl(entity))

        source.addEventListener("progress", (event) => {
            setProgress(JSON.parse((event as MessageEvent).data) as EntityGenerationProgress)
        })

        source.addEventListener("candidate", (event) => {
            const candidate = JSON.parse((event as MessageEvent).data) as TCandidate
            setCandidates((current) => {
                const next = [...current, candidate]
                if (next.length === 1) setSelectedId(adapter.getCandidateId(candidate))
                return next
            })
        })

        source.addEventListener("done", () => {
            setPhase("ready")
            source.close()
        })

        source.addEventListener("failure", (event) => {
            const raw = (event as MessageEvent).data
            setError(raw ? JSON.parse(raw).message : "Erro ao gerar dados com IA.")
            setPhase("error")
            source.close()
        })

        source.onerror = () => {
            setError("Conexão com a geração foi encerrada.")
            setPhase("error")
            source.close()
        }

        return () => source.close()
    }, [adapter, entity, open])

    React.useEffect(() => {
        if (open) return

        setPhase("idle")
        setProgress({ current: 0, total: 1, message: "Preparando geração..." })
        setCandidates([])
        setSelectedId(null)
        setError(null)
        setEntitySnapshot(null)
    }, [open])

    const selectedCandidate = React.useMemo(() => candidates.find((candidate) => adapter.getCandidateId(candidate) === selectedId) ?? null, [adapter, candidates, selectedId])
    const progressPercent = Math.min(100, Math.round((progress.current / Math.max(progress.total, 1)) * 100))

    const handleSave = async () => {
        if (!activeEntity || !selectedCandidate) return
        setPhase("saving")
        try {
            await adapter.apply(activeEntity, selectedCandidate)
            toast.success(`${adapter.entityName} atualizada com IA.`)
            onApplied?.()
            onOpenChange(false)
        } catch (error) {
            setError(error instanceof Error ? error.message : "Erro ao salvar geração com IA.")
            setPhase("ready")
        }
    }

    return (
        <GlassModal open={open} onOpenChange={onOpenChange}>
            <GlassModalContent size="full" className="max-w-6xl" bodyClassName="space-y-5">
                <GlassModalHeader className="pr-8">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-purple-300/30 bg-white/5">
                            <Sparkles className="h-4 w-4 text-purple-200" />
                        </span>
                        <div>
                            <GlassModalTitle>Gerar com IA</GlassModalTitle>
                            <GlassModalDescription>
                                {activeEntity ? `${adapter.entityName}: ${adapter.getTitle(activeEntity)}` : "Preparando entidade..."}
                            </GlassModalDescription>
                        </div>
                    </div>
                </GlassModalHeader>

                {(phase === "loading" || phase === "saving") && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-white/60">
                            <span>{phase === "saving" ? "Salvando alterações..." : progress.message}</span>
                            <span className="font-mono">{phase === "saving" ? "..." : `${progressPercent}%`}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10">
                            <div
                                className={cn(
                                    "h-full rounded-full bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400",
                                    "bg-[length:200%_100%] transition-all duration-500 animate-pulse",
                                )}
                                style={{ width: phase === "saving" ? "100%" : `${progressPercent}%` }}
                            />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                        {error}
                    </div>
                )}

                {phase === "ready" && candidates.length === 0 && !error && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/60">
                        Nenhuma correspondência foi encontrada na fonte de dados.
                    </div>
                )}

                {candidates.length > 0 && (
                    <div className="space-y-4">
                        {candidates.length > 1 && (
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {candidates.map((candidate) => {
                                    const id = adapter.getCandidateId(candidate)
                                    const selected = selectedId === id
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setSelectedId(id)}
                                            className={cn(
                                                "flex min-h-16 items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                                                selected
                                                    ? "border-emerald-300/60 bg-emerald-500/15 text-emerald-50"
                                                    : "border-white/10 bg-white/[0.03] text-white/45 hover:bg-white/[0.06]",
                                            )}
                                        >
                                            <span className="line-clamp-2">{adapter.getCandidateLabel(candidate)}</span>
                                            {selected && <Check className="h-4 w-4 shrink-0 text-emerald-300" />}
                                        </button>
                                    )
                                })}
                            </div>
                        )}

                        {activeEntity && selectedCandidate && adapter.renderComparison(activeEntity, selectedCandidate)}
                    </div>
                )}

                <GlassModalFooter>
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10"
                    >
                        <X className="h-4 w-4" />
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!selectedCandidate || phase === "loading" || phase === "saving"}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {phase === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Salvar
                    </button>
                </GlassModalFooter>
            </GlassModalContent>
        </GlassModal>
    )
}
