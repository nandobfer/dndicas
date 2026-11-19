"use client"

import { AlertTriangle, Brain, Check, Clock, HeartPulse, Loader2 } from "lucide-react"
import { cn } from "@/core/utils"
import { rarityColors } from "@/lib/config/colors"
import { HP_BAND_LABELS } from "../../../combat-rules"
import type { MaddoxCombatPrepSlotDto, MaddoxTacticalSlotDto } from "../../../game-types"
import { RarityChip } from "../../campaigns/campaign-visuals"
import { HP_BAND_COLORS } from "./combat-visuals"
import { HpBar, type HpBarValue } from "./HpBar"

const PREP_LABELS: Record<MaddoxCombatPrepSlotDto["status"], string> = { waiting: "Aguardando", preparing: "Preparando…", asking: "Pergunta ao jogador", ready: "Pronto", failed: "Falhou" }
const PREP_COLORS: Record<MaddoxCombatPrepSlotDto["status"], string> = { waiting: rarityColors.common, preparing: rarityColors.legendary, asking: rarityColors.rare, ready: rarityColors.uncommon, failed: rarityColors.artifact }

/** DND-41: selo da preparação da mesa de um personagem. */
export function PrepSeal({ prep }: { prep: MaddoxCombatPrepSlotDto }) {
    const Icon = prep.status === "ready" ? Check : prep.status === "failed" ? AlertTriangle : prep.status === "preparing" ? Loader2 : Clock
    return (
        <span data-testid="initiative-prep" data-status={prep.status}>
            <RarityChip color={PREP_COLORS[prep.status]}>
                <Icon className={cn("h-3 w-3", prep.status === "preparing" && "animate-spin")} aria-hidden /> {PREP_LABELS[prep.status]}
            </RarityChip>
        </span>
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
    // Com os números à mostra, o 0 PV continua dizendo "Caído" (a faixa não aparece no lugar do número).
    const fallen = slot.kind === "combatant" && slot.defeated && Boolean(slot.hp)
    if (!fallen && slot.conditions.length === 0 && !slot.concentration && !slot.dying && !slot.stable && !slot.dead) return null
    return (
        <div className="flex flex-wrap gap-1">
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
        </div>
    )
}
