"use client"

import { motion } from "framer-motion"
import { BookMarked, Sparkles, TrendingUp } from "lucide-react"
import { rarityColors } from "@/lib/config/colors"
import { MADDOX_LEVEL_UP_TEXT } from "../../constants"
import type { MaddoxGameMessageDto, MaddoxLevelUpStepDto } from "../../game-types"

/**
 * Cards da progressão de nível no chat (DND-56): "Subida de nível" (status de cada personagem, ao vivo pelo estado da
 * mesa), XP concedida e capítulo encerrado.
 */

const STATUS_LABEL: Record<MaddoxLevelUpStepDto["status"], string> = {
    pending: MADDOX_LEVEL_UP_TEXT.pending,
    deciding: MADDOX_LEVEL_UP_TEXT.deciding,
    "waiting-combat": MADDOX_LEVEL_UP_TEXT.waitingCombat,
    failed: MADDOX_LEVEL_UP_TEXT.failed,
    done: MADDOX_LEVEL_UP_TEXT.done,
}

const ATTRIBUTE_SHORT: Record<string, string> = { strength: "FOR", dexterity: "DES", constitution: "CON", intelligence: "INT", wisdom: "SAB", charisma: "CAR" }

/** Linhas do que o personagem ganhou (PV, subclasse, talento, traços e magias). */
export function gainLines(step: MaddoxLevelUpStepDto): string[] {
    const gains = step.gains
    if (!gains) return []
    const lines = [`PV +${gains.hp.gain} (${gains.hp.method === "roll" ? `rolagem${gains.hp.die !== null ? `: ${gains.hp.die}` : ""}` : "média"}) → ${gains.hp.hpMax}`]
    if (gains.subclass) lines.push(`Subclasse: ${gains.subclass}`)
    if (gains.feat) {
        const parts = Object.entries(gains.feat.attributes ?? {})
            .filter(([, value]) => value)
            .map(([key, value]) => `${ATTRIBUTE_SHORT[key] ?? key} +${value}`)
        lines.push(`Talento: ${gains.feat.name}${parts.length ? ` (${parts.join(", ")})` : ""}`)
    }
    if (gains.traits.length) lines.push(`Traços: ${gains.traits.join(", ")}`)
    if (gains.cantrips.length) lines.push(`Truques: ${gains.cantrips.join(", ")}`)
    if (gains.spells.length) lines.push(`Magias: ${gains.spells.join(", ")}`)
    if (gains.swap) lines.push(`Troca: ${gains.swap.from} → ${gains.swap.to}`)
    return lines
}

export function LevelUpCard({ message, onComplete }: { message: MaddoxGameMessageDto; onComplete?: (step: MaddoxLevelUpStepDto) => void }) {
    const card = message.levelUp
    if (!card) return null
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center pb-4" data-testid="level-up-card">
            <div className="w-full max-w-xl rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4">
                <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-emerald-100">
                    <TrendingUp className="h-4 w-4 text-emerald-300" aria-hidden /> {MADDOX_LEVEL_UP_TEXT.cardTitle} · nível {card.toLevel}
                </p>
                {card.reason && <p className="mt-1 text-xs text-white/65">{card.reason}</p>}
                <ul className="mt-3 space-y-2">
                    {card.entries.map((step) => {
                        const lines = gainLines(step)
                        return (
                            <li key={step.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2" data-testid="level-up-entry">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-white">
                                        {step.characterName} <span className="text-white/45">· nível {step.fromLevel} → {step.toLevel}</span>
                                        {step.kind === "opex" && <span className="ml-2 rounded border border-white/15 px-1 text-[10px] text-white/55">Opex</span>}
                                    </span>
                                    <span className={step.status === "done" ? "text-xs font-bold text-emerald-300" : step.status === "failed" ? "text-xs font-bold text-amber-300" : "text-xs font-bold text-white/60"} data-testid="level-up-status">
                                        {STATUS_LABEL[step.status]}
                                    </span>
                                </div>
                                {lines.length > 0 && (
                                    <ul className="mt-1 space-y-0.5 text-xs text-white/70" data-testid="level-up-gains">
                                        {lines.map((line) => (
                                            <li key={line}>{line}</li>
                                        ))}
                                    </ul>
                                )}
                                {step.error && <p className="mt-1 text-xs text-amber-200">{step.error}</p>}
                                {step.canComplete && onComplete && (
                                    <button type="button" onClick={() => onComplete(step)} className="mt-2 rounded-lg border border-emerald-300/40 bg-emerald-500/20 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-50 hover:bg-emerald-500/30">
                                        {MADDOX_LEVEL_UP_TEXT.banner}
                                    </button>
                                )}
                            </li>
                        )
                    })}
                </ul>
            </div>
        </motion.div>
    )
}

export function ExperienceCard({ message }: { message: MaddoxGameMessageDto }) {
    const card = message.experience
    if (!card) return null
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center pb-3" data-testid="experience-card">
            <div className="max-w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-white/75">
                <p className="flex items-center justify-center gap-1.5 font-semibold text-white/85">
                    <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: rarityColors.rare }} aria-hidden />
                    {MADDOX_LEVEL_UP_TEXT.experienceTitle}: {card.total.toLocaleString("pt-BR")} XP · {card.reason}
                </p>
                <ul className="mt-1 space-y-0.5 text-center">
                    {card.entries.map((entry) => (
                        <li key={entry.characterId}>
                            {entry.characterName}: +{entry.amount.toLocaleString("pt-BR")} XP (total {entry.total.toLocaleString("pt-BR")})
                        </li>
                    ))}
                </ul>
            </div>
        </motion.div>
    )
}

export function ChapterLine({ message }: { message: MaddoxGameMessageDto }) {
    const chapter = message.chapter
    if (!chapter) return null
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center pb-3" data-testid="chapter-line">
            <div className="max-w-full rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/75">
                <p className="flex items-center justify-center gap-1.5 font-semibold text-white/85">
                    <BookMarked className="h-3.5 w-3.5 shrink-0" style={{ color: rarityColors.veryRare }} aria-hidden />
                    {MADDOX_LEVEL_UP_TEXT.chapterTitle}: {chapter.title}
                </p>
            </div>
        </motion.div>
    )
}
