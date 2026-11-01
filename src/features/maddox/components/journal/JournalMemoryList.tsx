"use client"

import { BookOpen, MapPin, ScrollText } from "lucide-react"
import { GlassSelector } from "@/components/ui/glass-selector"
import { rarityColors } from "@/lib/config/colors"
import { MADDOX_CAMPAIGN_MEMORY_KIND_LABELS, MADDOX_QUEST_STATUSES, MADDOX_QUEST_STATUS_DEFS, type MaddoxCampaignMemoryKind, type MaddoxQuestStatus } from "../../constants"
import { useMaddoxJournalMemories } from "../../hooks/useMaddoxJournal"
import { RarityChip } from "../campaigns/campaign-visuals"
import { journalAnchor, MADDOX_JOURNAL_NOTE_KINDS, type MaddoxJournalNoteKind } from "./journal-links"
import { JournalItemCard, JournalListState, JournalText, LoadMore } from "./JournalLists"
import { useJournalHashTarget } from "./use-journal-hash-target"

const EMPTY_TEXTS: Record<MaddoxCampaignMemoryKind, string> = {
    local: "Nenhum local anotado ainda: o Maddox registra os lugares conforme o grupo os descobre.",
    missao: "Nenhuma missão ainda: as missões aparecem aqui quando o grupo as assume.",
    evento: "Nenhum evento anotado ainda: os marcos da história aparecem aqui.",
    relacao: "Nenhuma relação anotada ainda.",
    fato: "Nenhum fato anotado ainda.",
    outro: "Nenhuma anotação deste tipo ainda.",
}

const ICONS = { local: MapPin, missao: ScrollText } as const

export type QuestFilter = MaddoxQuestStatus | "todas"

const QUEST_FILTER_OPTIONS = [
    { value: "todas" as QuestFilter, label: "Todas" },
    ...MADDOX_QUEST_STATUSES.map((status) => ({ value: status as QuestFilter, label: MADDOX_QUEST_STATUS_DEFS[status].label, activeColor: rarityColors[MADDOX_QUEST_STATUS_DEFS[status].rarity] })),
]

export function QuestStatusFilter({ value, onChange }: { value: QuestFilter; onChange: (value: QuestFilter) => void }) {
    return <GlassSelector options={QUEST_FILTER_OPTIONS} value={value} onChange={(next) => onChange(next as QuestFilter)} size="sm" layoutId="journal-quest-filter" />
}

export function NoteKindFilter({ value, counts, onChange }: { value: MaddoxJournalNoteKind; counts: Record<MaddoxCampaignMemoryKind, number>; onChange: (value: MaddoxJournalNoteKind) => void }) {
    const options = MADDOX_JOURNAL_NOTE_KINDS.map((kind) => ({ value: kind, label: `${MADDOX_CAMPAIGN_MEMORY_KIND_LABELS[kind]} (${counts[kind]})` }))
    return <GlassSelector options={options} value={value} onChange={(next) => onChange(next as MaddoxJournalNoteKind)} size="sm" layoutId="journal-note-filter" />
}

/** Anotações públicas de um tipo (locais, missões, eventos…), da mais recente para a mais antiga. */
export function JournalMemoryList({ campaignId, color, kind, status = null }: { campaignId: string; color: string; kind: MaddoxCampaignMemoryKind; status?: MaddoxQuestStatus | null }) {
    const memories = useMaddoxJournalMemories(campaignId, kind, status)
    const items = memories.data?.pages.flatMap((page) => page.items) ?? []
    const target = useJournalHashTarget(items.length > 0, `${kind}:${status}`)
    if (memories.isLoading || memories.isError || items.length === 0) {
        return (
            <JournalListState
                loading={memories.isLoading}
                error={memories.isError}
                empty={items.length === 0}
                emptyText={status ? `Nenhuma missão ${MADDOX_QUEST_STATUS_DEFS[status].label.toLowerCase()}.` : EMPTY_TEXTS[kind]}
                icon={kind === "local" || kind === "missao" ? ICONS[kind] : BookOpen}
                onRetry={() => void memories.refetch()}
            />
        )
    }
    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2" aria-label={MADDOX_CAMPAIGN_MEMORY_KIND_LABELS[kind]}>
                {items.map((memory) => {
                    const anchor = journalAnchor.memory(memory.id)
                    const quest = memory.status ? MADDOX_QUEST_STATUS_DEFS[memory.status] : null
                    return (
                        <JournalItemCard key={memory.id} anchor={anchor} highlighted={target === anchor} color={color} testId={`journal-memory-${memory.id}`}>
                            <header className="flex flex-wrap items-center gap-2">
                                <h3 className="min-w-0 break-words text-sm font-semibold text-white">{memory.title}</h3>
                                {quest && (
                                    <span data-testid="journal-quest-status" data-status={memory.status}>
                                        <RarityChip color={rarityColors[quest.rarity]}>{quest.label}</RarityChip>
                                    </span>
                                )}
                                {memory.turnNumber !== null && <span className="ml-auto text-[11px] text-white/50">Turno {memory.turnNumber}</span>}
                            </header>
                            <JournalText>{memory.text}</JournalText>
                            {memory.tags.length > 0 && (
                                <ul className="flex flex-wrap gap-1" aria-label="Marcadores">
                                    {memory.tags.map((tag) => (
                                        <li key={tag} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60">
                                            {tag}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </JournalItemCard>
                    )
                })}
            </div>
            <LoadMore hasMore={Boolean(memories.hasNextPage)} loading={memories.isFetchingNextPage} onLoad={() => void memories.fetchNextPage()} />
        </div>
    )
}
