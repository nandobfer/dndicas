"use client"

import { useState } from "react"
import { Dices, Lock, RotateCcw, Send } from "lucide-react"
import { cn } from "@/core/utils"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { GlassSelector } from "@/components/ui/glass-selector"
import { attributeColors } from "@/lib/config/colors"
import { PointBuyControls } from "@/features/character-sheets/components/point-buy-controls"
import { STANDARD_ARRAY_VALUES } from "@/features/character-sheets/utils/ability-score-rules"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import type { DiceRollPreset, DiceRollResponse } from "@/features/dice-roller/types"
import type { AttributeType } from "@/features/character-sheets/types/character-sheet.types"
import { MADDOX_ABILITY_METHODS, MADDOX_ABILITY_METHOD_LABELS, MADDOX_ABILITY_ROLLS, type MaddoxAbilityMethod } from "../../constants"
import { MADDOX_ABILITY_LABELS } from "../../check-modifier"
import { ABILITY_KEYS, finalScores, rolledScores, validateSubmission, type AbilityScores } from "../../interview-scores"
import type { MaddoxAbilityRollsDto, MaddoxAbilityScoresDto } from "../../interview-types"

const COLOR_KEY: Record<AttributeType, keyof typeof attributeColors> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}
const colorsOf = (attr: AttributeType) => attributeColors[COLOR_KEY[attr]]

const ROLL_PRESET: DiceRollPreset = { label: "Atributo", terms: [{ dice: "d6", quantity: 4 }], modifier: 0, mode: "normal", source: "sheet" }

type Assignments = Partial<Record<AttributeType, number>>

/** Atribui um valor (ou índice) a um atributo, tirando-o de quem o tinha. */
function assign(current: Assignments, attr: AttributeType, value: number | undefined): Assignments {
    const next = Object.fromEntries(Object.entries(current).filter(([key, existing]) => key !== attr && existing !== value)) as Assignments
    if (value !== undefined) next[attr] = value
    return next
}

const pickValue = (value: unknown): number | undefined => {
    if (value === undefined || value === null) return undefined
    const parsed = Number(Array.isArray(value) ? value[0] : value)
    return Number.isFinite(parsed) ? parsed : undefined
}

/** Distribui valores conhecidos (pré-preenchimento) em índices de uma lista com repetições. */
function indexesFor(base: AbilityScores | undefined, scores: number[]): Assignments {
    if (!base) return {}
    const used = new Set<number>()
    const result: Assignments = {}
    for (const attr of ABILITY_KEYS) {
        const index = scores.findIndex((score, position) => score === base[attr] && !used.has(position))
        if (index >= 0) {
            used.add(index)
            result[attr] = index
        }
    }
    return result
}

interface Props {
    card: MaddoxAbilityScoresDto
    rolls: MaddoxAbilityRollsDto | null
    color: string
    /** O Maddox está respondendo (ou outra ação em andamento). */
    disabled: boolean
    onRoll: () => Promise<DiceRollResponse>
    onReset: () => void
    resetting: boolean
    onSubmit: (method: MaddoxAbilityMethod, scores: AbilityScores) => void
}

/**
 * Card de atributos da entrevista (Maddox 5): conjunto padrão, compra de pontos ou rolagem (cinco 4d6 rolados no
 * servidor e a sexta = 72 − soma). Depois do envio fica travado; só o Maddox reabre, com os valores atuais.
 */
export function AbilityScoresCard({ card, rolls, color, disabled, onRoll, onReset, resetting, onSubmit }: Props) {
    if (card.status !== "pending") return <AbilityScoresSummary card={card} color={color} />
    return <PendingCard card={card} rolls={rolls} color={color} disabled={disabled} onRoll={onRoll} onReset={onReset} resetting={resetting} onSubmit={onSubmit} />
}

function PendingCard({ card, rolls, color, disabled, onRoll, onReset, resetting, onSubmit }: Props) {
    const prefill = card.prefill
    const [method, setMethod] = useState<MaddoxAbilityMethod>(prefill?.method ?? "standard")
    const [standard, setStandard] = useState<Assignments>(() => (prefill?.method === "standard" ? { ...prefill.base } : {}))
    const [pointBuy, setPointBuy] = useState<AbilityScores>(() => (prefill?.method === "point-buy" ? { ...prefill.base } : (Object.fromEntries(ABILITY_KEYS.map((key) => [key, 8])) as AbilityScores)))
    // Distribuição da rolagem, atrelada às pontuações em que foi feita (nova rolagem = distribuição vazia).
    const [diceState, setDiceState] = useState<{ signature: string; slots: Assignments }>({ signature: "", slots: {} })
    // Rolagem que o painel ainda está animando: a pontuação só aparece quando o dado para.
    const [animatingRollId, setAnimatingRollId] = useState<string | null>(null)
    const [confirming, setConfirming] = useState(false)

    const rollsState = rolls ? { scores: rolls.rolls.map((roll) => roll.score), sixth: rolls.sixth, invalid: rolls.invalid } : null
    const allRolled = rolledScores(rollsState)
    const shownRolls = animatingRollId ? allRolled.slice(0, Math.max(0, rolls!.rolls.length - 1)) : allRolled
    const rollsDone = (rolls?.rolls.length ?? 0) >= MADDOX_ABILITY_ROLLS
    const diceReady = allRolled.length === 6 && !animatingRollId
    // Pré-preenchimento da rolagem: os mesmos valores, enquanto o jogador não mexe na distribuição.
    const prefillDice = prefill?.method === "roll" ? indexesFor(prefill.base, allRolled) : {}
    const signature = allRolled.join(",")
    const diceSlots = diceState.signature === signature ? diceState.slots : {}
    const diceAssignments = Object.keys(diceSlots).length ? diceSlots : prefillDice
    const setDiceSlots = (slots: Assignments) => setDiceState({ signature, slots })

    const scores: Partial<AbilityScores> =
        method === "standard"
            ? standard
            : method === "point-buy"
              ? pointBuy
              : (Object.fromEntries(Object.entries(diceAssignments).map(([attr, index]) => [attr, allRolled[index!]])) as Partial<AbilityScores>)
    const invalid = validateSubmission(method, scores, rollsState)
    const preview = !invalid ? finalScores(scores as AbilityScores, card.bonus?.parts) : null

    return (
        <section className="space-y-4 rounded-xl border bg-white/[0.03] p-4" style={{ borderColor: `${color}55` }} aria-label="Atributos do personagem" data-testid="ability-scores-card" data-status="pending">
            <header className="space-y-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Dices className="h-4 w-4" style={{ color }} aria-hidden /> Atributos do personagem
                </h3>
                {card.reason && <p className="text-xs text-white/60">{card.reason}</p>}
                {prefill && <p className="text-xs text-white/50">O Maddox reabriu o card com os valores atuais.</p>}
            </header>

            <GlassSelector
                value={method}
                onChange={(value) => {
                    if (value) setMethod(value as MaddoxAbilityMethod)
                }}
                options={MADDOX_ABILITY_METHODS.map((value) => ({ value, label: MADDOX_ABILITY_METHOD_LABELS[value] }))}
                fullWidth
                disabled={disabled}
                layoutId={`maddox-ability-method-${card.submittedAt ?? "novo"}`}
            />

            {method === "standard" && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="ability-standard">
                    {ABILITY_KEYS.map((attr) => {
                        const colors = colorsOf(attr)
                        const used = new Set(Object.entries(standard).filter(([key]) => key !== attr).map(([, value]) => value))
                        const options = STANDARD_ARRAY_VALUES.filter((value) => !used.has(value)).map((value) => ({ value, label: String(value), activeColor: colors.hex, textColor: colors.hex }))
                        return (
                            <div key={attr} className={cn("rounded-lg border p-3", colors.border, colors.bgAlpha)} data-testid={`ability-standard-${attr}`}>
                                <p className={cn("mb-2 text-[10px] font-black uppercase tracking-[0.2em]", colors.text)}>{MADDOX_ABILITY_LABELS[attr]}</p>
                                <GlassSelector
                                    value={standard[attr]}
                                    onChange={(value) => setStandard((current) => assign(current, attr, pickValue(value)))}
                                    options={options}
                                    layout="grid"
                                    cols={3}
                                    fullWidth
                                    allowDeselect
                                    disabled={disabled}
                                    layoutId={`maddox-standard-${attr}`}
                                />
                            </div>
                        )
                    })}
                </div>
            )}

            {method === "point-buy" && <PointBuyControls scores={pointBuy} onChange={(attr, value) => setPointBuy((current) => ({ ...current, [attr]: value }))} disabled={disabled} />}

            {method === "roll" && (
                <div className="space-y-4" data-testid="ability-roll">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <DiceRollerPanel
                            preset={ROLL_PRESET}
                            hideConfigurationControls
                            rollButtonLabel="Rolar 4d6"
                            resultDropLowest
                            disableRolling={disabled || rollsDone || Boolean(rolls?.invalid)}
                            disabledRollingMessage={rollsDone ? "As cinco rolagens foram feitas." : null}
                            rollRequest={async () => {
                                const result = await onRoll()
                                setAnimatingRollId(result.rollId)
                                return result
                            }}
                            onRollResolved={() => setAnimatingRollId(null)}
                        />
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Pontuações</span>
                                {rolls?.invalid && (
                                    <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={onReset} disabled={resetting || disabled}>
                                        <RotateCcw className="h-3 w-3" aria-hidden /> Reiniciar
                                    </Button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2" data-testid="ability-roll-scores">
                                {shownRolls.map((score, index) => (
                                    <span key={`${score}-${index}`} className={cn("rounded-full border px-3 py-1 text-sm font-bold", index === 5 ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 bg-white/[0.06] text-white/80")} title={index === 5 ? "72 − soma das cinco rolagens" : undefined}>
                                        {score}
                                    </span>
                                ))}
                            </div>
                            {!rollsDone && <p className="mt-3 text-sm text-white/45">Faça {MADDOX_ABILITY_ROLLS - (rolls?.rolls.length ?? 0)} rolagem(ns) de 4d6 (o menor dado é descartado). A sexta pontuação é 72 menos a soma das cinco.</p>}
                            {rolls?.invalid && <p className="mt-3 text-sm text-amber-300" role="alert">A sexta pontuação ficou fora do intervalo 3-18. Reinicie as rolagens.</p>}
                        </div>
                    </div>
                    {diceReady && (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="ability-roll-assign">
                            {ABILITY_KEYS.map((attr) => {
                                const colors = colorsOf(attr)
                                const used = new Set(Object.entries(diceAssignments).filter(([key]) => key !== attr).map(([, value]) => value))
                                const options = allRolled.map((score, index) => ({ value: index, label: String(score), activeColor: colors.hex, textColor: colors.hex })).filter((option) => !used.has(option.value))
                                return (
                                    <div key={attr} className={cn("rounded-lg border p-3", colors.border, colors.bgAlpha)} data-testid={`ability-roll-${attr}`}>
                                        <p className={cn("mb-2 text-[10px] font-black uppercase tracking-[0.2em]", colors.text)}>{MADDOX_ABILITY_LABELS[attr]}</p>
                                        <GlassSelector
                                            value={diceAssignments[attr]}
                                            onChange={(value) => setDiceSlots(assign(diceAssignments, attr, pickValue(value)))}
                                            options={options}
                                            layout="grid"
                                            cols={3}
                                            fullWidth
                                            allowDeselect
                                            disabled={disabled}
                                            layoutId={`maddox-roll-${attr}`}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {card.bonus && (
                <p className="text-xs text-white/60" data-testid="ability-bonus-note">
                    Bônus do antecedente ({card.bonus.background}): {bonusText(card.bonus.parts)}
                </p>
            )}
            {preview && <ScoresGrid base={scores as AbilityScores} bonus={card.bonus?.parts ?? null} final={preview} testId="ability-preview" />}

            <div className="flex flex-wrap items-center justify-end gap-2">
                {invalid && <p className="mr-auto text-xs text-white/50">{invalid}</p>}
                <Button type="button" onClick={() => setConfirming(true)} disabled={disabled || Boolean(invalid)}>
                    <Send aria-hidden /> Enviar atributos
                </Button>
            </div>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Enviar atributos?"
                description="Depois de enviar, só o Maddox pode reabrir o card."
                confirmLabel="Enviar"
                onConfirm={() => {
                    setConfirming(false)
                    onSubmit(method, scores as AbilityScores)
                }}
            />
        </section>
    )
}

const bonusText = (parts: Partial<Record<AttributeType, number>>) =>
    Object.entries(parts)
        .filter(([, value]) => value)
        .map(([attr, value]) => `${MADDOX_ABILITY_LABELS[attr as AttributeType]} +${value}`)
        .join(", ")

function ScoresGrid({ base, bonus, final, testId }: { base: AbilityScores; bonus: Partial<Record<AttributeType, number>> | null; final: AbilityScores; testId: string }) {
    return (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid={testId}>
            {ABILITY_KEYS.map((attr) => {
                const colors = colorsOf(attr)
                const extra = bonus?.[attr] ?? 0
                return (
                    <div key={attr} className={cn("rounded-lg border px-2 py-1.5 text-center", colors.border, colors.bgAlpha)} data-testid={`${testId}-${attr}`}>
                        <p className={cn("text-[10px] font-black uppercase tracking-[0.15em]", colors.text)}>{MADDOX_ABILITY_LABELS[attr]}</p>
                        <p className="text-lg font-black text-white">{final[attr]}</p>
                        <p className="text-[10px] text-white/50">{extra ? `${base[attr]} +${extra}` : "base"}</p>
                    </div>
                )
            })}
        </div>
    )
}

/** Card enviado (travado) ou substituído por um card reaberto. */
function AbilityScoresSummary({ card, color }: { card: MaddoxAbilityScoresDto; color: string }) {
    const superseded = card.status === "superseded"
    return (
        <section
            className={cn("space-y-3 rounded-xl border bg-white/[0.03] p-4", superseded && "opacity-60")}
            style={{ borderColor: `${color}40` }}
            aria-label="Atributos enviados"
            data-testid="ability-scores-card"
            data-status={card.status}
        >
            <header className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                <Lock className="h-4 w-4" style={{ color }} aria-hidden /> Atributos enviados
                {card.method && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70">{MADDOX_ABILITY_METHOD_LABELS[card.method]}</span>}
                {superseded && <span className="ml-auto text-xs font-medium text-white/60">Reaberto abaixo</span>}
            </header>
            {card.base && card.final ? <ScoresGrid base={card.base} bonus={card.bonus?.parts ?? null} final={card.final} testId="ability-final" /> : <p className="text-xs text-white/50">O card foi reaberto antes do envio.</p>}
            {card.bonus && (
                <p className="text-xs text-white/60" data-testid="ability-bonus-note">
                    Bônus do antecedente ({card.bonus.background}): {bonusText(card.bonus.parts)}
                </p>
            )}
        </section>
    )
}
