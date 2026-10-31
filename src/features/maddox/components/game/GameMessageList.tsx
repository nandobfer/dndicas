"use client"

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowDown, HelpCircle, Loader2, MinusCircle } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Markdown } from "@/components/ui/opex/markdown"
import type { MaddoxGameMessageDto } from "../../game-types"
import { MemberAvatar } from "../campaigns/campaign-visuals"

const NEAR_BOTTOM_PX = 80
const bubble = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: "easeOut" as const } }

interface Props {
    messages: MaddoxGameMessageDto[]
    myMemberId: string | null
    maddoxAvatarUrl: string | null
    color: string
    /** O Maddox está narrando agora (turno do mestre). */
    narrating: boolean
    hasMore: boolean
    loadingMore: boolean
    onLoadMore: () => void
}

/**
 * Conversa da mesa no padrão do chat do Opex (rolagem própria, "Ir para o fim"): narrações e respostas do Maddox
 * à esquerda com o avatar dele; declarações e perguntas com o retrato do personagem (as minhas à direita);
 * "não fez nada" como linha discreta; divisor a cada turno.
 */
export function GameMessageList({ messages, myMemberId, maddoxAvatarUrl, color, narrating, hasMore, loadingMore, onLoadMore }: Props) {
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

    const signature = `${messages.length}:${messages.at(-1)?.id ?? ""}:${narrating ? 1 : 0}`
    useLayoutEffect(() => {
        if (stickRef.current) scrollToEnd()
    }, [signature, scrollToEnd])
    useEffect(() => {
        scrollToEnd()
    }, [scrollToEnd])

    return (
        <div className="relative min-h-0 flex-1">
            <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 pb-2 pt-4" role="log" aria-live="polite" aria-label="Mesa da campanha">
                {hasMore && (
                    <div className="flex justify-center pb-3">
                        <Button type="button" size="sm" variant="ghost" onClick={onLoadMore} disabled={loadingMore}>
                            {loadingMore && <Loader2 className="animate-spin" aria-hidden />} Carregar anteriores
                        </Button>
                    </div>
                )}
                {messages.map((message, index) => {
                    const previous = messages[index - 1]
                    const divider = message.kind === "narration" && (!previous || previous.turnNumber !== message.turnNumber)
                    return (
                        <Fragment key={message.id}>
                            {divider && <TurnDivider number={message.turnNumber} color={color} />}
                            <GameMessage message={message} mine={message.memberId !== null && message.memberId === myMemberId} replyTo={message.replyToId ? (byId.get(message.replyToId) ?? null) : null} maddoxAvatarUrl={maddoxAvatarUrl} color={color} />
                        </Fragment>
                    )
                })}
                {narrating && (
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

function GameMessage({ message, mine, replyTo, maddoxAvatarUrl, color }: { message: MaddoxGameMessageDto; mine: boolean; replyTo: MaddoxGameMessageDto | null; maddoxAvatarUrl: string | null; color: string }) {
    const name = message.characterName ?? "Personagem"
    if (message.kind === "narration" || message.kind === "answer") {
        return (
            <MaddoxBubble avatarUrl={maddoxAvatarUrl} color={color} testId={message.kind === "answer" ? "maddox-answer" : "maddox-narration"}>
                {message.kind === "answer" && replyTo && (
                    <p className="border-l-2 pl-2 text-xs text-white/60" style={{ borderColor: `${color}80` }}>
                        Respondendo a <span className="font-medium text-white/80">{replyTo.characterName ?? "Personagem"}</span>
                    </p>
                )}
                <Markdown lineAction={null}>{message.content}</Markdown>
            </MaddoxBubble>
        )
    }
    if (message.kind === "pass") {
        return (
            <motion.p {...bubble} className="flex items-center justify-center gap-1.5 pb-3 text-xs text-white/50" data-testid="game-pass">
                <MinusCircle className="h-3.5 w-3.5" aria-hidden />
                <span>
                    <span className="font-medium text-white/70">{name}</span> não fez nada{message.skippedByName ? ` (pulado por ${message.skippedByName})` : ""}.
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

function WritingIndicator({ color }: { color: string }) {
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
            O Maddox está narrando…
        </div>
    )
}
