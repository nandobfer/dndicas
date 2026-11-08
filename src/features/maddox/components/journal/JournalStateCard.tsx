"use client"

import type { ReactNode } from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { AlertTriangle, Clapperboard, Compass, Flag, MapPin, ScrollText, Signpost, type LucideIcon } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Markdown } from "@/components/ui/opex/markdown"
import { rarityColors } from "@/lib/config/colors"
import { cn } from "@/lib/utils"
import { MADDOX_QUEST_STATUS_DEFS } from "../../constants"
import type { MaddoxJournalStateDto, MaddoxJournalSummaryDto } from "../../journal-types"
import { RarityChip } from "../campaigns/campaign-visuals"
import { AnimatedExpand } from "../AnimatedExpand"

type StateField = Exclude<keyof MaddoxJournalStateDto, "updatedTurn">

const STATE_FIELDS: readonly { key: StateField; label: string; icon: LucideIcon }[] = [
    { key: "scene", label: "Cena", icon: Clapperboard },
    { key: "location", label: "Local", icon: MapPin },
    { key: "situation", label: "Situação", icon: ScrollText },
    { key: "pendingDecision", label: "Decisão aguardada", icon: Signpost },
]

/** Há situação registrada: algum campo público preenchido ou o turno da última atualização. */
export function hasJournalState(state: MaddoxJournalStateDto | null | undefined): boolean {
    if (!state) return false
    return state.updatedTurn !== null || STATE_FIELDS.some((field) => (state[field.key] ?? "").trim().length > 0)
}

const listVariants: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }

interface Props {
    summary: MaddoxJournalSummaryDto
    color: string
    /** Corta o conteúdo longo com o "ver mais" animado (página da campanha). */
    collapsible?: boolean
    /** Rodapé opcional (ex.: link para o cenário completo). */
    footer?: ReactNode
    className?: string
}

/** Situação atual da história (o checkpoint do Maddox, sem segredos) e as missões ativas — no Diário e na página da campanha. */
export function JournalStateCard({ summary, color, collapsible = false, footer, className }: Props) {
    const reduceMotion = useReducedMotion()
    const itemVariants: Variants = reduceMotion
        ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0 } } }
        : { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }
    const filled = STATE_FIELDS.filter((field) => summary.state[field.key].trim())
    const byKey = (key: StateField) => filled.find((field) => field.key === key)

    const body = (
        <motion.div className="space-y-4" variants={listVariants} initial="hidden" animate="show">
            {filled.length === 0 ? (
                <motion.p variants={itemVariants} className="text-sm text-white/60">
                    O Maddox ainda não registrou a situação atual.
                </motion.p>
            ) : (
                <dl className="space-y-3">
                    {(["scene", "location", "situation"] as const).map((key) => {
                        const field = byKey(key)
                        if (!field) return null
                        const Icon = field.icon
                        return (
                            <motion.div key={key} variants={itemVariants} className={cn("flex gap-3", key === "location" && "items-center")} data-testid={`journal-state-${key}`}>
                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border" style={{ color, borderColor: `${color}44`, backgroundColor: `${color}14` }} aria-hidden>
                                    <Icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
                                        {field.label}
                                    </dt>
                                    <dd className={cn("text-sm leading-relaxed text-white/90", key === "location" && "font-medium text-white")}>
                                        <Markdown lineAction={null}>{summary.state[key]}</Markdown>
                                    </dd>
                                </div>
                            </motion.div>
                        )
                    })}
                    {byKey("pendingDecision") && (
                        <motion.div
                            variants={itemVariants}
                            className="relative overflow-hidden rounded-xl border p-3 pl-4"
                            style={{ borderColor: `${color}55`, background: `linear-gradient(135deg, ${color}26, transparent 70%)`, boxShadow: `inset 3px 0 0 ${color}` }}
                            data-testid="journal-state-pendingDecision"
                        >
                            <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
                                <Signpost className="h-3.5 w-3.5" aria-hidden /> Decisão aguardada
                            </dt>
                            <dd className="mt-1 text-sm font-medium leading-relaxed text-white">
                                <Markdown lineAction={null}>{summary.state.pendingDecision}</Markdown>
                            </dd>
                        </motion.div>
                    )}
                </dl>
            )}
            {summary.memoriesUnavailable && (
                <motion.p variants={itemVariants} className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-white/80" role="status" data-testid="journal-memories-unavailable">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" aria-hidden /> As anotações da campanha (missões, locais e eventos) estão indisponíveis no momento. Tente de novo em instantes.
                </motion.p>
            )}
            {summary.activeQuests.length > 0 && (
                <motion.div variants={itemVariants} className="space-y-2 border-t border-white/10 pt-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/70">
                        <Flag className="h-3.5 w-3.5" style={{ color: rarityColors[MADDOX_QUEST_STATUS_DEFS.ativa.rarity] }} aria-hidden /> Missões ativas
                    </p>
                    <ul className="flex flex-wrap gap-1.5" aria-label="Missões ativas">
                        {summary.activeQuests.map((quest) => (
                            <li key={quest.id}>
                                <RarityChip color={rarityColors[MADDOX_QUEST_STATUS_DEFS.ativa.rarity]} className="px-2.5 py-1 text-xs">
                                    <Flag className="h-3 w-3" aria-hidden /> {quest.title}
                                </RarityChip>
                            </li>
                        ))}
                    </ul>
                </motion.div>
            )}
        </motion.div>
    )

    return (
        <Card animate={false} className={cn("relative h-fit overflow-hidden", className)} data-testid="journal-state">
            <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 0% 0%, ${color}2e, transparent 55%)` }} aria-hidden />
            <CardHeader className="relative">
                <CardTitle className="flex flex-wrap items-center gap-2.5 text-base">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ color, borderColor: `${color}66`, backgroundColor: `${color}1f`, boxShadow: `0 0 18px ${color}33` }} aria-hidden>
                        <Compass className="h-4 w-4" />
                    </span>
                    Situação atual
                    {summary.state.updatedTurn !== null && filled.length > 0 && <RarityChip color={color}>atualizada no turno {summary.state.updatedTurn}</RarityChip>}
                </CardTitle>
            </CardHeader>
            <CardContent className="relative space-y-3">
                {collapsible ? (
                    <AnimatedExpand collapsedHeight={240} expandLabel="Ver mais" collapseLabel="Mostrar menos" data-testid="journal-state-expand">
                        {body}
                    </AnimatedExpand>
                ) : (
                    body
                )}
                {footer}
            </CardContent>
        </Card>
    )
}
