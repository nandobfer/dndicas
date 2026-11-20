"use client"

import { useState } from "react"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalTitle } from "@/components/ui/glass-modal"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useMaddoxJournalSummary } from "../../hooks/useMaddoxJournal"
import { RarityChip, RigorChip, rigorColor } from "../campaigns/campaign-visuals"
import { JournalNavigationProvider, useLocalJournalNavigation } from "./journal-navigation"
import { journalErrorStatus, JournalView } from "./JournalView"

/**
 * Botão "Diário" da mesa (DND-77): abre o diário numa janela de vidro sobre a mesa, sem sair do jogo. A página
 * `/campanhas/[id]/diario` continua existindo (menu, links de fora da mesa).
 */
export function JournalWindowButton({ campaignId, "data-testid": testId = "journal-link" }: { campaignId: string; "data-testid"?: string }) {
    const [open, setOpen] = useState(false)
    return (
        <>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog" data-testid={testId}>
                <BookOpen aria-hidden /> Diário
            </Button>
            <JournalWindow campaignId={campaignId} open={open} onOpenChange={setOpen} />
        </>
    )
}

/** Janela do diário: tela cheia no celular, centralizada no desktop, com rolagem própria (a mesa por trás não se move). */
export function JournalWindow({ campaignId, open, onOpenChange }: { campaignId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
    return (
        <GlassModal open={open} onOpenChange={onOpenChange}>
                <GlassModalContent
                    size="full"
                    className="flex h-[100dvh] max-h-[100dvh] max-w-none flex-col overflow-hidden rounded-none sm:h-[85vh] sm:max-h-[85vh] sm:max-w-6xl sm:rounded-xl"
                    bodyClassName="flex min-h-0 flex-1 flex-col p-0"
                    data-testid="journal-window"
                >
                    <JournalWindowBody campaignId={campaignId} />
                </GlassModalContent>
        </GlassModal>
    )
}

function JournalWindowBody({ campaignId }: { campaignId: string }) {
    const summary = useMaddoxJournalSummary(campaignId)
    const navigation = useLocalJournalNavigation()
    const data = summary.data
    const color = data ? rigorColor(data.rigor) : undefined

    return (
        <>
            <div className="relative flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-4 pr-12 sm:px-6">
                <GlassModalTitle className="flex min-w-0 items-center gap-2">
                    <BookOpen className="h-5 w-5 shrink-0" style={{ color }} aria-hidden />
                    <span className="truncate">{data ? `Diário — ${data.name}` : "Diário da campanha"}</span>
                </GlassModalTitle>
                {data && (
                    <span className="flex items-center gap-2">
                        <RigorChip rigor={data.rigor} />
                        {data.turnNumber > 0 && <RarityChip color={rigorColor(data.rigor)}>Turno {data.turnNumber}</RarityChip>}
                    </span>
                )}
                <GlassModalDescription className="sr-only">Capítulos, imagens, NPCs, locais, missões, anotações e o grupo — só o que os jogadores já sabem.</GlassModalDescription>
            </div>
            <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 custom-scrollbar sm:px-6" data-testid="journal-window-scroll">
                {summary.isLoading ? (
                    <div className="space-y-6" aria-busy="true" aria-label="Carregando diário">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-96 w-full rounded-xl" />
                    </div>
                ) : summary.isError || !data ? (
                    journalErrorStatus(summary.error) === 404 ? (
                        <EmptyState icon={BookOpen} title="Campanha não encontrada" description="Ela não existe ou você não participa dela." />
                    ) : (
                        <ErrorState title="Não foi possível carregar o diário" onRetry={() => void summary.refetch()} />
                    )
                ) : (
                    <JournalNavigationProvider value={navigation}>
                        <JournalView summary={data} />
                    </JournalNavigationProvider>
                )}
            </div>
        </>
    )
}
