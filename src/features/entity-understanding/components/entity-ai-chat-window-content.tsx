"use client"

import * as React from "react"
import { AlertCircle, Loader2, RefreshCcw, Send, Sparkles } from "lucide-react"
import { cn } from "@/core/utils"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { RichTextEditor } from "@/features/rules/components/rich-text-editor"
import { getPlainTextFromHtml, isMeaningfulHtml, sanitizeEntityUnderstandingHtml } from "../services/entity-understanding-html"
import { ENTITY_UNDERSTANDING_IDLE_TTL_MS, type EntityUnderstandingMessage, type EntityUnderstandingMode } from "../types/entity-understanding.types"

interface EntityAIChatWindowContentProps {
    entity: unknown
    entityId: string
    entityType: string
    entityName: string
}

type ChatMessage = EntityUnderstandingMessage & { id: string }

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const streamEntityUnderstanding = async ({
    entity,
    entityId,
    entityType,
    mode,
    messages,
    signal,
    onChunk,
}: {
    entity: unknown
    entityId: string
    entityType: string
    mode: EntityUnderstandingMode
    messages: EntityUnderstandingMessage[]
    signal: AbortSignal
    onChunk: (chunk: string) => void
}) => {
    const response = await fetch("/api/entity-understanding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, entityId, entityType, mode, messages }),
        signal,
    })

    if (!response.ok || !response.body) {
        throw new Error("Não foi possível conversar com a IA agora.")
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() ?? ""

        for (const eventText of events) {
            const eventLine = eventText.split("\n").find((line) => line.startsWith("event:"))
            const dataLine = eventText.split("\n").find((line) => line.startsWith("data:"))
            if (!dataLine) continue

            const eventName = eventLine?.replace("event:", "").trim()
            const payload = JSON.parse(dataLine.replace("data:", "").trim()) as { text?: string; message?: string }

            if (eventName === "chunk" && payload.text) onChunk(payload.text)
            if (eventName === "error") throw new Error(payload.message || "Não foi possível gerar a resposta.")
        }
    }
}

export function EntityAIChatWindowContent({ entity, entityId, entityType, entityName }: EntityAIChatWindowContentProps) {
    const [messages, setMessages] = React.useState<ChatMessage[]>([])
    const [input, setInput] = React.useState("")
    const [isLoading, setIsLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const lastActivityRef = React.useRef<number>(Date.now())
    const abortControllerRef = React.useRef<AbortController | null>(null)

    const resetSession = React.useCallback(() => {
        abortControllerRef.current?.abort()
        abortControllerRef.current = null
        setMessages([])
        setInput("")
        setError(null)
        setIsLoading(false)
        lastActivityRef.current = Date.now()
    }, [])

    const requestAi = React.useCallback(async (mode: EntityUnderstandingMode, nextMessages: ChatMessage[]) => {
        const controller = new AbortController()
        abortControllerRef.current?.abort()
        abortControllerRef.current = controller

        const aiMessage: ChatMessage = { id: createId(), role: "model", html: "" }
        setMessages([...nextMessages, aiMessage])
        setIsLoading(true)
        setError(null)
        lastActivityRef.current = Date.now()

        let accumulated = ""

        try {
            await streamEntityUnderstanding({
                entity,
                entityId,
                entityType,
                mode,
                messages: nextMessages.map(({ role, html }) => ({ role, html })),
                signal: controller.signal,
                onChunk: (chunk) => {
                    accumulated += chunk
                    const sanitized = sanitizeEntityUnderstandingHtml(accumulated)
                    setMessages((current) => current.map((message) => message.id === aiMessage.id ? { ...message, html: sanitized } : message))
                },
            })
        } catch (caught) {
            if (controller.signal.aborted) return
            const message = caught instanceof Error ? caught.message : "Não foi possível gerar a resposta."
            setError(message)
            setMessages((current) => current.filter((messageItem) => messageItem.id !== aiMessage.id || getPlainTextFromHtml(messageItem.html)))
        } finally {
            if (!controller.signal.aborted) {
                setIsLoading(false)
                abortControllerRef.current = null
                lastActivityRef.current = Date.now()
            }
        }
    }, [entity, entityId, entityType])

    const startSession = React.useCallback(() => {
        resetSession()
        void requestAi("initial_summary", [])
    }, [requestAi, resetSession])

    const sendUserMessage = React.useCallback(() => {
        const sanitizedInput = sanitizeEntityUnderstandingHtml(input)
        if (!isMeaningfulHtml(sanitizedInput) || isLoading) return

        const isExpired = Date.now() - lastActivityRef.current > ENTITY_UNDERSTANDING_IDLE_TTL_MS
        if (isExpired) {
            setInput("")
            startSession()
            return
        }

        const userMessage: ChatMessage = { id: createId(), role: "user", html: sanitizedInput }
        const nextMessages = [...messages, userMessage]
        setInput("")
        setMessages(nextMessages)
        lastActivityRef.current = Date.now()
        void requestAi("conversation", nextMessages)
    }, [input, isLoading, messages, requestAi, startSession])

    React.useEffect(() => {
        void requestAi("initial_summary", [])

        return () => {
            abortControllerRef.current?.abort()
        }
    }, [requestAi])

    return (
        <div className="flex h-full min-h-0 flex-col gap-3" data-mention-interaction-surface="entity-ai-chat">
            <div className="border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Sparkles className="h-4 w-4 text-fuchsia-200" />
                    Entender com IA
                </div>
                <p className="mt-1 text-xs text-white/50">Chat contextual sobre {entityName || entityType}.</p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {messages.map((message) => (
                    <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                        <div className={cn(
                            "max-w-[86%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-lg",
                            message.role === "user"
                                ? "rounded-br-md bg-cyan-400/15 text-cyan-50 ring-1 ring-cyan-300/20"
                                : "rounded-bl-md bg-white/10 text-white/80 ring-1 ring-white/10",
                        )}>
                            {message.html ? <MentionContent html={message.html} mode="block" /> : (
                                <span className="inline-flex items-center gap-2 text-white/45">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Pensando...
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                    <button type="button" onClick={startSession} className="ml-auto text-red-50 hover:text-white" aria-label="Tentar novamente">
                        <RefreshCcw className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            <div className="flex items-end gap-2 border-t border-white/10 pt-3">
                <RichTextEditor
                    value={input}
                    onChange={setInput}
                    variant="simple"
                    placeholder="Pergunte sobre esta entidade..."
                    className="min-w-0 flex-1"
                    disabled={isLoading}
                    submitOnEnter
                    onSubmitRequest={sendUserMessage}
                />
                <button
                    type="button"
                    onClick={sendUserMessage}
                    disabled={isLoading || !isMeaningfulHtml(input)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/30 transition hover:bg-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Enviar mensagem"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
            </div>
        </div>
    )
}
