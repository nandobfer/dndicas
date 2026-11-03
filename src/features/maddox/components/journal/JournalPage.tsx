"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, BookOpen, ChevronDown, Dices, Image as ImageIcon, MapPin, MessageCircle, ScrollText, Search, UserRound, Users } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Markdown } from "@/components/ui/opex/markdown"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useAuth } from "@/core/hooks/useAuth"
import { cn } from "@/lib/utils"
import { MADDOX_QUEST_STATUSES } from "../../constants"
import { MADDOX_JOURNAL_IMAGE_KINDS, type MaddoxJournalImageKind } from "../../journal-schemas"
import type { MaddoxJournalSummaryDto } from "../../journal-types"
import { useMaddoxJournalSummary } from "../../hooks/useMaddoxJournal"
import { useMaddoxGameRealtime } from "../../hooks/useMaddoxGame"
import { RarityChip, RigorChip, rigorColor } from "../campaigns/campaign-visuals"
import { CampaignChatHeader } from "../CampaignChatHeader"
import { MADDOX_JOURNAL_NOTE_KINDS, parseJournalTab, type MaddoxJournalNoteKind, type MaddoxJournalTab } from "./journal-links"
import { JournalHistory } from "./JournalHistory"
import { JournalImageFilter, JournalImageGallery } from "./JournalImageGallery"
import { JournalMemoryList, NoteKindFilter, QuestStatusFilter, type QuestFilter } from "./JournalMemoryList"
import { JournalNpcList } from "./JournalNpcList"
import { JournalPartyList } from "./JournalPartyList"
import { JournalSearch } from "./JournalSearch"
import { JournalStateCard } from "./JournalStateCard"
import { announceJournalHash } from "./use-journal-hash-target"

const errorStatus = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status

/** `/campanhas/[id]/diario`: histórico, imagens, NPCs, locais, missões, anotações, o grupo e a busca — só o que os jogadores sabem. */
export function JournalPage({ campaignId }: { campaignId: string }) {
    const { userId } = useAuth()
    const summary = useMaddoxJournalSummary(campaignId)
    useMaddoxGameRealtime(userId)

    if (summary.isLoading) {
        return (
            <div className="space-y-6" aria-busy="true" aria-label="Carregando diário">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-96 w-full rounded-xl" />
            </div>
        )
    }
    if (summary.isError || !summary.data) {
        return (
            <div className="space-y-6">
                <Link href={`/campanhas/${campaignId}`} className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
                    <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar à campanha
                </Link>
                {errorStatus(summary.error) === 404 ? (
                    <EmptyState icon={BookOpen} title="Campanha não encontrada" description="Ela não existe ou você não participa dela." />
                ) : (
                    <ErrorState title="Não foi possível carregar o diário" onRetry={() => void summary.refetch()} />
                )}
            </div>
        )
    }
    return <Journal summary={summary.data} />
}

function Journal({ summary }: { summary: MaddoxJournalSummaryDto }) {
    const color = rigorColor(summary.rigor)
    const router = useRouter()
    const pathname = usePathname()
    const params = useSearchParams()
    const tab = parseJournalTab(params.get("aba"))
    const noteParam = params.get("tipo")
    const noteKind: MaddoxJournalNoteKind = (MADDOX_JOURNAL_NOTE_KINDS as readonly string[]).includes(noteParam ?? "") ? (noteParam as MaddoxJournalNoteKind) : "evento"
    const highlightId = params.get("msg")
    // Filtro das missões na URL (`?situacao=`): o link de um resultado da busca (`?aba=missoes#…`) o zera.
    const questParam = params.get("situacao")
    const questFilter: QuestFilter = (MADDOX_QUEST_STATUSES as readonly string[]).includes(questParam ?? "") ? (questParam as QuestFilter) : "todas"
    // Filtro das imagens na URL (`?imagens=`), como o das missões.
    const imageParam = params.get("imagens")
    const imageKind: MaddoxJournalImageKind = (MADDOX_JOURNAL_IMAGE_KINDS as readonly string[]).includes(imageParam ?? "") ? (imageParam as MaddoxJournalImageKind) : "todas"
    const [term, setTerm] = useState("")

    const navigate = (next: Record<string, string | null>) => {
        const query = new URLSearchParams(params.toString())
        for (const [key, value] of Object.entries(next)) {
            if (value === null) query.delete(key)
            else query.set(key, value)
        }
        const text = query.toString()
        router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false })
    }

    const { counts } = summary
    const notes = MADDOX_JOURNAL_NOTE_KINDS.reduce((sum, kind) => sum + counts.memories[kind], 0)
    const tabs: IntegrationTabDef<MaddoxJournalTab>[] = [
        { id: "historico", label: "Histórico", icon: MessageCircle },
        { id: "imagens", label: "Imagens", icon: ImageIcon, badge: counts.images ?? 0 },
        { id: "npcs", label: "NPCs", icon: UserRound, badge: counts.npcs },
        { id: "locais", label: "Locais", icon: MapPin, badge: counts.memories.local },
        { id: "missoes", label: "Missões", icon: ScrollText, badge: counts.memories.missao },
        { id: "anotacoes", label: "Anotações", icon: BookOpen, badge: notes },
        { id: "grupo", label: "Grupo", icon: Users, badge: counts.party },
    ]

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6" data-testid="journal-page">
            <CampaignChatHeader
                campaignId={summary.campaignId}
                color={color}
                icon={BookOpen}
                title={summary.name}
                subtitle="Diário da campanha"
                chips={
                    <>
                        <RigorChip rigor={summary.rigor} />
                        {summary.turnNumber > 0 && <RarityChip color={color}>Turno {summary.turnNumber}</RarityChip>}
                    </>
                }
                actions={
                    summary.status === "active" ? (
                        <Button size="sm" variant="outline" asChild>
                            <Link href={`/campanhas/${summary.campaignId}/mesa`}>
                                <Dices aria-hidden /> Voltar à mesa
                            </Link>
                        </Button>
                    ) : null
                }
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
                <div className="min-w-0 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Search className="h-4 w-4" style={{ color }} aria-hidden /> Buscar no diário
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <JournalSearch campaignId={summary.campaignId} color={color} term={term} onTermChange={setTerm} onNavigate={() => {
                                    setTerm("")
                                    announceJournalHash()
                                }} />
                        </CardContent>
                    </Card>

                    <IntegrationTabs tabs={tabs} active={tab} onSelect={(next) => navigate({ aba: next === "historico" ? null : next, msg: null, tipo: null, situacao: null, imagens: null })} pendingTab={null} onConfirmDiscard={() => undefined} onCancelDiscard={() => undefined} label="Seções do diário">
                        {tab === "historico" && <JournalHistory campaignId={summary.campaignId} color={color} myMemberId={summary.myMemberId} maddoxAvatarUrl={summary.maddoxAvatarUrl} highlightId={highlightId} />}
                        {tab === "imagens" && (
                            <div className="space-y-4">
                                <JournalImageFilter value={imageKind} onChange={(next) => navigate({ imagens: next === "todas" ? null : next })} />
                                <JournalImageGallery campaignId={summary.campaignId} color={color} kind={imageKind} />
                            </div>
                        )}
                        {tab === "npcs" && <JournalNpcList campaignId={summary.campaignId} color={color} />}
                        {tab === "locais" && <JournalMemoryList campaignId={summary.campaignId} color={color} kind="local" />}
                        {tab === "missoes" && (
                            <div className="space-y-4">
                                <QuestStatusFilter value={questFilter} onChange={(next) => navigate({ situacao: next === "todas" ? null : next })} />
                                <JournalMemoryList campaignId={summary.campaignId} color={color} kind="missao" status={questFilter === "todas" ? null : questFilter} />
                            </div>
                        )}
                        {tab === "anotacoes" && (
                            <div className="space-y-4">
                                <NoteKindFilter value={noteKind} counts={counts.memories} onChange={(kind) => navigate({ tipo: kind })} />
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
        </motion.div>
    )
}

function SettingCard({ summary, color }: { summary: MaddoxJournalSummaryDto; color: string }) {
    const [open, setOpen] = useState(false)
    if (!summary.setting.trim() && !summary.openingSituation.trim()) return null
    return (
        <Card className="h-fit" data-testid="journal-setting">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4" style={{ color }} aria-hidden /> Cenário
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className={cn("space-y-3 overflow-hidden", !open && "max-h-48 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]")}>
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
                <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
                    <ChevronDown className={cn("transition-transform", open && "rotate-180")} aria-hidden /> {open ? "Mostrar menos" : "Ver o cenário completo"}
                </Button>
            </CardContent>
        </Card>
    )
}
