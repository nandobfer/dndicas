"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, BookOpen, Dices } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useAuth } from "@/core/hooks/useAuth"
import { MADDOX_QUEST_STATUSES } from "../../constants"
import { MADDOX_JOURNAL_IMAGE_KINDS, type MaddoxJournalImageKind } from "../../journal-schemas"
import type { MaddoxJournalSummaryDto } from "../../journal-types"
import { useMaddoxJournalSummary } from "../../hooks/useMaddoxJournal"
import { useMaddoxGameRealtime } from "../../hooks/useMaddoxGame"
import { RarityChip, RigorChip, rigorColor } from "../campaigns/campaign-visuals"
import { CampaignChatHeader } from "../CampaignChatHeader"
import { journalHref, MADDOX_JOURNAL_DEFAULT_TAB, MADDOX_JOURNAL_NOTE_KINDS, parseJournalTab, type MaddoxJournalNoteKind } from "./journal-links"
import { JournalNavigationProvider, type JournalNavigation, type JournalQuestFilter } from "./journal-navigation"
import { journalErrorStatus, JournalView } from "./JournalView"

/** `/campanhas/[id]/diario`: capítulos, imagens, NPCs, locais, missões, anotações, o grupo e a busca — só o que os jogadores sabem. */
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
                {journalErrorStatus(summary.error) === 404 ? (
                    <EmptyState icon={BookOpen} title="Campanha não encontrada" description="Ela não existe ou você não participa dela." />
                ) : (
                    <ErrorState title="Não foi possível carregar o diário" onRetry={() => void summary.refetch()} />
                )}
            </div>
        )
    }
    return <Journal summary={summary.data} />
}

/** Navegação da página: aba e filtros na URL (`?aba=`, `?tipo=`, `?situacao=`, `?imagens=`), âncora no `#`. */
function useUrlJournalNavigation(campaignId: string): JournalNavigation {
    const router = useRouter()
    const pathname = usePathname()
    const params = useSearchParams()
    return useMemo(() => {
        const tab = parseJournalTab(params.get("aba"))
        const noteParam = params.get("tipo")
        const noteKind: MaddoxJournalNoteKind = (MADDOX_JOURNAL_NOTE_KINDS as readonly string[]).includes(noteParam ?? "") ? (noteParam as MaddoxJournalNoteKind) : "evento"
        // Filtro das missões na URL (`?situacao=`): o link de um resultado da busca (`?aba=missoes#…`) o zera.
        const questParam = params.get("situacao")
        const questFilter: JournalQuestFilter = (MADDOX_QUEST_STATUSES as readonly string[]).includes(questParam ?? "") ? (questParam as JournalQuestFilter) : "todas"
        // Filtro das imagens na URL (`?imagens=`), como o das missões.
        const imageParam = params.get("imagens")
        const imageKind: MaddoxJournalImageKind = (MADDOX_JOURNAL_IMAGE_KINDS as readonly string[]).includes(imageParam ?? "") ? (imageParam as MaddoxJournalImageKind) : "todas"
        const navigate = (next: Record<string, string | null>) => {
            const query = new URLSearchParams(params.toString())
            for (const [key, value] of Object.entries(next)) {
                if (value === null) query.delete(key)
                else query.set(key, value)
            }
            const text = query.toString()
            router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false })
        }
        return {
            local: false,
            anchor: "",
            tab,
            noteKind,
            questFilter,
            imageKind,
            selectTab: (next) => navigate({ aba: next === MADDOX_JOURNAL_DEFAULT_TAB ? null : next, msg: null, tipo: null, situacao: null, imagens: null }),
            selectNoteKind: (kind) => navigate({ tipo: kind }),
            selectQuestFilter: (next) => navigate({ situacao: next === "todas" ? null : next }),
            selectImageKind: (next) => navigate({ imagens: next === "todas" ? null : next }),
            go: (target) => router.push(journalHref(campaignId, target), { scroll: false }),
        }
    }, [campaignId, params, pathname, router])
}

function Journal({ summary }: { summary: MaddoxJournalSummaryDto }) {
    const color = rigorColor(summary.rigor)
    const navigation = useUrlJournalNavigation(summary.campaignId)

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
            <JournalNavigationProvider value={navigation}>
                <JournalView summary={summary} />
            </JournalNavigationProvider>
        </motion.div>
    )
}
