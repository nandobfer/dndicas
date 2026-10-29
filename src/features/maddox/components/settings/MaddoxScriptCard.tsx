"use client"

import { useState } from "react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { format } from "date-fns"
import { Eye, GripVertical, History, Plus, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/opex/dialog"
import { Input } from "@/components/ui/opex/input"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { Switch } from "@/components/ui/opex/switch"
import { Textarea } from "@/components/ui/opex/textarea"
import { MADDOX_SCRIPT_GUIDE_MAX, MADDOX_SCRIPT_KIND_LABELS, MADDOX_SCRIPT_TOPICS_MAX, type MaddoxScriptKind, type MaddoxScriptTopic } from "../../constants"
import { maddoxScriptGuideSchema, maddoxScriptTopicsSchema } from "../../schemas"
import { defaultScriptDraft, type MaddoxScriptDraft } from "../../script-draft"
import type { MaddoxScriptStateDto } from "../../types"
import { useMaddoxScriptVersion } from "../../hooks/useMaddoxSettings"

interface MaddoxScriptCardProps {
    kind: MaddoxScriptKind
    state: MaddoxScriptStateDto
    draft: MaddoxScriptDraft
    onChange: (next: MaddoxScriptDraft) => void
}

const newTopicId = () => `topico-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

// @dnd-kit v6 devolve propriedades de render junto de setNodeRef; não lemos ref.current aqui.
/* eslint-disable react-hooks/refs */
function SortableTopic({ topic, index, kind, onPatch, onRemove }: { topic: MaddoxScriptTopic; index: number; kind: MaddoxScriptKind; onPatch: (patch: Partial<MaddoxScriptTopic>) => void; onRemove: () => void }) {
    const sortable = useSortable({ id: topic.id })
    const id = `maddox-${kind}-topic-${topic.id}`
    return (
        <li ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="flex items-start gap-3 rounded-lg border bg-background/40 p-3">
            <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Reordenar o tópico ${index + 1}`} {...sortable.attributes} {...sortable.listeners}>
                <GripVertical className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1 space-y-1.5">
                <label htmlFor={id} className="text-xs font-semibold">
                    {index + 1}. Tópico
                </label>
                <Textarea id={id} rows={2} value={topic.text} onChange={(event) => onPatch({ text: event.target.value })} />
            </div>
            <label className="flex shrink-0 items-center gap-2 pt-7 text-sm">
                <Switch checked={topic.active} onCheckedChange={(value) => onPatch({ active: value })} aria-label={`Tópico ${index + 1} ativo`} />
                Ativo
            </label>
            <Button type="button" variant="ghost" size="icon" className="mt-6 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remover o tópico ${index + 1}`} onClick={onRemove}>
                <Trash2 className="h-4 w-4" />
            </Button>
        </li>
    )
}
/* eslint-enable react-hooks/refs */

/**
 * Editor de um roteiro de entrevista do Maddox: guia livre (como o `bootstrap.md` do roleplay),
 * tópicos sugeridos em texto livre (ordem por arrastar, ativo) e o histórico de versões — copiado do
 * editor do roteiro do Agente Entrevistador do Ciliar, sem campos nativos.
 */
export function MaddoxScriptCard({ kind, state, draft, onChange }: MaddoxScriptCardProps) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
    const [viewing, setViewing] = useState<number | null>(null)
    const version = useMaddoxScriptVersion(kind, viewing)
    const guideCheck = maddoxScriptGuideSchema.safeParse(draft.guide)
    const topicsCheck = maddoxScriptTopicsSchema.safeParse(draft.topics)
    const emptyTopic = draft.topics.findIndex((topic) => !topic.text.trim())
    const onDragEnd = (event: DragEndEvent) => {
        if (!event.over || event.active.id === event.over.id) return
        const from = draft.topics.findIndex((topic) => topic.id === event.active.id)
        const to = draft.topics.findIndex((topic) => topic.id === event.over?.id)
        if (from >= 0 && to >= 0) onChange({ ...draft, topics: arrayMove(draft.topics, from, to) })
    }
    const patch = (index: number, change: Partial<MaddoxScriptTopic>) => onChange({ ...draft, topics: draft.topics.map((topic, position) => (position === index ? { ...topic, ...change } : topic)) })
    const guideId = `maddox-${kind}-guide`
    const label = MADDOX_SCRIPT_KIND_LABELS[kind]

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Roteiro · {label}</CardTitle>
                    <CardDescription>
                        O Maddox conduz a entrevista livremente: pergunta o que precisar conforme o andamento, seguindo o guia e usando os tópicos como roteiro sugerido. Cada gravação cria uma versão; a entrevista usa sempre a versão com que começou. Vigente: v{state.current.version}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-1.5">
                        <label htmlFor={guideId} className="text-xs font-semibold">
                            Guia da entrevista
                        </label>
                        <Textarea id={guideId} rows={14} className="font-mono text-xs" value={draft.guide} maxLength={MADDOX_SCRIPT_GUIDE_MAX} onChange={(event) => onChange({ ...draft, guide: event.target.value })} />
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">
                                {draft.guide.length.toLocaleString("pt-BR")} / {MADDOX_SCRIPT_GUIDE_MAX.toLocaleString("pt-BR")}
                            </span>
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => onChange({ ...draft, guide: defaultScriptDraft(kind).guide })}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                            </Button>
                        </div>
                        {!guideCheck.success && <p role="alert" className="text-xs text-destructive">{guideCheck.error.issues[0]?.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-semibold">Tópicos sugeridos</p>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                            <SortableContext items={draft.topics.map((topic) => topic.id)} strategy={verticalListSortingStrategy}>
                                <ol className="space-y-2">
                                    {draft.topics.map((topic, index) => (
                                        <SortableTopic key={topic.id} topic={topic} index={index} kind={kind} onPatch={(change) => patch(index, change)} onRemove={() => onChange({ ...draft, topics: draft.topics.filter((_, position) => position !== index) })} />
                                    ))}
                                </ol>
                            </SortableContext>
                        </DndContext>
                        {draft.topics.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum tópico: o Maddox segue só o guia.</p>}
                        <div className="flex flex-wrap items-center gap-2">
                            {draft.topics.length < MADDOX_SCRIPT_TOPICS_MAX && (
                                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onChange({ ...draft, topics: [...draft.topics, { id: newTopicId(), text: "", active: true }] })}>
                                    <Plus className="h-4 w-4" aria-hidden /> Adicionar tópico
                                </Button>
                            )}
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => onChange({ ...draft, topics: defaultScriptDraft(kind).topics })}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar tópicos padrão
                            </Button>
                        </div>
                        {emptyTopic >= 0 ? (
                            <p role="alert" className="text-xs text-destructive">
                                Informe o texto do tópico {emptyTopic + 1}
                            </p>
                        ) : (
                            !topicsCheck.success && <p role="alert" className="text-xs text-destructive">{topicsCheck.error.issues[0]?.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor={`maddox-${kind}-notes`} className="text-xs font-semibold">
                            Notas da nova versão (opcional)
                        </label>
                        <Input id={`maddox-${kind}-notes`} value={draft.notes} maxLength={500} onChange={(event) => onChange({ ...draft, notes: event.target.value })} placeholder="O que mudou nesta versão" />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <History className="h-4 w-4" aria-hidden /> Histórico de versões do roteiro
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="divide-y">
                        {state.history.map((item) => (
                            <li key={item.version} className="flex items-center justify-between gap-3 py-2 text-sm">
                                <span className="min-w-0">
                                    <span className="font-medium">v{item.version}</span>
                                    {item.version === state.current.version && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">vigente</span>}
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {item.createdAt ? `${format(new Date(item.createdAt), "dd/MM/yyyy HH:mm")} · ${item.createdByName ?? item.createdBy}` : "Padrão do sistema"}
                                        {item.notes ? ` · ${item.notes}` : ""}
                                    </span>
                                </span>
                                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setViewing(item.version)}>
                                    <Eye className="h-4 w-4" aria-hidden /> Ver
                                </Button>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>

            <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {label} · Roteiro v{viewing}
                        </DialogTitle>
                        <DialogDescription>{version.data?.notes || "Guia e tópicos desta versão"}</DialogDescription>
                    </DialogHeader>
                    {version.isLoading ? (
                        <Skeleton className="h-40" />
                    ) : (
                        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                            <pre className="whitespace-pre-wrap rounded-md border p-3 font-mono text-xs">{version.data?.guide}</pre>
                            <ol className="space-y-2">
                                {(version.data?.topics ?? []).map((topic, index) => (
                                    <li key={topic.id} className="rounded-md border p-2 text-sm">
                                        <p className="font-medium">
                                            {index + 1}. {topic.text}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{topic.active ? "ativo" : "inativo"}</p>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
