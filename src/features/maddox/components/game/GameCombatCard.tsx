"use client"

import { motion } from "framer-motion"
import { Coins, Flag, Gift, Package, Swords } from "lucide-react"
import { rarityColors } from "@/lib/config/colors"
import { MADDOX_COMBAT_OUTCOME_LABELS, MADDOX_COMBATANT_OUTCOME_LABELS, type MaddoxCombatOutcome } from "../../constants"
import type { MaddoxGameCombatEventDto, MaddoxCombatRewardDto } from "../../game-types"
import { RarityChip } from "../campaigns/campaign-visuals"

/** Cor do combate em andamento (chip do cabeçalho e card de início). */
export const COMBAT_COLOR = rarityColors.artifact

/** Cor do resultado: vitória verde, derrota vermelha, fuga e trégua âmbar, interrompido neutro. */
export const COMBAT_OUTCOME_COLORS: Record<MaddoxCombatOutcome, string> = {
    vitoria: rarityColors.uncommon,
    derrota: rarityColors.artifact,
    fuga: rarityColors.legendary,
    tregua: rarityColors.legendary,
    interrompido: rarityColors.common,
}

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2, ease: "easeOut" as const } }

const RewardIcon = ({ reward }: { reward: MaddoxCombatRewardDto }) => {
    const Icon = reward.kind === "moedas" ? Coins : reward.kind === "item" ? Package : Gift
    return <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
}

/** Card de início ou fim do combate narrativo (Maddox 6), entre as falas da mesa. */
export function GameCombatCard({ combat }: { combat: MaddoxGameCombatEventDto }) {
    const ended = combat.event === "end"
    const accent = ended && combat.outcome ? COMBAT_OUTCOME_COLORS[combat.outcome] : COMBAT_COLOR
    const people = combat.combatants
    return (
        <motion.div {...fade} className="pb-3" data-testid={ended ? "combat-end-card" : "combat-start-card"}>
            <div className="space-y-2.5 rounded-xl border bg-white/[0.04] px-4 py-3 text-sm" style={{ borderColor: `${accent}55`, boxShadow: `inset 3px 0 0 ${accent}` }} data-accent={accent}>
                <div className="flex flex-wrap items-center gap-2">
                    {ended ? <Flag className="h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden /> : <Swords className="h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />}
                    <p className="font-semibold text-white">{ended ? "Fim do combate" : "Combate!"}</p>
                    <span className="min-w-0 break-words text-white/80">{combat.title}</span>
                    {ended && combat.outcome && (
                        <RarityChip color={accent} className="ml-auto">
                            <span data-testid="combat-outcome">{MADDOX_COMBAT_OUTCOME_LABELS[combat.outcome]}</span>
                        </RarityChip>
                    )}
                </div>
                {!ended && combat.location && <p className="text-xs text-white/60">{combat.location}</p>}
                {ended && combat.summary && <p className="whitespace-pre-line break-words text-white/80" data-testid="combat-summary">{combat.summary}</p>}

                {people.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-white/60">{ended ? "Adversários e aliados" : "Na luta"}</p>
                        <ul className="flex flex-wrap gap-1.5" aria-label={ended ? "Desfecho dos participantes" : "Participantes do combate"}>
                            {people.map((item) => (
                                <li key={`${item.side}-${item.name}`} data-testid="combatant">
                                    <RarityChip color={item.side === "aliado" ? rarityColors.uncommon : COMBAT_COLOR}>
                                        {item.name}
                                        {item.quantity > 1 ? ` (${item.quantity})` : ""}
                                        {item.side === "aliado" ? " · aliado" : ""}
                                        {ended && item.outcome ? ` · ${MADDOX_COMBATANT_OUTCOME_LABELS[item.outcome]}` : ""}
                                    </RarityChip>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {ended && combat.rewards.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-xs font-medium text-white/60">Recompensas</p>
                        <ul className="space-y-1" aria-label="Recompensas do combate">
                            {combat.rewards.map((reward, index) => (
                                <li key={index} className="flex flex-wrap items-start gap-1.5 text-white/80" data-testid="combat-reward">
                                    <RewardIcon reward={reward} />
                                    <span className="min-w-0 break-words">{reward.description}</span>
                                    {reward.applied && (
                                        <RarityChip color={rarityColors.uncommon}>
                                            <span data-testid="combat-reward-applied">Na ficha</span>
                                        </RarityChip>
                                    )}
                                    {reward.warning && <span className="w-full pl-5 text-xs text-amber-300/90">{reward.warning}</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {ended && (
                    <p className="text-xs text-white/50">
                        {`Durou ${Math.max(1, combat.masterTurns)} ${Math.max(1, combat.masterTurns) === 1 ? "narração" : "narrações"} (turnos ${combat.startedTurn}–${combat.endedTurn ?? combat.startedTurn}).`}
                    </p>
                )}
            </div>
        </motion.div>
    )
}
