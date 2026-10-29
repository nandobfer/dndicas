"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Bot, Brain, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { IconAction } from "@/components/ui/opex/icon-action"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { listItem } from "@/components/motion/presets"
import { cn } from "@/lib/utils"
import { PENDING_PREFIX, useMemories, type MemorySource } from "../../hooks/useMemories"
import type { MemoryDto } from "../../types"
import { MemoryEditor } from "./MemoryEditor"

interface MemoryListProps {
    source: MemorySource
    /** Sem edição: a lista fica somente leitura (sem adicionar, editar ou excluir). */
    canEdit: boolean
    /** Sem "Nova memória" (lista em que só o agente cria). */
    canCreate?: boolean
    emptyTitle: string
    emptyDescription?: string
    className?: string
}

const expand = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Lista compacta de memórias de um agente: cada linha mostra o resumo de uma linha; clicar expande o
 * texto completo. Editar e criar passam pelo uso "Resumo de memórias" (formata o texto e gera o
 * resumo); enquanto ele trabalha, a linha mostra o resumo carregando. Copiada do Ciliar.
 */
export function MemoryList({ source, canEdit, canCreate = true, emptyTitle, emptyDescription, className }: MemoryListProps) {
    const { query, memories, mutate } = useMemories(source)
    const [openId, setOpenId] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [deleting, setDeleting] = useState<MemoryDto | null>(null)

    if (query.isLoading) return <Skeleton className="h-32 w-full" />
    if (query.isError) return <ErrorState title="Não foi possível carregar as memórias" onRetry={() => void query.refetch()} />

    return (
        <div className={cn("flex flex-col gap-3", className)}>
            {canEdit && canCreate && (
                <AnimatePresence initial={false} mode="wait">
                    {creating ? (
                        <motion.div key="editor" {...expand} className="overflow-hidden">
                            <MemoryEditor
                                label="Nova memória"
                                onCancel={() => setCreating(false)}
                                onSave={(texto) => {
                                    mutate({ type: "create", texto })
                                    setCreating(false)
                                }}
                            />
                        </motion.div>
                    ) : (
                        <motion.div key="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
                                <Plus className="h-4 w-4" aria-hidden /> Nova memória
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            )}

            {memories.length === 0 && !creating ? (
                <EmptyState icon={Brain} title={emptyTitle} description={emptyDescription} />
            ) : (
                <ul className="flex flex-col divide-y rounded-lg border" aria-label="Memórias">
                    <AnimatePresence initial={false}>
                        {memories.map((memory) => {
                            const pending = memory.id.startsWith(PENDING_PREFIX) || !memory.resumo
                            const open = openId === memory.id
                            return (
                                <motion.li key={memory.id} variants={listItem} initial="hidden" animate="visible" exit="exit" className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpenId(open ? null : memory.id)}>
                                            {memory.origem === "agente" ? (
                                                <Bot className="h-4 w-4 shrink-0 text-primary" aria-label="Registrada pelo agente" />
                                            ) : (
                                                <Brain className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                            )}
                                            {pending ? (
                                                <span className="flex flex-1 items-center gap-2" aria-label="Resumindo a memória">
                                                    <Skeleton className="h-4 w-2/3" />
                                                </span>
                                            ) : (
                                                <span className="min-w-0 flex-1 truncate text-sm" title={memory.resumo}>
                                                    {memory.resumo}
                                                </span>
                                            )}
                                            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-muted-foreground">
                                                <ChevronDown className="h-4 w-4" aria-hidden />
                                            </motion.span>
                                        </button>
                                        {canEdit && !pending && (
                                            <div className="flex shrink-0 items-center">
                                                <IconAction
                                                    icon={Pencil}
                                                    label="Editar memória"
                                                    onClick={() => {
                                                        setOpenId(memory.id)
                                                        setEditingId(memory.id)
                                                    }}
                                                />
                                                <IconAction icon={Trash2} label="Excluir memória" tone="danger" onClick={() => setDeleting(memory)} />
                                            </div>
                                        )}
                                    </div>
                                    <AnimatePresence initial={false}>
                                        {open && (
                                            <motion.div key="body" {...expand} className="overflow-hidden">
                                                <div className="pt-2">
                                                    {editingId === memory.id ? (
                                                        <MemoryEditor
                                                            label="Editar memória"
                                                            initial={memory.texto}
                                                            onCancel={() => setEditingId(null)}
                                                            onSave={(texto) => {
                                                                mutate({ type: "update", id: memory.id, texto })
                                                                setEditingId(null)
                                                            }}
                                                        />
                                                    ) : (
                                                        <>
                                                            <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">{memory.texto}</p>
                                                            <p className="mt-1 text-xs text-muted-foreground">
                                                                {memory.origem === "agente" ? "Agente" : (memory.autor ?? "—")} · {formatDistanceToNow(new Date(memory.atualizadaEm), { addSuffix: true, locale: ptBR })}
                                                            </p>
                                                        </>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.li>
                            )
                        })}
                    </AnimatePresence>
                </ul>
            )}

            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(next) => !next && setDeleting(null)}
                title="Excluir memória?"
                description={deleting ? `"${deleting.resumo}" deixa de ser usada pelo agente.` : undefined}
                confirmLabel="Excluir memória"
                variant="destructive"
                onConfirm={() => {
                    if (deleting) mutate({ type: "delete", id: deleting.id })
                    setDeleting(null)
                }}
            />
        </div>
    )
}
