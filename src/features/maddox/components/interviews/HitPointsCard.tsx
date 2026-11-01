"use client"

import { useMemo, useState } from "react"
import { Heart, Lock, Send } from "lucide-react"
import { cn } from "@/core/utils"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { GlassSelector } from "@/components/ui/glass-selector"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import type { DiceRollPreset, DiceRollResponse, DiceType } from "@/features/dice-roller/types"
import type { MaddoxHitPointsDto } from "../../interview-types"

type Choice = "average" | "roll"

interface Props {
    card: MaddoxHitPointsDto
    color: string
    /** O Maddox está respondendo (ou outra ação em andamento). */
    disabled: boolean
    onRoll: (level: number) => Promise<DiceRollResponse>
    onSubmit: (choices: Record<string, "media" | "rolagem">) => void
}

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))

/**
 * Card de pontos de vida por nível (Maddox 5), como o assistente de subir de nível da ficha: em cada nível do 2 ao N,
 * a média (⌈lados/2⌉ + CON) ou o dado de vida rolado no servidor (+ CON). Depois do envio fica travado.
 */
export function HitPointsCard({ card, color, disabled, onRoll, onSubmit }: Props) {
    if (card.status !== "pending") return <HitPointsSummary card={card} color={color} />
    return <PendingHitPoints card={card} color={color} disabled={disabled} onRoll={onRoll} onSubmit={onSubmit} />
}

function PendingHitPoints({ card, color, disabled, onRoll, onSubmit }: Props) {
    const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(card.rows.map((row) => [String(row.level), row.die !== null ? "roll" : "average"])))
    const [animating, setAnimating] = useState<number | null>(null)
    const [confirming, setConfirming] = useState(false)
    const rolling = card.rows.find((row) => choices[String(row.level)] === "roll" && row.die === null) ?? null
    const preset = useMemo<DiceRollPreset | null>(
        () => (rolling ? { label: `PV do nível ${rolling.level}`, terms: [{ dice: card.hitDie as DiceType, quantity: 1 }], modifier: card.constitutionModifier, mode: "normal", source: "sheet" } : null),
        [rolling, card.hitDie, card.constitutionModifier],
    )
    const gain = (row: MaddoxHitPointsDto["rows"][number]) => (choices[String(row.level)] === "roll" ? (animating === row.level ? null : row.rolled) : row.average)
    const gains = card.rows.map(gain)
    const ready = gains.every((value) => value !== null)
    const total = ready ? card.levelOne + gains.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null

    return (
        <section className="space-y-4 rounded-xl border bg-white/[0.03] p-4" style={{ borderColor: `${color}55` }} aria-label="Pontos de vida por nível" data-testid="hit-points-card" data-status="pending">
            <header className="space-y-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Heart className="h-4 w-4" style={{ color }} aria-hidden /> Pontos de vida por nível
                </p>
                {card.reason && <p className="text-xs text-white/60">{card.reason}</p>}
                <p className="text-xs text-white/50">
                    Dado de vida {card.hitDie}, Constituição {signed(card.constitutionModifier)}. Nível 1: {card.levelOne} (máximo do dado + CON).
                </p>
            </header>
            <div className="space-y-2" data-testid="hit-points-rows">
                {card.rows.map((row) => {
                    const choice = choices[String(row.level)] ?? "average"
                    const value = gain(row)
                    return (
                        <div key={row.level} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2" data-testid={`hit-points-row-${row.level}`}>
                            <span className="w-16 text-xs font-black uppercase tracking-[0.15em] text-white/60">Nível {row.level}</span>
                            <GlassSelector
                                value={choice}
                                onChange={(next) => setChoices((current) => ({ ...current, [String(row.level)]: (Array.isArray(next) ? next[0] : next) === "roll" ? "roll" : "average" }))}
                                options={[
                                    { value: "average", label: `Média (${signed(row.average)})` },
                                    { value: "roll", label: row.rolled !== null ? `Rolado: ${row.die} (${signed(row.rolled)})` : "Rolar vida" },
                                ]}
                                disabled={disabled}
                                layoutId={`maddox-hp-${row.level}`}
                            />
                            <span className="ml-auto text-sm font-bold text-white" data-testid={`hit-points-gain-${row.level}`}>
                                {value !== null ? signed(value) : "—"}
                            </span>
                        </div>
                    )
                })}
            </div>
            {rolling && preset && (
                <div className="rounded-lg border border-white/10 bg-black/10 p-3" data-testid="hit-points-roller">
                    <DiceRollerPanel
                        preset={preset}
                        hideConfigurationControls
                        rollButtonLabel={`Rolar vida do nível ${rolling.level}`}
                        disableRolling={disabled}
                        rollRequest={async () => {
                            const result = await onRoll(rolling.level)
                            setAnimating(rolling.level)
                            return result
                        }}
                        onRollResolved={() => setAnimating(null)}
                    />
                </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-3">
                <p className="mr-auto text-sm text-white/70" data-testid="hit-points-total">
                    PV máximo: <span className="text-lg font-black text-white">{total ?? "—"}</span>
                </p>
                {!ready && <p className="text-xs text-white/50">Role os níveis marcados como “Rolar vida”.</p>}
                <Button type="button" onClick={() => setConfirming(true)} disabled={disabled || !ready}>
                    <Send aria-hidden /> Enviar pontos de vida
                </Button>
            </div>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Enviar pontos de vida?"
                description="Depois de enviar, só o Maddox pode reabrir o card."
                confirmLabel="Enviar"
                onConfirm={() => {
                    setConfirming(false)
                    onSubmit(Object.fromEntries(card.rows.map((row) => [String(row.level), choices[String(row.level)] === "roll" ? "rolagem" : "media"])))
                }}
            />
        </section>
    )
}

function HitPointsSummary({ card, color }: { card: MaddoxHitPointsDto; color: string }) {
    const superseded = card.status === "superseded"
    return (
        <section
            className={cn("space-y-3 rounded-xl border bg-white/[0.03] p-4", superseded && "opacity-60")}
            style={{ borderColor: `${color}40` }}
            aria-label="Pontos de vida enviados"
            data-testid="hit-points-card"
            data-status={card.status}
        >
            <header className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                <Lock className="h-4 w-4" style={{ color }} aria-hidden /> Pontos de vida enviados
                {superseded && <span className="ml-auto text-xs font-medium text-white/60">Reaberto abaixo</span>}
            </header>
            {card.choices ? (
                <>
                    <ul className="space-y-1 text-xs text-white/70" data-testid="hit-points-summary">
                        <li>Nível 1: {card.levelOne}</li>
                        {card.rows.map((row) => (
                            <li key={row.level}>
                                Nível {row.level}: {card.choices?.[String(row.level)] === "roll" ? `rolado ${row.die} (${signed(row.rolled ?? 0)})` : `média (${signed(row.average)})`}
                            </li>
                        ))}
                    </ul>
                    <p className="text-sm text-white/70">
                        PV máximo: <span className="text-lg font-black text-white" data-testid="hit-points-final">{card.total ?? "—"}</span>
                    </p>
                </>
            ) : (
                <p className="text-xs text-white/50">O card foi reaberto antes do envio.</p>
            )}
        </section>
    )
}
