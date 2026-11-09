"use client"

import { motion } from "framer-motion"
import { Brain, HeartPulse, ListOrdered, Skull, Swords } from "lucide-react"
import { cn } from "@/core/utils"
import { rarityColors } from "@/lib/config/colors"
import { HP_BAND_LABELS } from "../../../combat-rules"
import type { MaddoxTacticalCombatDto } from "../../../game-types"
import { MemberAvatar, OpexChip, RarityChip } from "../../campaigns/campaign-visuals"
import { COMBAT_COLOR } from "../GameCombatCard"
import { HP_BAND_COLORS, hpColor } from "./combat-visuals"

/**
 * Rastreador de iniciativa (Maddox 7): rodada, ordem, quem age (destaque na cor do rigor), PV dos personagens (o grupo
 * vê os números), a faixa dos adversários ("Ileso / Ferido / Muito ferido / Caído", sem número nem CA), condições e
 * concentração. `compact` = faixa horizontal para telas pequenas.
 */
export function InitiativeTracker({ combat, title, color, compact = false }: { combat: MaddoxTacticalCombatDto; title: string; color: string; compact?: boolean }) {
    const initiative = combat.phase === "initiative"
    if (compact) {
        return (
            <div className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden" data-testid="initiative-strip">
                {combat.order.map((slot) => (
                    <span key={slot.actorKey} className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", slot.defeated || slot.dead ? "text-white/40 line-through" : "text-white/80")} style={{ borderColor: slot.active ? color : "rgba(255,255,255,0.15)", background: slot.active ? `${color}22` : undefined }}>
                        {slot.name}
                        <span className="font-semibold">{slot.initiative ?? "…"}</span>
                    </span>
                ))}
            </div>
        )
    }
    return (
        <section className="rounded-xl border bg-card/40 p-4 backdrop-blur" style={{ borderColor: `${COMBAT_COLOR}40` }} aria-label="Ordem de iniciativa" data-testid="initiative-tracker">
            <header className="mb-3 flex items-center gap-2">
                <ListOrdered className="h-4 w-4" style={{ color: COMBAT_COLOR }} aria-hidden />
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{title}</h2>
                <RarityChip color={initiative ? rarityColors.legendary : COMBAT_COLOR}>{initiative ? "Rolando iniciativa" : `Rodada ${combat.round}`}</RarityChip>
            </header>
            <ol className="space-y-1.5">
                {combat.order.map((slot) => {
                    const out = slot.defeated || slot.dead
                    return (
                        <motion.li
                            layout
                            key={slot.actorKey}
                            className={cn("relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2", out && "opacity-50")}
                            style={{ borderColor: slot.active ? color : "rgba(255,255,255,0.08)", background: slot.active ? `${color}1a` : "rgba(255,255,255,0.02)", boxShadow: slot.active ? `0 0 0 1px ${color}55, 0 0 18px ${color}33` : undefined }}
                            data-testid="initiative-slot"
                            data-active={slot.active}
                            data-kind={slot.kind}
                        >
                            <span className="w-6 text-center text-sm font-black text-white" data-testid="initiative-value">
                                {slot.initiative ?? "…"}
                            </span>
                            {slot.kind === "character" ? (
                                <MemberAvatar name={slot.name} imageUrl={slot.portraitUrl} color={slot.active ? color : rarityColors.rare} className="h-7 w-7 shrink-0" />
                            ) : (
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: `${slot.side === "aliado" ? rarityColors.uncommon : COMBAT_COLOR}66` }}>
                                    {slot.defeated ? <Skull className="h-3.5 w-3.5 text-white/60" aria-hidden /> : <Swords className="h-3.5 w-3.5" style={{ color: slot.side === "aliado" ? rarityColors.uncommon : COMBAT_COLOR }} aria-hidden />}
                                </span>
                            )}
                            <div className="min-w-0 flex-1 space-y-1">
                                <p className={cn("flex items-center gap-1.5 truncate text-sm font-medium text-white", out && "line-through")}>
                                    {slot.name}
                                    {slot.opex && <OpexChip />}
                                </p>
                                {slot.hp ? (
                                    <div className="flex items-center gap-2" data-testid="initiative-hp">
                                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                                            <div className="h-full rounded-full transition-all" style={{ width: `${slot.hp.max ? Math.max(0, Math.min(100, (slot.hp.current / slot.hp.max) * 100)) : 0}%`, background: hpColor(slot.hp.current, slot.hp.max) }} />
                                        </div>
                                        <span className="text-[11px] font-semibold text-white/80">
                                            {slot.hp.current}/{slot.hp.max}
                                            {slot.hp.temp ? ` +${slot.hp.temp}` : ""}
                                        </span>
                                    </div>
                                ) : slot.band ? (
                                    <span className="text-[11px] font-semibold" style={{ color: HP_BAND_COLORS[slot.band] }} data-testid="initiative-band">
                                        {HP_BAND_LABELS[slot.band]}
                                    </span>
                                ) : null}
                                {(slot.conditions.length > 0 || slot.concentration || slot.dying || slot.stable || slot.dead) && (
                                    <div className="flex flex-wrap gap-1">
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
                                )}
                            </div>
                        </motion.li>
                    )
                })}
            </ol>
        </section>
    )
}
