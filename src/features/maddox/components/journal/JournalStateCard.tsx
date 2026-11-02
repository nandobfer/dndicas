"use client"

import { Compass, ScrollText } from "lucide-react"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Markdown } from "@/components/ui/opex/markdown"
import { rarityColors } from "@/lib/config/colors"
import { MADDOX_QUEST_STATUS_DEFS } from "../../constants"
import type { MaddoxJournalSummaryDto } from "../../journal-types"
import { RarityChip } from "../campaigns/campaign-visuals"

const STATE_FIELDS = [
    { key: "scene", label: "Cena" },
    { key: "location", label: "Local" },
    { key: "situation", label: "Situação" },
    { key: "pendingDecision", label: "Decisão aguardada" },
] as const

/** Situação atual da história (o checkpoint do Maddox, sem segredos) e as missões ativas. */
export function JournalStateCard({ summary, color }: { summary: MaddoxJournalSummaryDto; color: string }) {
    const filled = STATE_FIELDS.filter((field) => summary.state[field.key].trim())
    return (
        <Card className="h-fit" data-testid="journal-state">
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Compass className="h-4 w-4" style={{ color }} aria-hidden /> Situação atual
                    {summary.state.updatedTurn !== null && filled.length > 0 && <span className="text-xs font-normal text-white/50">atualizada no turno {summary.state.updatedTurn}</span>}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {filled.length === 0 ? (
                    <p className="text-sm text-white/60">O Maddox ainda não registrou a situação atual.</p>
                ) : (
                    <dl className="grid gap-3 sm:grid-cols-2">
                        {filled.map((field) => (
                            <div key={field.key} className="space-y-0.5" data-testid={`journal-state-${field.key}`}>
                                <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
                                    {field.label}
                                </dt>
                                <dd className="text-sm text-white/90">
                                    <Markdown lineAction={null}>{summary.state[field.key]}</Markdown>
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
                {summary.activeQuests.length > 0 && (
                    <div className="space-y-2 border-t border-white/10 pt-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/70">
                            <ScrollText className="h-3.5 w-3.5" aria-hidden /> Missões ativas
                        </p>
                        <ul className="flex flex-wrap gap-1.5" aria-label="Missões ativas">
                            {summary.activeQuests.map((quest) => (
                                <li key={quest.id}>
                                    <RarityChip color={rarityColors[MADDOX_QUEST_STATUS_DEFS.ativa.rarity]}>{quest.title}</RarityChip>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
