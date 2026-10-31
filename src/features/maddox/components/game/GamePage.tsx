"use client"

import { useMemo, useState } from "react"
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
import {
    fetchOlderGameMessages,
    useMaddoxGame,
    useMaddoxGamePresence,
    useMaddoxGameRealtime,
    useRollMaddoxCheck,
    useSendMaddoxGameAction,
    useSkipMaddoxPlayer,
    type MaddoxGamePresence,
} from "../../hooks/useMaddoxGame"
import { RarityChip, RigorChip, rigorColor } from "../campaigns/campaign-visuals"
import { useMaddoxGameStream, type MaddoxGameStreamState } from "../../hooks/useMaddoxGameStream"
import { GameComposer } from "./GameComposer"
import { GameMessageList } from "./GameMessageList"
import { MySheetButton } from "./MySheetButton"
import { NpcPanel } from "./NpcPanel"
import { TurnPanel } from "./TurnPanel"
import { CampaignChatHeader } from "../CampaignChatHeader"

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
    const rollCheck = useRollMaddoxCheck(state.campaignId)
    const replays = useMemo(() => new Map(stream.rolled.map((item) => [item.messageId, item.roll])), [stream.rolled])
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
    const lastMaddoxId = [...state.messages].reverse().find((message) => message.kind === "narration" || message.kind === "answer" || message.kind === "check")?.id ?? ""
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
        // Tela inteira: cabeçalho compacto e fixo; a grade (chat + ferramentas) ocupa o resto da área útil no desktop
        // (7rem = header do app 4rem + padding do `<main>` 1,5rem × 2). No celular a coluna lateral vem abaixo do chat.
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3 lg:h-[calc(100dvh-7rem)] lg:min-h-[640px]" data-testid="game-page" data-layout="fill">
            <CampaignChatHeader
                campaignId={state.campaignId}
                color={color}
                icon={Swords}
                title={state.name}
                chips={
                    <>
                        <RigorChip rigor={state.rigor} />
                        <RarityChip color={color}>Turno {state.turn.number}</RarityChip>
                    </>
                }
                actions={<MySheetButton sheet={state.me.sheet} />}
                banner={
                    <p className="flex items-center gap-2 text-xs text-white/80" role="status" data-testid="turn-banner">
                        {masterTurn ? <Dices className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden /> : <MessageCircle className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden />}
                        {masterTurn
                            ? masterBannerText(state)
                            : `${MADDOX_TURN_PHASE_LABELS.players} — ${progress.declared} de ${progress.total} ${presence.available ? "jogador(es) online" : "jogador(es)"} já declararam`}
                    </p>
                }
            />

            <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]" data-testid="game-grid">
                <section
                    aria-label="Mesa"
                    data-testid="game-panel"
                    className="flex h-[80dvh] min-h-[480px] flex-col overflow-hidden rounded-xl border bg-card/40 backdrop-blur lg:h-full lg:min-h-0"
                    style={{ borderColor: `${color}40` }}
                >
                    <GameMessageList
                        messages={messages}
                        myMemberId={state.me.memberId}
                        maddoxAvatarUrl={state.maddoxAvatarUrl}
                        color={color}
                        narrating={masterTurn && !state.turn.failed && !state.turn.awaitingChecks}
                        live={live}
                        hasMore={hasMore}
                        loadingMore={loadingMore}
                        onLoadMore={() => void loadMore()}
                        replays={replays}
                        onRollCheck={async (checkId) => (await rollCheck.mutateAsync(checkId)).roll}
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
                <div className="space-y-6 lg:min-h-0 lg:overflow-y-auto" data-testid="game-tools">
                    <TurnPanel
                        state={state}
                        presence={presence}
                        color={color}
                        skipping={skip.isPending}
                        onSkip={(memberId) => skip.mutate(memberId)}
                        rollingFor={rollCheck.isPending}
                        onRollFor={(checkId, characterName) => rollCheck.mutate(checkId, { onSuccess: () => toast.success(`Teste rolado no lugar de ${characterName}`) })}
                    />
                    <NpcPanel npcs={state.npcs} color={color} />
                </div>
            </div>
        </motion.div>
    )
}
