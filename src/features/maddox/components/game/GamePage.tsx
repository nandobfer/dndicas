"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowLeft, Dices, Hourglass, MessageCircle, Swords } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/opex/button"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useAuth } from "@/core/hooks/useAuth"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { MADDOX_TURN_PHASE_LABELS } from "../../constants"
import type { MaddoxGameMessageDto, MaddoxGameStateDto } from "../../game-types"
import type { MaddoxGameActionInput } from "../../game-schemas"
import { composerBlockReason, masterBannerText, turnProgress, visibleLiveGenerations } from "../../game-view"
import { fetchOlderGameMessages, useMaddoxGame, useMaddoxGamePresence, useMaddoxGameRealtime, useSendMaddoxGameAction, useSkipMaddoxPlayer, type MaddoxGamePresence } from "../../hooks/useMaddoxGame"
import { RarityChip, RigorChip, rigorColor } from "../campaigns/campaign-visuals"
import { useMaddoxGameStream, type MaddoxGameStreamState } from "../../hooks/useMaddoxGameStream"
import { GameComposer } from "./GameComposer"
import { GameMessageList } from "./GameMessageList"
import { TurnPanel } from "./TurnPanel"

const errorStatus = (error: unknown) => (error as { response?: { status?: number } } | null)?.response?.status

/** `/campanhas/[id]/mesa`: o jogo por turnos (turno do mestre e turno dos jogadores), em tempo real. */
export function GamePage({ campaignId }: { campaignId: string }) {
    const { userId } = useAuth()
    const game = useMaddoxGame(campaignId)
    useMaddoxGameRealtime(userId)
    const presence = useMaddoxGamePresence(campaignId, game.data?.status === "active")
    const stream = useMaddoxGameStream(campaignId, game.data?.status === "active")

    if (game.isLoading) {
        return (
            <div className="space-y-6" aria-busy="true" aria-label="Carregando mesa">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-96 w-full rounded-xl" />
            </div>
        )
    }
    if (game.isError || !game.data) {
        return (
            <div className="space-y-6">
                <BackLink campaignId={campaignId} />
                {errorStatus(game.error) === 404 ? (
                    <EmptyState icon={Swords} title="Campanha não encontrada" description="Ela não existe ou você não participa dela." />
                ) : (
                    <ErrorState title="Não foi possível carregar a mesa" onRetry={() => void game.refetch()} />
                )}
            </div>
        )
    }
    const state = game.data
    if (state.status !== "active") {
        return (
            <div className="space-y-6">
                <BackLink campaignId={campaignId} />
                <EmptyState icon={Hourglass} title="A campanha ainda não começou" description="O dono inicia a campanha no lobby depois que o cenário e os personagens estiverem prontos." />
            </div>
        )
    }
    return <GameTable state={state} presence={presence} stream={stream} />
}

function BackLink({ campaignId }: { campaignId: string }) {
    return (
        <Link href={`/campanhas/${campaignId}`} className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar à campanha
        </Link>
    )
}

function GameTable({ state, presence, stream }: { state: MaddoxGameStateDto; presence: MaddoxGamePresence; stream: MaddoxGameStreamState }) {
    const color = rigorColor(state.rigor)
    const send = useSendMaddoxGameAction(state.campaignId)
    const skip = useSkipMaddoxPlayer(state.campaignId)
    const [older, setOlder] = useState<MaddoxGameMessageDto[]>([])
    const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null)
    const [loadingMore, setLoadingMore] = useState(false)
    const [invalidReason, setInvalidReason] = useState<string | null>(null)

    // Mensagens novas chegam pelo estado; as anteriores carregadas ficam guardadas (sem duplicar).
    const recentIds = new Set(state.messages.map((message) => message.id))
    const messages = [...older.filter((message) => !recentIds.has(message.id)), ...state.messages]
    const hasMore = olderHasMore ?? state.hasMore
    const live = visibleLiveGenerations(stream, messages)
    // Cada fala do Maddox que termina (ao vivo ou gravada) devolve o foco ao campo de texto.
    const lastMaddoxId = [...state.messages].reverse().find((message) => message.kind === "narration" || message.kind === "answer")?.id ?? ""
    const focusKey = `${stream.finished}:${lastMaddoxId}`

    const loadMore = async () => {
        const first = messages[0]
        if (!first) return
        setLoadingMore(true)
        try {
            const page = await fetchOlderGameMessages(state.campaignId, first.id)
            setOlder((current) => [...page.messages, ...current])
            setOlderHasMore(page.hasMore)
        } catch (error) {
            toast.error(apiErrorMessage(error, "Não foi possível carregar as mensagens anteriores"))
        } finally {
            setLoadingMore(false)
        }
    }

    const onSend = async (input: MaddoxGameActionInput) => {
        setInvalidReason(null)
        try {
            await send.mutateAsync(input)
            return true
        } catch (error) {
            if (apiErrorCode(error) === "ACTION_INVALID") setInvalidReason(apiErrorMessage(error, "Essa ação não é possível para o seu personagem."))
            return false
        }
    }

    const progress = turnProgress(state, presence)
    const masterTurn = state.turn.phase === "master"

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" data-testid="game-page">
            <BackLink campaignId={state.campaignId} />
            <header className="relative overflow-hidden rounded-xl border border-white/10 p-5" style={{ background: `radial-gradient(circle at 10% 0%, ${color}40, transparent 60%)`, boxShadow: `inset 3px 0 0 ${color}` }}>
                <h1 className="flex items-center gap-2 text-xl font-bold text-white">
                    <Swords className="h-5 w-5 shrink-0" style={{ color }} aria-hidden />
                    <span className="truncate">{state.name}</span>
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <RigorChip rigor={state.rigor} />
                    <RarityChip color={color}>Turno {state.turn.number}</RarityChip>
                </div>
                <p className="mt-3 flex items-center gap-2 text-sm text-white/80" role="status" data-testid="turn-banner">
                    {masterTurn ? <Dices className="h-4 w-4 shrink-0" style={{ color }} aria-hidden /> : <MessageCircle className="h-4 w-4 shrink-0" style={{ color }} aria-hidden />}
                    {masterTurn
                        ? masterBannerText(state)
                        : `${MADDOX_TURN_PHASE_LABELS.players} — ${progress.declared} de ${progress.total} ${presence.available ? "jogador(es) online" : "jogador(es)"} já declararam`}
                </p>
            </header>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
                <section
                    aria-label="Mesa"
                    data-testid="game-panel"
                    className="flex h-[calc(100dvh-18rem)] min-h-[460px] flex-col overflow-hidden rounded-xl border bg-card/40 backdrop-blur"
                    style={{ borderColor: `${color}40` }}
                >
                    <GameMessageList
                        messages={messages}
                        myMemberId={state.me.memberId}
                        maddoxAvatarUrl={state.maddoxAvatarUrl}
                        color={color}
                        narrating={masterTurn && !state.turn.failed}
                        live={live}
                        hasMore={hasMore}
                        loadingMore={loadingMore}
                        onLoadMore={() => void loadMore()}
                    />
                    <GameComposer blockedReason={composerBlockReason(state)} declared={state.me.declared} busy={send.isPending} onSend={onSend} invalidReason={invalidReason} focusKey={focusKey} />
                    {!state.me.ready && (
                        <div className="border-t px-4 py-2.5">
                            <Button size="sm" asChild>
                                <Link href={`/campanhas/${state.campaignId}/entrevista/personagem`}>
                                    <MessageCircle aria-hidden /> Entrevista do personagem
                                </Link>
                            </Button>
                        </div>
                    )}
                </section>
                <TurnPanel state={state} presence={presence} color={color} skipping={skip.isPending} onSkip={(memberId) => skip.mutate(memberId)} />
            </div>
        </motion.div>
    )
}
