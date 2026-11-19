"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Brain, Check, Clock, HeartPulse, Loader2 } from "lucide-react"
import { SimpleGlassTooltip, GlassTooltipProvider } from "@/components/ui/glass-tooltip"
import { cn } from "@/core/utils"
import { rarityColors } from "@/lib/config/colors"
import { prepElapsedLabel } from "../../../combat-prep-stall"
import { HP_BAND_LABELS } from "../../../combat-rules"
import type { MaddoxCombatPrepSlotDto, MaddoxTacticalSlotDto } from "../../../game-types"
import { RarityChip } from "../../campaigns/campaign-visuals"
import { HP_BAND_COLORS } from "./combat-visuals"
import { HpBar, type HpBarValue } from "./HpBar"

const PREP_LABELS: Record<MaddoxCombatPrepSlotDto["status"], string> = { waiting: "Aguardando", preparing: "Preparando…", asking: "Pergunta ao jogador", ready: "Pronto", failed: "Falhou" }
const PREP_COLORS: Record<MaddoxCombatPrepSlotDto["status"], string> = { waiting: rarityColors.common, preparing: rarityColors.legendary, asking: rarityColors.rare, ready: rarityColors.uncommon, failed: rarityColors.artifact }

/** DND-75: relógio da tela (atualiza a cada `intervalMs`) para os tempos decorridos. */
export function useNow(intervalMs: number, enabled = true): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        if (!enabled) return
        const timer = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(timer)
    }, [enabled, intervalMs])
    return now
}

const sinceTime = (since: string) => new Date(since).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

/** DND-41: selo da preparação da mesa de um personagem. DND-75: "Preparando…" mostra há quanto tempo. */
export function PrepSeal({ prep }: { prep: MaddoxCombatPrepSlotDto }) {
    const timed = prep.status === "preparing" && Boolean(prep.since)
    const now = useNow(30_000, timed)
    const Icon = prep.status === "ready" ? Check : prep.status === "failed" ? AlertTriangle : prep.status === "preparing" ? Loader2 : Clock
    const elapsed = timed ? prepElapsedLabel(prep.since, now) : null
    const seal = (
        <span data-testid="initiative-prep" data-status={prep.status} tabIndex={timed ? 0 : undefined}>
            <RarityChip color={PREP_COLORS[prep.status]}>
                <Icon className={cn("h-3 w-3", prep.status === "preparing" && "animate-spin")} aria-hidden /> {PREP_LABELS[prep.status]}
                {elapsed && <span data-testid="initiative-prep-elapsed"> · {elapsed}</span>}
            </RarityChip>
        </span>
    )
    if (!timed || !prep.since) return seal
    return (
        <GlassTooltipProvider>
            <SimpleGlassTooltip content={`Preparando desde ${sinceTime(prep.since)}`}>{seal}</SimpleGlassTooltip>
        </GlassTooltipProvider>
    )
}

/**
 * PV de um combatente: barra com os números (personagens; combatentes do mestre quando a campanha mostra o PV do lado,
 * DND-53) ou a faixa "Ileso / Ferido / Muito ferido / Caído". `hp` substitui o PV do slot (ex.: o PV da ficha do assento).
 */
export function CombatantVitals({ slot, hp, name, className }: { slot: MaddoxTacticalSlotDto; hp?: HpBarValue | null; name: string; className?: string }) {
    const value = slot.hp ?? hp ?? null
    if (value) return <HpBar hp={value} name={name} className={className} />
    if (!slot.band) return null
    return (
        <span className="text-[11px] font-semibold" style={{ color: HP_BAND_COLORS[slot.band] }} data-testid="initiative-band">
            {HP_BAND_LABELS[slot.band]}
        </span>
    )
}

/** Situação do combatente: "Caído" com 0 PV à mostra, morto, morrendo, estável, condições e concentração. */
export function CombatantChips({ slot }: { slot: MaddoxTacticalSlotDto }) {
    if (!combatantHasChips(slot)) return null
    const fallen = combatantFallen(slot)
    return (
        <>
            {fallen && (
                <span data-testid="initiative-fallen">
                    <RarityChip color={HP_BAND_COLORS.caido}>{HP_BAND_LABELS.caido}</RarityChip>
                </span>
            )}
            {slot.dead && <RarityChip color={rarityColors.common}>Morto</RarityChip>}
            {slot.dying && (
                <RarityChip color={rarityColors.artifact}>
                    <HeartPulse className="h-3 w-3" aria-hidden /> Morrendo
                </RarityChip>
            )}
            {slot.stable && <RarityChip color={rarityColors.legendary}>Estável</RarityChip>}
            {slot.conditions.map((condition) => (
                <RarityChip key={condition.key} color={rarityColors.veryRare}>
                    {condition.label}
                </RarityChip>
            ))}
            {slot.concentration && (
                <RarityChip color={rarityColors.rare}>
                    <Brain className="h-3 w-3" aria-hidden /> {slot.concentration}
                </RarityChip>
            )}
        </>
    )
}

// Com os números à mostra, o 0 PV continua dizendo "Caído" (a faixa não aparece no lugar do número).
const combatantFallen = (slot: MaddoxTacticalSlotDto) => slot.kind === "combatant" && slot.defeated && Boolean(slot.hp)

/** O combatente tem algum chip de situação para mostrar. */
export const combatantHasChips = (slot: MaddoxTacticalSlotDto) => combatantFallen(slot) || slot.conditions.length > 0 || Boolean(slot.concentration) || Boolean(slot.dying) || Boolean(slot.stable) || Boolean(slot.dead)
