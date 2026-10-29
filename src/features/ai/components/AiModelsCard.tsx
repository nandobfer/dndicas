"use client"

import { useMemo, useState } from "react"
import Fuse from "fuse.js"
import { motion } from "framer-motion"
import { Cpu, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Input } from "@/components/ui/opex/input"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { usePageVirtualizer } from "@/hooks/usePageVirtualizer"
import { apiErrorMessage } from "@/lib/api"
import type { AiModelDto, AiProviderId } from "@/lib/ai/providers"
import { useAiModels, useRefreshAiModels } from "../hooks/useAi"

const ROW_HEIGHT = 52

/** Modelos disponíveis no provedor (somente leitura, com busca). Lista longa: virtualizada. */
export function AiModelsCard({ provider, dirty }: { provider: AiProviderId; dirty: boolean }) {
    const models = useAiModels(provider, !dirty)
    const refresh = useRefreshAiModels(provider)
    const [term, setTerm] = useState("")
    const fuse = useMemo(() => new Fuse(models.data ?? [], { keys: ["name", "id", "group"], threshold: 0.35, ignoreLocation: true }), [models.data])
    const visible = term.trim() ? fuse.search(term.trim()).map((result) => result.item) : (models.data ?? [])
    const { anchorRef, items, padTop, padBottom } = usePageVirtualizer({ count: visible.length, estimateSize: ROW_HEIGHT })

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Modelos disponíveis{models.data ? <span className="ml-2 font-mono text-xs text-muted-foreground">{models.data.length}</span> : null}</CardTitle>
                    <CardDescription>Os modelos são escolhidos em cada feature (aba da página Provedores de IA).</CardDescription>
                </div>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void refresh()} disabled={dirty || models.isFetching}>
                    <motion.span animate={{ rotate: models.isFetching ? 360 : 0 }} transition={models.isFetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </CardHeader>
            <CardContent className="space-y-3 p-6 pt-0">
                {dirty ? (
                    <p className="text-sm text-muted-foreground">Salve as alterações para listar os modelos com a nova configuração.</p>
                ) : models.isLoading ? (
                    <Skeleton className="h-40 w-full" />
                ) : models.isError ? (
                    <ErrorState title="Não foi possível listar os modelos" description={apiErrorMessage(models.error, "Confira a configuração e teste a conexão.")} onRetry={() => void models.refetch()} />
                ) : (models.data ?? []).length === 0 ? (
                    <EmptyState icon={Cpu} title="Nenhum modelo disponível" description="Conecte um provedor ou habilite modelos no serviço." />
                ) : (
                    <>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar modelo" aria-label="Buscar modelo" className="pl-9" />
                        </div>
                        <div ref={anchorRef} className="rounded-md border" role="list" aria-label="Modelos">
                            {visible.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nenhum modelo encontrado</p>}
                            <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
                                {items.map((item) => {
                                    const model = visible[item.index]
                                    if (!model) return null
                                    return <ModelRow key={model.id} model={model} />
                                })}
                            </div>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}

function ModelRow({ model }: { model: AiModelDto }) {
    return (
        <div role="listitem" className="flex items-center gap-3 border-b px-3 last:border-b-0" style={{ height: ROW_HEIGHT }}>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{model.name}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{model.id}</span>
            </span>
            {model.variants.length > 0 && <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{model.variants.join(" · ")}</span>}
            {model.contextWindow && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{Math.round(model.contextWindow / 1000)}k</span>}
            {model.free && <span className="shrink-0 rounded bg-primary/15 px-1.5 text-[10px] font-medium text-primary">grátis</span>}
        </div>
    )
}
