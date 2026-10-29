"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowDown } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import type { OpexLiveMessage, OpexMessageDto } from "../../types"
import { VirtualStack } from "../VirtualStack"
import { AssistantMessage, UserMessage } from "./OpexMessageItem"

export type ChatItem = { kind: "message"; message: OpexMessageDto } | { kind: "live"; live: OpexLiveMessage; streaming: boolean }

/** Junta as mensagens gravadas e a resposta ao vivo (ou a recém-terminada, até a gravada chegar). */
export function buildChatItems(messages: readonly OpexMessageDto[], live: OpexLiveMessage | null, settled: OpexLiveMessage | null): ChatItem[] {
    const items: ChatItem[] = messages.map((message) => ({ kind: "message", message }))
    const known = new Set(messages.map((message) => message.id))
    if (live && !known.has(live.id)) items.push({ kind: "live", live, streaming: true })
    else if (!live && settled && !known.has(settled.id)) items.push({ kind: "live", live: settled, streaming: false })
    return items
}

/** A resposta ao vivo e a gravada têm o mesmo id: a troca não remonta nem reanima o balão. */
export const chatItemKey = (item: ChatItem): string => (item.kind === "live" ? item.live.id : item.message.id)

const NEAR_BOTTOM_PX = 80

interface OpexMessageListProps {
    items: ChatItem[]
    onDecide: (actionId: string, decision: "confirm" | "cancel") => void
    deciding: boolean
    onRetry: (text: string) => void
    busy: boolean
}

/** Conversa com rolagem que acompanha o fim enquanto o usuário não sobe; botão "Ir para o fim". */
export function OpexMessageList({ items, onDecide, deciding, onRetry, busy }: OpexMessageListProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const stickRef = useRef(true)
    const [showJump, setShowJump] = useState(false)

    const scrollToEnd = useCallback((behavior: ScrollBehavior = "auto") => {
        const element = scrollRef.current
        if (element) element.scrollTo({ top: element.scrollHeight, behavior })
    }, [])

    const onScroll = () => {
        const element = scrollRef.current
        if (!element) return
        const near = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX
        stickRef.current = near
        setShowJump(!near)
    }

    // Conteúdo novo (mensagem, pedaço de texto, ferramenta): acompanha o fim se o usuário estava lá.
    const lastItem = items.at(-1)
    const signature = `${items.length}:${lastItem?.kind === "live" ? lastItem.live.parts.length + JSON.stringify(lastItem.live.parts.at(-1) ?? "").length : (lastItem?.message.id ?? "")}`
    useLayoutEffect(() => {
        if (stickRef.current) scrollToEnd()
    }, [signature, scrollToEnd])
    useEffect(() => {
        scrollToEnd()
    }, [scrollToEnd])

    const lastAssistantIndex = items.findLastIndex((item) => item.kind === "message" && item.message.role === "assistant")
    const retryText = (index: number): string | null => {
        for (let cursor = index - 1; cursor >= 0; cursor--) {
            const item = items[cursor]!
            if (item.kind === "message" && item.message.role === "user") return item.message.kind === "message" ? item.message.text : null
        }
        return null
    }

    const renderItem = (index: number) => {
        const item = items[index]!
        if (item.kind === "live") return <AssistantMessage parts={item.live.parts} streaming={item.streaming} thinking={item.live.thinking} onDecide={onDecide} deciding={deciding} />
        const message = item.message
        if (message.role === "user") return <UserMessage message={message} />
        const text = index === lastAssistantIndex && message.status !== "complete" && !busy ? retryText(index) : null
        return <AssistantMessage parts={message.parts} message={message} onDecide={onDecide} deciding={deciding} onRetry={text ? () => onRetry(text) : undefined} />
    }

    return (
        <div className="relative min-h-0 flex-1">
            <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 pb-2 pt-4" role="log" aria-live="polite" aria-label="Conversa com o Agente Opex">
                <VirtualStack count={items.length} scrollRef={scrollRef} estimateSize={140} getKey={(index) => chatItemKey(items[index]!)} renderItem={renderItem} />
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
