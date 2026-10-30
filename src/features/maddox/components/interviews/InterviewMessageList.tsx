"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, ArrowDown, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Markdown } from "@/components/ui/opex/markdown"
import { liveMarkupToBold } from "../../catalog-markup"
import type { MaddoxInterviewMessageDto } from "../../interview-types"
import { MemberAvatar } from "../campaigns/campaign-visuals"

/** Distância do fim (px) abaixo da qual a conversa acompanha o texto que chega. */
const NEAR_BOTTOM_PX = 80

const bubble = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: "easeOut" as const } }

interface Props {
    messages: MaddoxInterviewMessageDto[]
    /** Resposta do Maddox chegando agora (`null` = nenhuma). */
    liveText: string | null
    maddoxAvatarUrl: string | null
    color: string
    onRetry?: () => void
    retrying?: boolean
}

/**
 * Conversa da entrevista no padrão do chat do Agente Opex: área com rolagem própria que acompanha o fim enquanto
 * a pessoa não sobe para reler ("Ir para o fim"). Maddox à esquerda com o Markdown colorido; respostas à direita.
 */
export function InterviewMessageList({ messages, liveText, maddoxAvatarUrl, color, onRetry, retrying }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const stickRef = useRef(true)
    const [showJump, setShowJump] = useState(false)
    const lastIndex = messages.length - 1

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

    const signature = `${messages.length}:${messages.at(-1)?.id ?? ""}:${liveText === null ? "-" : liveText.length}`
    useLayoutEffect(() => {
        if (stickRef.current) scrollToEnd()
    }, [signature, scrollToEnd])
    useEffect(() => {
        scrollToEnd()
    }, [scrollToEnd])

    return (
        <div className="relative min-h-0 flex-1">
            <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 pb-2 pt-4" role="log" aria-live="polite" aria-label="Conversa com o Maddox">
                {messages.map((message, index) =>
                    message.role === "maddox" ? (
                        <MaddoxMessage key={message.id} avatarUrl={maddoxAvatarUrl} color={color}>
                            {message.error ? (
                                <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="min-w-0 flex-1 break-words">O Maddox não conseguiu responder: {message.error}</span>
                                    {index === lastIndex && onRetry && (
                                        <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={onRetry} disabled={retrying}>
                                            {retrying ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RotateCcw className="h-3 w-3" aria-hidden />} Tentar de novo
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <Markdown lineAction={null}>{message.content}</Markdown>
                            )}
                        </MaddoxMessage>
                    ) : (
                        <motion.div key={message.id} {...bubble} className="flex justify-end pb-3">
                            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm border border-primary/30 bg-primary/15 px-3.5 py-2 text-sm text-foreground">{message.content}</div>
                        </motion.div>
                    ),
                )}
                {liveText !== null && (
                    <MaddoxMessage avatarUrl={maddoxAvatarUrl} color={color} live>
                        <AnimatePresence initial={false}>{!liveText && <WritingIndicator color={color} />}</AnimatePresence>
                        {liveText && <StreamingText text={liveText} color={color} />}
                    </MaddoxMessage>
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

function MaddoxMessage({ avatarUrl, color, live, children }: { avatarUrl: string | null; color: string; live?: boolean; children: React.ReactNode }) {
    return (
        <motion.div {...bubble} className="flex items-start gap-2.5 pb-4" data-live={live ? "true" : undefined} data-testid="maddox-message">
            {/* Tamanho fixo e alinhado ao topo: no flex, um filho sem altura própria esticaria até a altura da fala. */}
            <MemberAvatar name="Maddox" imageUrl={avatarUrl} color={color} className="mt-0.5 h-7 w-7 shrink-0 self-start" />
            <div
                className="min-w-0 max-w-[85%] space-y-1 break-words rounded-2xl rounded-tl-sm border bg-white/[0.03] px-3.5 py-2.5 text-sm text-foreground"
                style={{ borderColor: `${color}40` }}
                data-testid="maddox-bubble"
            >
                <p className="text-xs font-semibold" style={{ color }} data-testid="maddox-name">
                    Maddox
                </p>
                {children}
            </div>
        </motion.div>
    )
}

function StreamingText({ text, color }: { text: string; color: string }) {
    const reduceMotion = useReducedMotion() ?? false
    return (
        <div className="relative">
            <Markdown lineAction={null}>{liveMarkupToBold(text)}</Markdown>
            <motion.span
                aria-hidden
                data-testid="maddox-cursor"
                className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 rounded-sm align-middle"
                style={{ backgroundColor: color }}
                animate={reduceMotion ? undefined : { opacity: [1, 0.2, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
            />
        </div>
    )
}

function WritingIndicator({ color }: { color: string }) {
    const reduceMotion = useReducedMotion() ?? false
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <span className="flex gap-1" aria-hidden data-testid="maddox-writing-dots">
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
            Maddox está escrevendo…
        </motion.div>
    )
}
