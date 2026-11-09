"use client"

import { useState } from "react"
import { Brain, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { Field } from "@/components/ui/opex/field"
import { Input } from "@/components/ui/opex/input"
import { Textarea } from "@/components/ui/opex/textarea"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { MADDOX_OPEX_MEMORY_TEXT_MAX, MADDOX_OPEX_MEMORY_TITLE_MAX } from "../../constants"
import { useMaddoxOpexMemories, useMaddoxOpexMemoryMutations, type MaddoxOpexGlobalMemoryDto } from "../../hooks/useMaddoxSettings"

const apiError = (error: unknown) => (error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error

/**
 * Memórias globais do Personagem Opex (DND-26): o canal `dndicas/personagem-opex`, lido por todo Personagem Opex. Salva à
 * parte do formulário (cada inclusão, edição ou remoção vai direto à rede de memórias).
 */
export function MaddoxOpexMemoriesCard() {
    const query = useMaddoxOpexMemories()
    const { create, update, remove } = useMaddoxOpexMemoryMutations()
    const [editing, setEditing] = useState<{ id: string | null; title: string; text: string } | null>(null)
    const [removing, setRemoving] = useState<MaddoxOpexGlobalMemoryDto | null>(null)
    const saving = create.isPending || update.isPending
    const save = () => {
        if (!editing) return
        const input = { title: editing.title.trim(), text: editing.text.trim() }
        if (!input.title || !input.text) return
        if (editing.id) update.mutate({ id: editing.id, ...input }, { onSuccess: () => setEditing(null) })
        else create.mutate(input, { onSuccess: () => setEditing(null) })
    }
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Brain className="h-4 w-4 text-primary" aria-hidden /> Memórias globais do Personagem Opex
                </CardTitle>
                <CardDescription>Todo Personagem Opex lê estas memórias em toda decisão: use-as para treinar o jeito de jogar (ex.: &quot;prefira cooperar com o grupo&quot;). Salvam na hora, fora do botão Salvar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {query.isLoading && <Loader2 className="h-4 w-4 animate-spin text-white/60" aria-label="Carregando as memórias" />}
                {query.isError && <p className="text-sm text-destructive" role="alert">{apiError(query.error) ?? "Não foi possível carregar as memórias globais."}</p>}
                {query.data && query.data.length === 0 && !editing && <p className="text-sm text-white/60">Nenhuma memória global ainda.</p>}
                <ul className="space-y-2" aria-label="Memórias globais">
                    {query.data?.map((memory) => (
                        <li key={memory.id} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3" data-testid="opex-global-memory">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-white">{memory.title || "(sem título)"}</p>
                                <p className="whitespace-pre-wrap text-xs text-white/70">{memory.text}</p>
                            </div>
                            <Button type="button" size="sm" variant="ghost" aria-label={`Editar ${memory.title}`} onClick={() => setEditing({ id: memory.id, title: memory.title, text: memory.text })}>
                                <Pencil aria-hidden />
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Remover ${memory.title}`} onClick={() => setRemoving(memory)}>
                                <Trash2 aria-hidden />
                            </Button>
                        </li>
                    ))}
                </ul>
                {editing ? (
                    <div className="space-y-3 rounded-lg border border-white/10 p-3" data-testid="opex-memory-editor">
                        <Field id="maddox-opex-memory-title" label="Título">
                            <Input id="maddox-opex-memory-title" maxLength={MADDOX_OPEX_MEMORY_TITLE_MAX} value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
                        </Field>
                        <Field id="maddox-opex-memory-text" label="Memória">
                            <Textarea id="maddox-opex-memory-text" rows={4} maxLength={MADDOX_OPEX_MEMORY_TEXT_MAX} value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} />
                        </Field>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                                Cancelar
                            </Button>
                            <Button type="button" size="sm" onClick={save} disabled={saving || !editing.title.trim() || !editing.text.trim()}>
                                {saving && <Loader2 className="animate-spin" aria-hidden />} {editing.id ? "Salvar memória" : "Incluir memória"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ id: null, title: "", text: "" })} disabled={query.isError}>
                        <Plus aria-hidden /> Incluir memória
                    </Button>
                )}
            </CardContent>
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title={`Remover "${removing?.title ?? "memória"}"?`}
                description="Nenhum Personagem Opex vai mais ler esta memória."
                confirmLabel="Remover"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => removing && remove.mutate(removing.id, { onSettled: () => setRemoving(null) })}
            />
        </Card>
    )
}
