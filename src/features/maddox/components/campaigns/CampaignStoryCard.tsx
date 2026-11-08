"use client"

import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, BookOpen, Hourglass, MessageCircle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import type { MaddoxCampaignDetailDto } from "../../campaign-types"
import { useMaddoxJournalSummary } from "../../hooks/useMaddoxJournal"
import { journalHref } from "../journal/journal-links"
import { JournalStateCard, hasJournalState } from "../journal/JournalStateCard"
import { InterviewChip, rigorColor } from "./campaign-visuals"
import { TableTutorialCard } from "./TableTutorialCard"

/**
 * Card da história no lobby (DND-37): entrevista de cenário (dono) ou espera (jogadores) enquanto o cenário não fica
 * pronto; depois, o tutorial da mesa até o Maddox registrar a situação atual, e então a mesma "Situação atual" do Diário.
 * O texto do cenário fica no Diário (link "Ver o cenário completo").
 */
export function CampaignStoryCard({ campaign }: { campaign: MaddoxCampaignDetailDto }) {
    const done = campaign.scenarioStatus === "done"
    if (!done) return <ScenarioInterviewCard campaign={campaign} />
    return <StoryCard campaign={campaign} />
}

function StoryCard({ campaign }: { campaign: MaddoxCampaignDetailDto }) {
    const reduceMotion = useReducedMotion()
    const summary = useMaddoxJournalSummary(campaign.id, true)
    const color = rigorColor(campaign.rigor)
    const footer = <ScenarioLink campaignId={campaign.id} />

    const view = summary.isLoading ? "loading" : summary.isError || !summary.data ? "error" : hasJournalState(summary.data.state) ? "state" : "tutorial"

    return (
        <motion.div layout={reduceMotion ? false : "size"} transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}>
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key={view}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                data-testid="campaign-story"
                data-view={view}
            >
                {view === "loading" && (
                    <div className="space-y-3 rounded-xl border border-white/10 p-5" aria-busy="true" aria-label="Carregando a situação da campanha" data-testid="campaign-story-loading">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                )}
                {view === "error" && (
                    <Card animate={false} data-testid="campaign-story-error">
                        <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm text-white/75">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400" aria-hidden />
                            <span className="flex-1">Não foi possível carregar a situação da campanha.</span>
                            <Button size="sm" variant="outline" onClick={() => void summary.refetch()}>
                                <RotateCcw aria-hidden /> Tentar de novo
                            </Button>
                        </CardContent>
                    </Card>
                )}
                {view === "state" && summary.data && <JournalStateCard summary={summary.data} color={color} collapsible footer={footer} />}
                {view === "tutorial" && <TableTutorialCard campaign={campaign} color={color} footer={footer} />}
            </motion.div>
        </AnimatePresence>
        </motion.div>
    )
}

function ScenarioLink({ campaignId }: { campaignId: string }) {
    return (
        <div className="border-t border-white/10 pt-3">
            <Link href={journalHref(campaignId)} className="inline-flex items-center gap-1.5 text-xs text-white/60 transition-colors hover:text-white" data-testid="campaign-scenario-link">
                <BookOpen className="h-3.5 w-3.5" aria-hidden /> Ver o cenário completo
            </Link>
        </div>
    )
}

/** Cenário ainda não concluído: chamada para a entrevista (dono) ou espera (jogadores). */
function ScenarioInterviewCard({ campaign }: { campaign: MaddoxCampaignDetailDto }) {
    const isOwner = campaign.myRole === "owner"
    const started = campaign.scenarioStatus !== "pending"
    return (
        <Card data-testid="campaign-scenario-interview">
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4 text-primary" aria-hidden /> Cenário
                    <InterviewChip status={campaign.scenarioStatus} />
                </CardTitle>
                <CardDescription>{isOwner ? "Converse com o Maddox para definir o universo, o tom e a situação inicial da história." : `Aguardando ${campaign.ownerName} definir o cenário com o Maddox.`}</CardDescription>
            </CardHeader>
            <CardContent>
                {isOwner ? (
                    <Button asChild>
                        <Link href={`/campanhas/${campaign.id}/entrevista/cenario`}>
                            <MessageCircle aria-hidden /> {started ? "Continuar entrevista de cenário" : "Começar entrevista de cenário"}
                        </Link>
                    </Button>
                ) : (
                    <p className="flex items-center gap-2 text-sm text-white/60">
                        <Hourglass className="h-4 w-4 text-primary" aria-hidden /> Você poderá fazer a entrevista do seu personagem assim que o cenário estiver pronto.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
