"use client"

import { useState } from "react"
import { AlertTriangle, Bot, Check, Loader2, Pencil, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Markdown } from "@/components/ui/opex/markdown"
import { Textarea } from "@/components/ui/opex/textarea"
import { GlassSelector } from "@/components/ui/glass-selector"
import { MADDOX_ABILITY_METHOD_LABELS, MADDOX_OPEX_GUIDANCE_MAX, type MaddoxAbilityMethod } from "../../constants"
import { MADDOX_ABILITY_LABELS } from "../../check-modifier"
import { ABILITY_KEYS, type AbilityScores } from "../../interview-scores"
import type { MaddoxAbilityRollsDto, MaddoxAbilityScoresDto, MaddoxOpexDraftDto } from "../../interview-types"
import type { ApproveMaddoxOpexDraftInput } from "../../opex-schemas"
import { AbilityScoresCard } from "./AbilityScoresCard"

interface Props {
    draft: MaddoxOpexDraftDto | null
    /** Card de atributos pendente (para "Editar e aprovar" abrir o próprio card, já preenchido). */
    abilityCard: MaddoxAbilityScoresDto | null
    rolls: MaddoxAbilityRollsDto | null
    color: string
    busy: boolean
    regenerating: boolean
    onApprove: (input: ApproveMaddoxOpexDraftInput) => void
    onRegenerate: (guidance: string) => void
}

/**
 * Resposta do Personagem Opex aguardando o dono (modo ao vivo, DND-26). Nada segue ao Maddox antes de uma destas
 * escolhas: aprovar como está, editar e aprovar, ou "Gerar outra resposta" com uma orientação opcional.
 */
export function OpexDraftPanel({ draft, abilityCard, rolls, color, busy, regenerating, onApprove, onRegenerate }: Props) {
    // O pai remonta o painel a cada rascunho novo (`key`): o estado nasce do rascunho atual.
    const [editing, setEditing] = useState(false)
    const [text, setText] = useState(draft?.content ?? "")
    const [guidance, setGuidance] = useState("")
    const [choices, setChoices] = useState<Record<string, "media" | "rolagem">>(() => (draft?.payload as { escolhas?: Record<string, "media" | "rolagem"> } | null)?.escolhas ?? {})

    if (!draft || draft.status === "generating") {
        return (
            <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/70" role="status" data-testid="opex-draft-generating">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> O Personagem Opex está pensando na resposta…
            </div>
        )
    }
    if (draft.status === "failed") {
        return (
            <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                <AlertTriangle className="h-4 w-4" aria-hidden /> {draft.error ?? "O Personagem Opex não conseguiu responder."}
            </div>
        )
    }
    const payload = draft.payload as { method?: MaddoxAbilityMethod; scores?: AbilityScores; escolhas?: Record<string, "media" | "rolagem"> } | null
    const disabled = busy || regenerating
    return (
        <section aria-label="Resposta do Personagem Opex" data-testid="opex-draft" className="mx-3 mb-2 space-y-3 rounded-xl border p-3" style={{ borderColor: `${color}55`, backgroundColor: `${color}0d` }}>
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color }}>
                <Bot className="h-4 w-4" aria-hidden /> Resposta do Personagem Opex — aguardando sua aprovação
            </p>
            {draft.kind === "message" &&
                (editing ? (
                    <Textarea aria-label="Editar a resposta" rows={5} value={text} onChange={(event) => setText(event.target.value)} />
                ) : (
                    <div className="rounded-lg bg-black/20 p-3 text-sm text-white/90">
                        <Markdown lineAction={null}>{draft.content}</Markdown>
                    </div>
                ))}
            {draft.kind === "ability-scores" &&
                payload?.scores &&
                (editing && abilityCard ? (
                    <AbilityScoresCard
                        card={{ ...abilityCard, prefill: { method: payload.method ?? "standard", base: payload.scores } }}
                        rolls={rolls}
                        color={color}
                        disabled={disabled}
                        onRoll={() => Promise.reject(new Error("As rolagens do Personagem Opex já foram feitas."))}
                        onReset={() => undefined}
                        resetting={false}
                        onSubmit={(method, scores) => onApprove({ method, scores })}
                    />
                ) : (
                    <p className="text-sm text-white/80" data-testid="opex-draft-scores">
                        {MADDOX_ABILITY_METHOD_LABELS[payload.method ?? "standard"]}: {ABILITY_KEYS.map((key) => `${MADDOX_ABILITY_LABELS[key]} ${payload.scores![key]}`).join(", ")}
                    </p>
                ))}
            {draft.kind === "hit-points" && (
                <div className="space-y-2" data-testid="opex-draft-hit-points">
                    {Object.keys(payload?.escolhas ?? {}).map((level) => (
                        <div key={level} className="flex items-center gap-3 text-sm text-white/80">
                            <span className="w-16">Nível {level}</span>
                            {editing ? (
                                <GlassSelector<"media" | "rolagem">
                                    value={choices[level] ?? "media"}
                                    onChange={(value) => !Array.isArray(value) && setChoices((current) => ({ ...current, [level]: value }))}
                                    layoutId={`maddox-opex-hp-${level}`}
                                    options={[
                                        { value: "media", label: "Média" },
                                        { value: "rolagem", label: "Rolar vida" },
                                    ]}
                                />
                            ) : (
                                <span>{payload!.escolhas![level] === "rolagem" ? "Rolar vida" : "Média"}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                {!editing && (
                    <Button size="sm" onClick={() => onApprove({})} disabled={disabled}>
                        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Aprovar
                    </Button>
                )}
                {editing && draft.kind === "message" && (
                    <Button size="sm" onClick={() => onApprove({ content: text.trim() })} disabled={disabled || !text.trim()}>
                        <Check aria-hidden /> Aprovar editada
                    </Button>
                )}
                {editing && draft.kind === "hit-points" && (
                    <Button size="sm" onClick={() => onApprove({ escolhas: choices })} disabled={disabled}>
                        <Check aria-hidden /> Aprovar editada
                    </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setEditing((value) => !value)} disabled={disabled || (draft.kind === "ability-scores" && !abilityCard)}>
                    <Pencil aria-hidden /> {editing ? "Cancelar edição" : "Editar e aprovar"}
                </Button>
            </div>
            <div className="space-y-2 border-t border-white/10 pt-3">
                <Textarea aria-label="Orientação ao Personagem Opex" rows={2} maxLength={MADDOX_OPEX_GUIDANCE_MAX} value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="Orientação opcional (ex.: seja mais desconfiado; escolha outro nome)" />
                <Button size="sm" variant="ghost" onClick={() => onRegenerate(guidance.trim())} disabled={disabled}>
                    {regenerating ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Gerar outra resposta
                </Button>
            </div>
        </section>
    )
}
