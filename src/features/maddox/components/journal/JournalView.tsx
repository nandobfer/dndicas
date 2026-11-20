"use client"

import { useState } from "react"
import { BookMarked, BookOpen, Image as ImageIcon, MapPin, ScrollText, Search, UserRound, Users } from "lucide-react"
import { Markdown } from "@/components/ui/opex/markdown"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import type { MaddoxJournalSummaryDto } from "../../journal-types"
import { rigorColor } from "../campaigns/campaign-visuals"
import { AnimatedExpand } from "../AnimatedExpand"
import { MADDOX_JOURNAL_NOTE_KINDS, type MaddoxJournalTab } from "./journal-links"
import { useJournalNavigation } from "./journal-navigation"
import { JournalChapterList } from "./JournalChapterList"
import { JournalImageFilter, JournalImageGallery } from "./JournalImageGallery"
import { JournalMemoryList, NoteKindFilter, QuestStatusFilter } from "./JournalMemoryList"
import { JournalNpcList } from "./JournalNpcList"
import { JournalPartyList } from "./JournalPartyList"
import { JournalSearch } from "./JournalSearch"
import { JournalStateCard } from "./JournalStateCard"
import { announceJournalHash } from "./use-journal-hash-target"

export const journalErrorStatus = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status

/**
 * Corpo do diário (busca, abas e a situação da campanha), comum à página `/campanhas/[id]/diario` e à janela da mesa
 * (DND-77). Aba, filtros e âncora vêm da navegação do provedor (URL na página, estado local na janela).
 */
export function JournalView({ summary }: { summary: MaddoxJournalSummaryDto }) {
    const navigation = useJournalNavigation()
    if (!navigation) throw new Error("JournalView precisa de um JournalNavigationProvider")
    const { tab, noteKind, questFilter, imageKind } = navigation
    const color = rigorColor(summary.rigor)
    const [term, setTerm] = useState("")

    const { counts } = summary
    const notes = MADDOX_JOURNAL_NOTE_KINDS.reduce((sum, kind) => sum + counts.memories[kind], 0)
    const tabs: IntegrationTabDef<MaddoxJournalTab>[] = [
        { id: "capitulos", label: "Capítulos", icon: BookMarked, badge: counts.chapters ?? 0 },
        { id: "imagens", label: "Imagens", icon: ImageIcon, badge: counts.images ?? 0 },
        { id: "npcs", label: "NPCs", icon: UserRound, badge: counts.npcs },
        { id: "locais", label: "Locais", icon: MapPin, badge: counts.memories.local },
        { id: "missoes", label: "Missões", icon: ScrollText, badge: counts.memories.missao },
        { id: "anotacoes", label: "Anotações", icon: BookOpen, badge: notes },
        { id: "grupo", label: "Grupo", icon: Users, badge: counts.party },
    ]

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]" data-testid="journal-view">
            <div className="min-w-0 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Search className="h-4 w-4" style={{ color }} aria-hidden /> Buscar no diário
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <JournalSearch
                            campaignId={summary.campaignId}
                            color={color}
                            term={term}
                            onTermChange={setTerm}
                            onNavigate={() => {
                                setTerm("")
                                if (!navigation.local) announceJournalHash()
                            }}
                        />
                    </CardContent>
                </Card>

                <IntegrationTabs tabs={tabs} active={tab} onSelect={navigation.selectTab} pendingTab={null} onConfirmDiscard={() => undefined} onCancelDiscard={() => undefined} label="Seções do diário">
                    {tab === "capitulos" && <JournalChapterList campaignId={summary.campaignId} color={color} />}
                    {tab === "imagens" && (
                        <div className="space-y-4">
                            <JournalImageFilter value={imageKind} onChange={navigation.selectImageKind} />
                            <JournalImageGallery campaignId={summary.campaignId} color={color} kind={imageKind} />
                        </div>
                    )}
                    {tab === "npcs" && <JournalNpcList campaignId={summary.campaignId} color={color} manageOpex={Boolean(summary.canManageOpexNpcs)} />}
                    {tab === "locais" && <JournalMemoryList campaignId={summary.campaignId} color={color} kind="local" />}
                    {tab === "missoes" && (
                        <div className="space-y-4">
                            <QuestStatusFilter value={questFilter} onChange={navigation.selectQuestFilter} />
                            <JournalMemoryList campaignId={summary.campaignId} color={color} kind="missao" status={questFilter === "todas" ? null : questFilter} />
                        </div>
                    )}
                    {tab === "anotacoes" && (
                        <div className="space-y-4">
                            <NoteKindFilter value={noteKind} counts={counts.memories} onChange={navigation.selectNoteKind} />
                            <JournalMemoryList campaignId={summary.campaignId} color={color} kind={noteKind} />
                        </div>
                    )}
                    {tab === "grupo" && <JournalPartyList campaignId={summary.campaignId} color={color} myMemberId={summary.myMemberId} />}
                </IntegrationTabs>
            </div>

            <aside className="space-y-6" aria-label="Situação da campanha">
                <JournalStateCard summary={summary} color={color} />
                <SettingCard summary={summary} color={color} />
            </aside>
        </div>
    )
}

function SettingCard({ summary, color }: { summary: MaddoxJournalSummaryDto; color: string }) {
    if (!summary.setting.trim() && !summary.openingSituation.trim()) return null
    return (
        <Card animate={false} className="h-fit" data-testid="journal-setting">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4" style={{ color }} aria-hidden /> Cenário
                </CardTitle>
            </CardHeader>
            <CardContent>
                <AnimatedExpand collapsedHeight={192} expandLabel="Ver o cenário completo" collapseLabel="Mostrar menos" data-testid="journal-setting-expand">
                    <div className="space-y-3">
                        {summary.setting.trim() && <Markdown lineAction={null}>{summary.setting}</Markdown>}
                        {summary.openingSituation.trim() && (
                            <section className="space-y-1">
                                <h3 className="text-sm font-semibold" style={{ color }}>
                                    Situação inicial
                                </h3>
                                <Markdown lineAction={null}>{summary.openingSituation}</Markdown>
                            </section>
                        )}
                    </div>
                </AnimatedExpand>
            </CardContent>
        </Card>
    )
}
