"use client"

import { useEffect } from "react"
import { MessageCircle } from "lucide-react"
import { useMaddoxJournalHistory } from "../../hooks/useMaddoxJournal"
import { GameMessageList } from "../game/GameMessageList"
import { JournalListState } from "./JournalLists"

/** Quantas páginas o histórico carrega sozinho atrás da mensagem aberta pela busca. */
export const MADDOX_JOURNAL_HISTORY_SEEK_PAGES = 10

/** Histórico da mesa em modo leitura (mesmos blocos da mesa, sem ações), com a mensagem da busca em destaque. */
export function JournalHistory({ campaignId, color, myMemberId, maddoxAvatarUrl, highlightId }: { campaignId: string; color: string; myMemberId: string; maddoxAvatarUrl: string | null; highlightId: string | null }) {
    const history = useMaddoxJournalHistory(campaignId)
    const pages = history.data?.pages ?? []
    const messages = [...pages].reverse().flatMap((page) => page.messages)
    const found = highlightId !== null && messages.some((message) => message.id === highlightId)
    const seeking = highlightId !== null && !found && Boolean(history.hasNextPage) && pages.length < MADDOX_JOURNAL_HISTORY_SEEK_PAGES
    const tooOld = highlightId !== null && !found && Boolean(history.hasNextPage) && pages.length >= MADDOX_JOURNAL_HISTORY_SEEK_PAGES

    const { isFetchingNextPage, fetchNextPage } = history
    useEffect(() => {
        if (seeking && !isFetchingNextPage) void fetchNextPage()
    }, [seeking, isFetchingNextPage, fetchNextPage, pages.length])

    if (history.isLoading || history.isError || messages.length === 0) {
        return (
            <JournalListState
                loading={history.isLoading}
                error={history.isError}
                empty={messages.length === 0}
                emptyText="Nada aconteceu na mesa ainda: a história aparece aqui quando a campanha começa."
                icon={MessageCircle}
                onRetry={() => void history.refetch()}
            />
        )
    }
    return (
        <div className="space-y-2">
            {tooOld && (
                <p className="text-xs text-amber-300" role="status" data-testid="journal-history-too-old">
                    Mensagem muito antiga: use “Carregar anteriores” para chegar até ela.
                </p>
            )}
            <section
                aria-label="Histórico da mesa"
                data-testid="journal-history"
                className="flex h-[70dvh] min-h-[420px] flex-col overflow-hidden rounded-xl border bg-card/40 backdrop-blur"
                style={{ borderColor: `${color}40` }}
            >
                <GameMessageList
                    messages={messages}
                    myMemberId={myMemberId}
                    maddoxAvatarUrl={maddoxAvatarUrl}
                    color={color}
                    narrating={false}
                    hasMore={Boolean(history.hasNextPage)}
                    loadingMore={history.isFetchingNextPage}
                    onLoadMore={() => void history.fetchNextPage()}
                    readOnly
                    highlightId={found ? highlightId : null}
                />
            </section>
        </div>
    )
}
