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
import { combatBannerText, composerBlockReason, masterBannerText, reminderBlockReason, turnProgress, visibleLiveGenerations } from "../../game-view"
import type { MaddoxCombatActionInput } from "../../combat-schemas"
import { useCancelCombatAction, useDecideReaction, useEndCombatTurn, useRollCombatStep, useSubmitCombatAction } from "../../hooks/useMaddoxCombat"
import { CombatActionBar, CombatWaitBar } from "./combat/CombatActionBar"
import { InitiativeTracker } from "./combat/InitiativeTracker"
import {
    fetchOlderGameMessages,
    useMaddoxGame,
    useInjectMaddoxReminder,
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
import { COMBAT_COLOR } from "./GameCombatCard"
import { GameMessageList } from "./GameMessageList"
import { MySheetButton } from "./MySheetButton"
import { NpcPanel } from "./NpcPanel"
import { InjectReminderButton } from "./InjectReminderButton"
import { SceneImageButton } from "./SceneImageButton"
import { useRequestMaddoxNpcPortrait, useRequestMaddoxSceneImage } from "../../hooks/useMaddoxSceneImages"
import { TurnPanel } from "./TurnPanel"
import { CampaignChatHeader } from "../CampaignChatHeader"
import { JournalSearchDialog } from "../journal/JournalSearchDialog"
import { JournalLinkButton } from "../journal/JournalLinkButton"

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
    const combatAct = useSubmitCombatAction(state.campaignId)
    const combatCancel = useCancelCombatAction(state.campaignId)
    const combatEnd = useEndCombatTurn(state.campaignId)
    const combatRoll = useRollCombatStep(state.campaignId)
    const combatReact = useDecideReaction(state.campaignId)
    const [asking, setAsking] = useState(false)
    const [combatInvalid, setCombatInvalid] = useState<string | null>(null)
    const tactical = state.combat?.tactical ?? null
    const skip = useSkipMaddoxPlayer(state.campaignId)
    const rollCheck = useRollMaddoxCheck(state.campaignId)
    const sceneImage = useRequestMaddoxSceneImage(state.campaignId)
    const reminder = useInjectMaddoxReminder(state.campaignId)
    const portrait = useRequestMaddoxNpcPortrait(state.campaignId)
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

    const onCombatAct = async (input: MaddoxCombatActionInput) => {
        setCombatInvalid(null)
        try {
            await combatAct.mutateAsync(input)
            return true
        } catch (error) {
            if (apiErrorCode(error) === "ACTION_INVALID") setCombatInvalid(apiErrorMessage(error, "Essa ação não é possível para o seu personagem."))
            else toast.error(apiErrorMessage(error, "Não foi possível agir"))
            return false
        }
    }
    const myCombatTurn = Boolean(tactical && state.me.combat?.myTurn && state.turn.phase === "players")
    const combatBusy = combatAct.isPending || combatEnd.isPending || combatCancel.isPending
    // Em combate tático o campo de texto só pergunta ao mestre (a vez é pelos botões).
    const questionBlock = state.status !== "active" ? "A campanha não está em andamento." : !state.me.ready ? "Conclua a entrevista de personagem com o Maddox para entrar no jogo." : state.turn.phase !== "players" ? "Perguntas ao mestre ficam para a vez de um personagem." : null

    const progress = turnProgress(state, presence)
    const masterTurn = state.turn.phase === "master"

    return (
        // Tela inteira: cabeçalho compacto e fixo; a grade (chat + ferramentas) ocupa o resto da área útil no desktop
        // (7rem = header do app 4rem + padding do `<main>` 1,5rem × 2, menos a faixa "Visualizar como" quando aparece). No celular a coluna lateral vem abaixo do chat.
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-3 lg:h-[calc(100dvh_-_7rem_-_var(--view-as-banner-height,0px))] lg:min-h-[640px]" data-testid="game-page" data-layout="fill">
            <CampaignChatHeader
                campaignId={state.campaignId}
                color={color}
                icon={Swords}
                title={state.name}
                chips={
                    <>
                        <RigorChip rigor={state.rigor} />
                        <RarityChip color={color}>Turno {state.turn.number}</RarityChip>
                        {state.combat && (
                            <RarityChip color={COMBAT_COLOR}>
                                <Swords className="h-3 w-3" aria-hidden />
                                <span data-testid="combat-chip">Em combate · {state.combat.title}</span>
                            </RarityChip>
                        )}
                    </>
                }
                actions={
                    <>
                        <SceneImageButton control={state.sceneImages} busy={sceneImage.isPending} onRequest={() => sceneImage.mutate()} />
                        <InjectReminderButton blockReason={reminderBlockReason(state)} sending={reminder.isPending} onSend={(text) => reminder.mutateAsync(text)} />
                        <JournalSearchDialog campaignId={state.campaignId} color={color} />
                        <JournalLinkButton campaignId={state.campaignId} />
                        <MySheetButton sheet={state.me.sheet} />
                    </>
                }
                banner={
                    <>
                    <p className="flex items-center gap-2 text-xs text-white/80" role="status" data-testid="turn-banner">
                        {masterTurn ? <Dices className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden /> : <MessageCircle className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden />}
                        {masterTurn
                            ? masterBannerText(state)
                            : state.turn.combatActor
                              ? combatBannerText(state)
                              : `${MADDOX_TURN_PHASE_LABELS.players} — ${progress.declared} de ${progress.total} ${presence.available ? "jogador(es) online" : "jogador(es)"} já declararam`}
                    </p>
                    {tactical && state.combat && <InitiativeTracker combat={tactical} title={state.combat.title} color={color} compact />}
                    </>
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
                        combat={{
                            isOwner: state.me.isOwner,
                            reacting: combatReact.isPending,
                            onRollAction: async (actionId) => (await combatRoll.mutateAsync({ kind: "action", id: actionId })).roll,
                            onRollCombat: async (rollId) => (await combatRoll.mutateAsync({ kind: "roll", id: rollId })).roll,
                            onCancelAction: (actionId) => combatCancel.mutate(actionId),
                            onDecideReaction: (reactionId, escolha) => combatReact.mutate({ id: reactionId, escolha }),
                        }}
                    />
                    {tactical && state.me.combat ? (
                        <>
                            {myCombatTurn ? (
                                <CombatActionBar
                                    me={state.me.combat}
                                    combat={tactical}
                                    color={color}
                                    busy={combatBusy}
                                    invalidReason={combatInvalid}
                                    onAct={onCombatAct}
                                    onEndTurn={(movimento) => combatEnd.mutate(movimento.trim() ? { movimento: movimento.trim() } : {})}
                                    onAsk={() => setAsking((value) => !value)}
                                />
                            ) : (
                                <CombatWaitBar combat={tactical} canAsk={questionBlock === null} onAsk={() => setAsking((value) => !value)} />
                            )}
                            {asking && <GameComposer blockedReason={questionBlock} declared busy={send.isPending} onSend={onSend} invalidReason={null} focusKey={focusKey} />}
                        </>
                    ) : (
                        <GameComposer blockedReason={composerBlockReason(state)} declared={state.me.declared} busy={send.isPending} onSend={onSend} invalidReason={invalidReason} focusKey={focusKey} />
                    )}
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
                    {tactical && state.combat && <InitiativeTracker combat={tactical} title={state.combat.title} color={color} />}
                    <TurnPanel
                        state={state}
                        presence={presence}
                        color={color}
                        skipping={skip.isPending}
                        onSkip={(memberId) => skip.mutate(memberId)}
                        rollingFor={rollCheck.isPending}
                        onRollFor={(checkId, characterName) => rollCheck.mutate(checkId, { onSuccess: () => toast.success(`Teste rolado no lugar de ${characterName}`) })}
                    />
                    <NpcPanel
                        npcs={state.npcs}
                        color={color}
                        campaignId={state.campaignId}
                        portraits={state.sceneImages?.owner ? { canRequest: state.sceneImages.canRequestPortrait, requesting: portrait.isPending ? (portrait.variables ?? null) : null, onRequest: (npcId) => portrait.mutate(npcId) } : null}
                    />
                </div>
            </div>
        </motion.div>
    )
}
