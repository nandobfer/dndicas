"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, CheckCircle2, Pencil, X } from "lucide-react"
import { Badge } from "@/components/ui/opex/badge"
import { Button } from "@/components/ui/opex/button"
import { Label } from "@/components/ui/opex/label"
import { Textarea } from "@/components/ui/opex/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/core/ui/select"
import { cn } from "@/lib/utils"
import { CURATOR_DECISION_LABELS } from "../../../memory-curator"
import type { MigrationItemDto } from "../../../types"

const STATUS_LABEL = { pendente: "Pendente", aprovada: "Aprovada", rejeitada: "Rejeitada" } as const

interface ReviewItemProps {
    item: MigrationItemDto
    categories: { key: string; label: string }[]
    textMax: number
    disabled?: boolean
    onDecide: (patch: { status?: "aprovada" | "rejeitada" | "pendente"; texto?: string | null; categoria?: string | null }) => void
}

/** Uma memória na revisão: original e proposta lado a lado, decisão, motivo e confiança; Aprovar, Rejeitar ou Editar. */
export function ReviewItem({ item, categories, textMax, disabled, onDecide }: ReviewItemProps) {
    const options = item.decision?.novaCategoria && !categories.some((option) => option.key === item.decision!.novaCategoria!.key) ? [...categories, { ...item.decision.novaCategoria, label: `${item.decision.novaCategoria.label} (nova)` }] : categories
    const [editing, setEditing] = useState(false)
    const [texto, setTexto] = useState(item.final.texto)
    const [categoria, setCategoria] = useState(item.final.categoria ?? options[0]?.key ?? "")
    // Abrir o editor relê a proposta atual (a compactação ou uma nova triagem podem tê-la trocado).
    const openEditor = () => {
        setTexto(item.final.texto)
        setCategoria(item.final.categoria ?? options[0]?.key ?? "")
        setEditing(true)
    }
    const decision = item.decision
    const proposed = decision?.textoProposto && decision.textoProposto !== item.texto ? decision.textoProposto : null
    const tooLong = texto.length > textMax
    const locked = disabled || Boolean(item.imported)
    // Descartar: aceitar a decisão NÃO importa; migrar contraria o curador e é uma ação explícita à parte.
    const discard = decision?.decisao === "descartar"
    return (
        <li className={cn("space-y-2 px-3 py-3", item.review.status === "rejeitada" && "opacity-60")} data-testid="migration-item" data-status={item.review.status}>
            <div className="flex flex-wrap items-center gap-1.5">
                {decision && <Badge variant={item.needsAttention ? "destructive" : "secondary"}>{CURATOR_DECISION_LABELS[decision.decisao]}</Badge>}
                <Badge variant="outline">{STATUS_LABEL[item.review.status]}</Badge>
                {item.imported && (
                    <Badge variant="secondary" className="gap-1" data-testid="migration-imported">
                        <CheckCircle2 className="h-3 w-3" aria-hidden /> Importada
                    </Badge>
                )}
                {decision?.novaCategoria && <Badge variant="outline">Nova categoria: {decision.novaCategoria.label} ({decision.novaCategoria.key})</Badge>}
                <span className="text-xs text-muted-foreground">
                    {decision?.confianca != null && `confiança ${Math.round(decision.confianca * 100)}%`}
                    {item.final.categoria && ` · ${item.final.categoria}`}
                </span>
            </div>
            {decision && <p className="text-xs text-muted-foreground">Motivo: {decision.motivo}</p>}
            <div className={cn("grid gap-2", proposed ? "md:grid-cols-2" : "grid-cols-1")}>
                <div className="space-y-1">
                    <span className="text-[11px] font-semibold uppercase text-muted-foreground">Original</span>
                    <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm">{item.texto}</p>
                </div>
                {proposed && (
                    <div className="space-y-1">
                        <span className="text-[11px] font-semibold uppercase text-primary">Proposta do curador</span>
                        <p className="whitespace-pre-wrap rounded-md border border-primary/30 bg-primary/5 p-2 text-sm">{proposed}</p>
                    </div>
                )}
            </div>
            <AnimatePresence initial={false}>
                {editing && (
                    <motion.div key="edit" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
                        <Textarea aria-label="Texto a importar" rows={4} value={texto} onChange={(event) => setTexto(event.target.value)} aria-invalid={tooLong} />
                        <p className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}>
                            {texto.length}/{textMax}
                            {tooLong && ": reescreva dentro do limite do Engramind"}
                        </p>
                        {options.length > 0 && (
                            <div className="space-y-1">
                                <Label htmlFor={`review-${item.id}-categoria`} className="text-xs font-semibold">
                                    Categoria
                                </Label>
                                <Select value={options.some((option) => option.key === categoria) ? categoria : undefined} onValueChange={setCategoria}>
                                    <SelectTrigger id={`review-${item.id}-categoria`} className="w-full">
                                        <SelectValue placeholder="Escolha a categoria" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {options.map((option) => (
                                            <SelectItem key={option.key} value={option.key}>
                                                {option.label} ({option.key})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
            {!item.imported && decision && (
                <div className="flex flex-wrap justify-end gap-2">
                    {editing ? (
                        <>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={locked || tooLong || !texto.trim()}
                                onClick={() => {
                                    onDecide({ texto, categoria: categoria || null, status: "aprovada" })
                                    setEditing(false)
                                }}
                            >
                                <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Salvar e aprovar
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button type="button" size="sm" variant="ghost" disabled={locked} onClick={openEditor}>
                                <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Editar
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled={locked || item.review.status === "rejeitada"} onClick={() => onDecide({ status: "rejeitada" })}>
                                <X className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {discard ? "Aceitar descarte" : "Rejeitar"}
                            </Button>
                            <Button type="button" size="sm" variant={discard ? "outline" : "default"} disabled={locked || item.review.status === "aprovada" || item.final.texto.length > textMax} onClick={() => onDecide({ status: "aprovada" })}>
                                <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {discard ? "Migrar mesmo assim" : "Aprovar"}
                            </Button>
                        </>
                    )}
                </div>
            )}
        </li>
    )
}
