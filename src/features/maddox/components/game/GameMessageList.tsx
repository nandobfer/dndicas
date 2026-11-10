"use client"

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertCircle, ArrowDown, BookOpen, EyeOff, HelpCircle, Loader2, MinusCircle } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Markdown } from "@/components/ui/opex/markdown"
import type { MaddoxGameMessageDto, MaddoxLiveGenerationDto } from "../../game-types"
import type { MaddoxActionOptionsView } from "../../game-view"
import { GameActionOptions } from "./GameActionOptions"
import { OpexNpcFailureLine } from "./OpexNpcFailureLine"
import { liveMarkupToBold } from "../../catalog-markup"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import { MemberAvatar, OpexChip } from "../campaigns/campaign-visuals"
import { GameCheckCard } from "./GameCheckCard"
import { GameSceneImage } from "./GameSceneImage"
import { GameCombatCard } from "./GameCombatCard"
import { CombatActionCard, CombatOrderCard, CombatPrepCard, CombatReactionCard, CombatRollCard } from "./combat/CombatCards"
import { LiveNpcRolls } from "./combat/LiveNpcRolls"
import { ReminderLine } from "./ReminderLine"
import { RewindNoticeLine } from "./RewindNoticeLine"

const NEAR_BOTTOM_PX = 80
const bubble = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: "easeOut" as const } }

interface Props {
    messages: MaddoxGameMessageDto[]
    myMemberId: string | null
    maddoxAvatarUrl: string | null
    color: string
    /** O Maddox está narrando agora (turno do mestre). */
    narrating: boolean
    /** Gerações do Maddox ao vivo (e as que acabaram, até a mensagem gravada chegar). */
    live?: MaddoxLiveGenerationDto[]
    hasMore: boolean
    loadingMore: boolean
    onLoadMore: () => void
    /** Rolagens recentes de testes (stream da mesa), por mensagem: a animação é repetida para todos. */
    replays?: ReadonlyMap<string, DiceRollResponse>
    /** Rola um teste pedido pelo Maddox (Maddox 5). */
    onRollCheck?: (checkId: string) => Promise<DiceRollResponse>
    /** Combate tático (Maddox 7): rolar passos e rolagens, cancelar a ação e escolher a reação. */
    combat?: CombatHandlers
    /** Diário da campanha (Maddox 9): só leitura, sem rolar testes, agir no combate nem reagir. */
    readOnly?: boolean
    /** Mensagem aberta pela busca do diário: recebe destaque e a rolagem vai até ela. */
    highlightId?: string | null
    /** Sugestões de ação do Maddox (DND-30), abaixo da narração indicada; nunca no diário (só leitura). */
    actionOptions?: ActionOptionsHandlers | null
}

export interface ActionOptionsHandlers {
    view: MaddoxActionOptionsView
    busy: boolean
    onPick: (option: string) => Promise<boolean> | void
}

export interface CombatHandlers {
    isOwner: boolean
    reacting: boolean
    onRollAction: (actionId: string) => Promise<DiceRollResponse>
    onRollCombat: (rollId: string) => Promise<DiceRollResponse>
    onCancelAction: (actionId: string) => void
    onDecideReaction: (reactionId: string, choice: string) => void
}

/**
 * Conversa da mesa no padrão do chat do Opex (rolagem própria, "Ir para o fim"): narrações e respostas do Maddox
 * à esquerda com o avatar dele; declarações e perguntas com o retrato do personagem (as minhas à direita);
 * "não fez nada" como linha discreta; divisor a cada turno.
 */
const NO_REPLAYS: ReadonlyMap<string, DiceRollResponse> = new Map()
const noRoll = async (): Promise<DiceRollResponse> => {
    throw new Error("Rolagem indisponível")
}

/** Dados do servidor num card de ação (`{messageId}:{passo}` no mapa de rolagens do stream, DND-25). */
function stepReplaysOf(replays: ReadonlyMap<string, DiceRollResponse>, messageId: string, steps: number): ReadonlyMap<number, DiceRollResponse> | undefined {
    let found: Map<number, DiceRollResponse> | undefined
    for (let index = 0; index < steps; index += 1) {
        const roll = replays.get(`${messageId}:${index}`)
        if (roll) (found ??= new Map()).set(index, roll)
    }
    return found
}

const NO_COMBAT: CombatHandlers = { isOwner: false, reacting: false, onRollAction: noRoll, onRollCombat: noRoll, onCancelAction: () => undefined, onDecideReaction: () => undefined }

export function GameMessageList({ messages, myMemberId, maddoxAvatarUrl, color, narrating, live = [], hasMore, loadingMore, onLoadMore, replays = NO_REPLAYS, onRollCheck = noRoll, combat: handlers = NO_COMBAT, readOnly = false, highlightId = null, actionOptions: optionsInput = null }: Props) {
    const combat = readOnly ? NO_COMBAT : handlers
    const actionOptions = readOnly ? null : optionsInput
    // Só leitura: nenhum card é "meu", então nenhum mostra botão de rolar, cancelar ou reagir.
    const actsAs = (message: MaddoxGameMessageDto) => !readOnly && message.memberId !== null && message.memberId === myMemberId
    const scrollRef = useRef<HTMLDivElement>(null)
    const stickRef = useRef(true)
    const [showJump, setShowJump] = useState(false)
    const byId = new Map(messages.map((message) => [message.id, message]))

    const scrollToEnd = useCallback((behavior: ScrollBehavior = "auto") => {
        const element = scrollRef.current
        element?.scrollTo?.({ top: element.scrollHeight, behavior })
    }, [])

    const onScroll = () => {
        const element = scrollRef.current
        if (!element) return
        const near = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX
        stickRef.current = near
        setShowJump(!near)
    }

    const liveNarration = live.some((item) => item.kind === "narration")
    const lastTurn = messages.at(-1)?.turnNumber ?? null
    const signature = `${messages.length}:${messages.at(-1)?.id ?? ""}:${narrating ? 1 : 0}:${actionOptions ? actionOptions.view.messageId : ""}:${live.map((item) => `${item.liveId}:${item.text.length}:${item.tool ? 1 : 0}`).join(",")}`
    const highlightLoaded = highlightId !== null && byId.has(highlightId)
    useLayoutEffect(() => {
        if (stickRef.current && !highlightId) scrollToEnd()
    }, [signature, scrollToEnd, highlightId])
    useEffect(() => {
        if (!highlightId) scrollToEnd()
    }, [scrollToEnd, highlightId])
    useEffect(() => {
        if (!highlightLoaded) return
        stickRef.current = false
        scrollRef.current?.querySelector(`[data-message-id="${highlightId}"]`)?.scrollIntoView?.({ block: "center" })
    }, [highlightId, highlightLoaded])

    return (
        <div className="relative min-h-0 flex-1">
            <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 pb-2 pt-4" role="log" aria-live={readOnly ? "off" : "polite"} aria-label={readOnly ? "Histórico da campanha" : "Mesa da campanha"}>
                {hasMore && (
                    <div className="flex justify-center pb-3">
                        <Button type="button" size="sm" variant="ghost" onClick={onLoadMore} disabled={loadingMore}>
                            {loadingMore && <Loader2 className="animate-spin" aria-hidden />} Carregar anteriores
                        </Button>
                    </div>
                )}
                {messages.map((message, index) => {
                    const previous = messages[index - 1]
                    // O card de início do combate vem antes da narração do turno: o divisor sai antes dele.
                    const divider = (message.kind === "narration" || message.kind === "combat") && (!previous || previous.turnNumber !== message.turnNumber)
                    const highlighted = message.id === highlightId
                    return (
                        <Fragment key={message.id}>
                            {divider && <TurnDivider number={message.turnNumber} color={color} />}
                            <div
                                data-message-id={message.id}
                                data-highlighted={highlighted ? "true" : undefined}
                                className={highlighted ? "-mx-2 rounded-xl px-2 pt-2 ring-2 ring-primary/70" : undefined}
                            >
                                {message.kind === "combat" ? (
                                    message.combat ? (
                                        message.combat.event === "order" ? (
                                            <CombatOrderCard combat={message.combat} />
                                        ) : (
                                            <>
                                                <GameCombatCard combat={message.combat} />
                                                {message.sceneImages?.length ? (
                                                    <div className="pb-4">
                                                        {message.sceneImages.map((image) => (
                                                            <GameSceneImage key={image.id} image={image} color={color} />
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </>
                                        )
                                    ) : null
                                ) : message.kind === "combat-action" && message.combatAction ? (
                                    <CombatActionCard message={message} mine={actsAs(message)} replay={replays.get(message.id) ?? null} stepReplays={stepReplaysOf(replays, message.id, message.combatAction.steps.length)} onRoll={combat.onRollAction} onCancel={combat.onCancelAction} />
                                ) : message.kind === "combat-roll" && message.combatRoll ? (
                                    <CombatRollCard message={message} mine={actsAs(message)} replay={replays.get(message.id) ?? null} onRoll={combat.onRollCombat} />
                                ) : message.kind === "combat-reaction" && message.combatReaction ? (
                                    <CombatReactionCard message={message} mine={actsAs(message)} isOwner={combat.isOwner} busy={combat.reacting} onDecide={combat.onDecideReaction} />
                                ) : message.kind === "combat-prep" && message.combatPrep ? (
                                    <CombatPrepCard message={message} />
                                ) : message.kind === "reminder" ? (
                                    <ReminderLine message={message} color={color} />
                                ) : message.kind === "rewind" ? (
                                    <RewindNoticeLine message={message} color={color} />
                                ) : message.kind === "check" && message.check ? (
                                    <GameCheckCard message={message} mine={actsAs(message)} color={color} replay={replays.get(message.id) ?? null} onRoll={onRollCheck} />
                                ) : (
                                    <GameMessage message={message} mine={message.memberId !== null && message.memberId === myMemberId} replyTo={message.replyToId ? (byId.get(message.replyToId) ?? null) : null} maddoxAvatarUrl={maddoxAvatarUrl} color={color} />
                                )}
                                {message.kind === "narration" && message.opexNpcFailures?.length ? <OpexNpcFailureLine failures={message.opexNpcFailures} /> : null}
                                {actionOptions && actionOptions.view.messageId === message.id && <GameActionOptions view={actionOptions.view} color={color} busy={actionOptions.busy} onPick={actionOptions.onPick} />}
                            </div>
                        </Fragment>
                    )
                })}
                {live.map((item) => (
                    <Fragment key={item.liveId}>
                        {item.kind === "narration" && item.turnNumber !== lastTurn && <TurnDivider number={item.turnNumber} color={color} />}
                        <LiveGeneration item={item} replyTo={item.replyToId ? (byId.get(item.replyToId) ?? null) : null} maddoxAvatarUrl={maddoxAvatarUrl} color={color} />
                    </Fragment>
                ))}
                {narrating && !liveNarration && (
                    <MaddoxBubble avatarUrl={maddoxAvatarUrl} color={color}>
                        <WritingIndicator color={color} />
                    </MaddoxBubble>
                )}
            </div>
            <AnimatePresence>
                {showJump && (
                    <motion.div key="jump" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }} className="absolute bottom-3 left-1/2 -translate-x-1/2">
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7 gap-1.5 rounded-full shadow-md"
                            onClick={() => {
                                stickRef.current = true
                                setShowJump(false)
                                scrollToEnd("smooth")
                            }}
                        >
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden /> Ir para o fim
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function TurnDivider({ number, color }: { number: number; color: string }) {
    return (
        <div className="flex items-center gap-3 py-3" role="separator" aria-label={`Turno ${number}`} data-testid="turn-divider">
            <span className="h-px flex-1" style={{ backgroundColor: `${color}33` }} />
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color }}>
                Turno {number}
            </span>
            <span className="h-px flex-1" style={{ backgroundColor: `${color}33` }} />
        </div>
    )
}

/** Fala do Maddox chegando em streaming: texto parcial (citações em negrito até gravar), cursor e o uso de ferramentas. */
function LiveGeneration({ item, replyTo, maddoxAvatarUrl, color }: { item: MaddoxLiveGenerationDto; replyTo: MaddoxGameMessageDto | null; maddoxAvatarUrl: string | null; color: string }) {
    // Bloco de NPC (DND-25): os dados rolam primeiro, um de cada vez; o texto da narração só aparece depois que todos param.
    const rolls = item.rolls ?? []
    const [settled, setSettled] = useState(0)
    const rolling = settled < rolls.length
    const text = rolling ? "" : liveMarkupToBold(item.text)
    return (
        <MaddoxBubble avatarUrl={maddoxAvatarUrl} color={color} testId={item.kind === "answer" ? "maddox-live-answer" : "maddox-live-narration"}>
            {item.kind === "answer" && <ReplyTo replyTo={replyTo} color={color} />}
            <LiveNpcRolls rolls={rolls} settled={Math.min(settled, rolls.length)} onSettled={setSettled} />
            {rolling ? null : text.trim() ? (
                <div aria-busy="true">
                    <Markdown lineAction={null}>{text}</Markdown>
                    <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse align-middle" style={{ backgroundColor: color }} aria-hidden data-testid="live-cursor" />
                </div>
            ) : (
                !item.tool && <WritingIndicator color={color} label={item.kind === "answer" ? "O Maddox está respondendo…" : "O Maddox está narrando…"} />
            )}
            {item.tool && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status" data-testid="live-tool">
                    <BookOpen className="h-3.5 w-3.5 animate-pulse" style={{ color }} aria-hidden /> Consultando as anotações da campanha…
                </p>
            )}
        </MaddoxBubble>
    )
}

function ReplyTo({ replyTo, color }: { replyTo: MaddoxGameMessageDto | null; color: string }) {
    if (!replyTo) return null
    return (
        <p className="border-l-2 pl-2 text-xs text-white/60" style={{ borderColor: `${color}80` }}>
            Respondendo a <span className="font-medium text-white/80">{replyTo.characterName ?? "Personagem"}</span>
        </p>
    )
}

function GameMessage({ message, mine, replyTo, maddoxAvatarUrl, color }: { message: MaddoxGameMessageDto; mine: boolean; replyTo: MaddoxGameMessageDto | null; maddoxAvatarUrl: string | null; color: string }) {
    const name = message.characterName ?? "Personagem"
    if (message.kind === "narration" || message.kind === "answer") {
        return (
            <MaddoxBubble avatarUrl={maddoxAvatarUrl} color={color} testId={message.kind === "answer" ? "maddox-answer" : "maddox-narration"}>
                {message.kind === "answer" && <ReplyTo replyTo={replyTo} color={color} />}
                {message.error ? (
                    <p className="flex items-center gap-1.5 text-sm text-white/60" role="alert" data-testid="maddox-answer-error">
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden /> {message.error}
                    </p>
                ) : (
                    <Markdown lineAction={null}>{message.content}</Markdown>
                )}
                {message.sceneImages?.map((image) => <GameSceneImage key={image.id} image={image} color={color} />)}
            </MaddoxBubble>
        )
    }
    if (message.kind === "pass") {
        return (
            <motion.p {...bubble} className="flex items-center justify-center gap-1.5 pb-3 text-xs text-white/50" data-testid="game-pass">
                <MinusCircle className="h-3.5 w-3.5" aria-hidden />
                <span>
                    <span className="font-medium text-white/70">{name}</span>
                    {message.opex && <OpexChip className="ml-1" />} não fez nada{message.skippedByName ? ` (pulado por ${message.skippedByName})` : ""}.
                </span>
            </motion.p>
        )
    }
    // Declaração de outro jogador oculta pela campanha (DND-36): o texto não chega; só a linha discreta.
    if (message.hiddenAction && !mine) {
        return (
            <motion.p {...bubble} className="flex items-center justify-center gap-1.5 pb-3 text-xs text-white/50" data-testid="game-action-hidden">
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
                <span>
                    <span className="font-medium text-white/70">{name}</span>
                    {message.opex && <OpexChip className="ml-1" />} declarou sua ação.
                </span>
            </motion.p>
        )
    }
    const question = message.kind === "question"
    return (
        <motion.div {...bubble} className={`flex items-start gap-2.5 pb-3 ${mine ? "flex-row-reverse" : ""}`} data-testid={question ? "game-question" : "game-declaration"}>
            <MemberAvatar name={name} imageUrl={message.portraitUrl} color={color} className="mt-0.5 h-7 w-7 shrink-0 self-start" />
            <div className={`min-w-0 max-w-[85%] space-y-1 break-words rounded-2xl border px-3.5 py-2 text-sm text-foreground ${mine ? "rounded-tr-sm border-primary/30 bg-primary/15" : "rounded-tl-sm border-white/10 bg-white/[0.05]"}`}>
                <p className="flex items-center gap-1 text-xs font-semibold text-white/80">
                    {name}
                    {message.opex && <OpexChip />}
                    {question && (
                        <span className="inline-flex items-center gap-0.5 font-normal text-white/60">
                            <HelpCircle className="h-3 w-3" aria-hidden /> pergunta ao mestre
                        </span>
                    )}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
        </motion.div>
    )
}

function MaddoxBubble({ avatarUrl, color, testId, children }: { avatarUrl: string | null; color: string; testId?: string; children: React.ReactNode }) {
    return (
        <motion.div {...bubble} className="flex items-start gap-2.5 pb-4" data-testid={testId ?? "maddox-writing"}>
            <MemberAvatar name="Maddox" imageUrl={avatarUrl} color={color} className="mt-0.5 h-7 w-7 shrink-0 self-start" />
            <div className="min-w-0 max-w-[85%] space-y-1 break-words rounded-2xl rounded-tl-sm border bg-white/[0.03] px-3.5 py-2.5 text-sm text-foreground" style={{ borderColor: `${color}40` }}>
                <p className="text-xs font-semibold" style={{ color }}>
                    Maddox
                </p>
                {children}
            </div>
        </motion.div>
    )
}

function WritingIndicator({ color, label = "O Maddox está narrando…" }: { color: string; label?: string }) {
    const reduceMotion = useReducedMotion() ?? false
    return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((dot) => (
                    <motion.span
                        key={dot}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: color }}
                        animate={reduceMotion ? undefined : { opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
                        transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15 }}
                    />
                ))}
            </span>
            {label}
        </div>
    )
}
