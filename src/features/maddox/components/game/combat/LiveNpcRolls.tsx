"use client"

import { rarityColors } from "@/lib/config/colors"
import { CRITICAL_STAGE_CONFIG } from "@/features/dice-roller/components/critical-highlight"
import { DiceResultTooltip } from "@/features/dice-roller/components/dice-result-tooltip"
import type { MaddoxLiveRollDto } from "../../../game-types"
import { RarityChip } from "../../campaigns/campaign-visuals"
import { ReplayDie } from "./ReplayDie"

const VERDICTS: Record<NonNullable<MaddoxLiveRollDto["verdict"]>, { label: string; color: string }> = {
    hit: { label: "Acertou", color: rarityColors.uncommon },
    miss: { label: "Errou", color: rarityColors.artifact },
    critical: { label: "Crítico!", color: CRITICAL_STAGE_CONFIG["critical-success"].color },
    fumble: { label: "Falha crítica!", color: CRITICAL_STAGE_CONFIG["critical-failure"].color },
    success: { label: "Passou", color: rarityColors.uncommon },
    fail: { label: "Falhou", color: rarityColors.artifact },
}

/** Linha do resultado de um dado já parado (ataque com o veredito, dano, salvaguarda). */
function RollResult({ item }: { item: MaddoxLiveRollDto }) {
    const verdict = item.verdict ? VERDICTS[item.verdict] : null
    return (
        <li className="flex flex-wrap items-center gap-2 text-xs text-white/80" data-testid="live-roll-result" data-step={item.step}>
            <span className="font-semibold text-white/60">{item.actorName}</span>
            <span className="text-white/70">{item.label}</span>
            {item.targetName && <span className="text-white/60">→ {item.targetName}</span>}
            <span className="text-base font-black text-white" data-testid="live-roll-total">
                <DiceResultTooltip roll={item.roll} criticalState={item.step === "attack" ? undefined : null}>
                    {item.roll.total}
                </DiceResultTooltip>
            </span>
            {verdict && (
                <span data-testid="live-roll-verdict" data-verdict={item.verdict}>
                    <RarityChip color={verdict.color} className="text-[11px] font-semibold">
                        {verdict.label}
                    </RarityChip>
                </span>
            )}
            {item.step !== "attack" && item.step !== "save" && item.amount !== null && (
                <span className="font-semibold" style={{ color: item.step === "heal" ? rarityColors.uncommon : rarityColors.artifact }}>
                    {item.step === "heal" ? `+${item.amount} PV` : `${item.amount} de dano${item.damageType ? ` ${item.damageType}` : ""}`}
                </span>
            )}
        </li>
    )
}

/**
 * Dados de um bloco de NPC ao vivo (DND-25): rolam um de cada vez, na ordem em que o servidor os rolou (ataque, depois o
 * dano; Ataques Múltiplos em sequência). `settled` = quantos já pararam (o texto da narração espera todos pararem).
 */
export function LiveNpcRolls({ rolls, settled, onSettled }: { rolls: readonly MaddoxLiveRollDto[]; settled: number; onSettled: (count: number) => void }) {
    if (!rolls.length) return null
    const current = rolls[settled]
    return (
        <div className="space-y-2 pb-2" data-testid="live-npc-rolls">
            {settled > 0 && (
                <ul className="space-y-1">
                    {rolls.slice(0, settled).map((item) => (
                        <RollResult key={item.id} item={item} />
                    ))}
                </ul>
            )}
            {current && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/70" data-testid="live-roll-current">
                    <span className="font-semibold">{current.actorName}</span>
                    <span>{current.label}</span>
                    {current.targetName && <span>→ {current.targetName}</span>}
                    <ReplayDie key={current.id} roll={current.roll} label={`${current.actorName} · ${current.label}`} onSettled={() => onSettled(settled + 1)} />
                </div>
            )}
        </div>
    )
}
