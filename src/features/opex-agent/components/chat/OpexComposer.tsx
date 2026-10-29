"use client"

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUp, Loader2, Paperclip, Square } from "lucide-react"
import type { OpexUploadItem } from "../../hooks/useOpexUploads"
import { OpexAttachmentChips } from "./OpexAttachmentChips"
import { Button } from "@/components/ui/opex/button"
import { ReplyTextarea } from "@/components/agent-reply/ReplyTextarea"
import { REPLY_PRIORITY } from "@/components/agent-reply/ReplyTargetProvider"
import { cn } from "@/lib/utils"
import { OPEX_MESSAGE_MAX } from "../../constants"

export interface OpexComposerHandle {
    focus: () => void
    setText: (text: string) => void
    getText: () => string
}

/** Arquivos da próxima mensagem (fila de envio da sessão). */
export interface OpexComposerAttachments {
    items: OpexUploadItem[]
    onFiles: (files: File[]) => void
    onRetry: (localId: string) => void
    onRemove: (localId: string) => void
}

interface OpexComposerProps {
    onSend: (text: string) => void
    attachments: OpexComposerAttachments
    onStop: () => void
    /** O agente está respondendo: mostra Parar no lugar de Enviar. */
    running: boolean
    sending: boolean
    stopping: boolean
    disabledReason?: string | null
    /** Texto inicial (ex.: digitado na "Nova sessão" antes de anexar um arquivo). */
    initialText?: string
}

const MAX_HEIGHT = 180

/** Campo do chat: Enter envia, Shift+Enter quebra linha; cresce até ~7 linhas. */
export const OpexComposer = forwardRef<OpexComposerHandle, OpexComposerProps>(function OpexComposer({ onSend, attachments, onStop, running, sending, stopping, disabledReason, initialText }, ref) {
    const [text, setText] = useState(initialText ?? "")
    const textRef = useRef(text)
    useEffect(() => {
        textRef.current = text
    }, [text])
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus(), setText: (value: string) => setText(value), getText: () => textRef.current }), [])

    useEffect(() => {
        textareaRef.current?.focus({ preventScroll: true })
    }, [])

    useLayoutEffect(() => {
        const element = textareaRef.current
        if (!element) return
        element.style.height = "auto"
        element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`
    }, [text])

    const blocked = Boolean(disabledReason)
    const uploading = attachments.items.some((item) => item.status === "uploading" || item.status === "confirming")
    const failed = attachments.items.some((item) => item.status === "error")
    const ready = attachments.items.filter((item) => item.status === "done").length
    const hasContent = text.trim().length > 0 || ready > 0
    const canSend = !blocked && !running && !sending && !uploading && !failed && hasContent
    const sendHint = uploading ? "Aguarde o envio dos arquivos" : failed ? "Remova ou reenvie os arquivos com erro" : "Enviar (Enter)"

    const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (!files.length || blocked) return
        event.preventDefault()
        attachments.onFiles(files)
    }

    const submit = () => {
        if (!canSend) return
        onSend(text.trim())
        setText("")
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
        }
    }

    return (
        <div className="border-t bg-background/60 px-3 pb-3 pt-2.5">
            <OpexAttachmentChips items={attachments.items} onRetry={attachments.onRetry} onRemove={attachments.onRemove} />
            <div className={cn("flex items-end gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-primary/60", blocked && "opacity-70")}>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    hidden
                    tabIndex={-1}
                    aria-hidden
                    onChange={(event) => {
                        const files = Array.from(event.target.files ?? [])
                        event.target.value = ""
                        if (files.length) attachments.onFiles(files)
                    }}
                />
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                    onClick={() => inputRef.current?.click()}
                    disabled={blocked}
                    aria-label="Anexar arquivos"
                    title="Anexar arquivos (ou cole/arraste no chat)"
                >
                    <Paperclip className="h-4 w-4" aria-hidden />
                </Button>
                <ReplyTextarea
                    ref={textareaRef}
                    vim={false}
                    rows={1}
                    value={text}
                    onValueChange={(value) => setText(value.slice(0, OPEX_MESSAGE_MAX))}
                    replyPriority={REPLY_PRIORITY.chat}
                    maxLength={OPEX_MESSAGE_MAX}
                    disabled={blocked}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                    placeholder={blocked ? (disabledReason ?? "") : "Peça algo ao Agente Opex…"}
                    aria-label="Mensagem para o Agente Opex"
                    data-ctrl-enter-ignore
                    className="max-h-[180px] min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                />
                <AnimatePresence mode="wait" initial={false}>
                    {running ? (
                        <motion.span key="stop" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.15 }}>
                            <Button type="button" size="icon" variant="secondary" className="h-8 w-8 rounded-full" onClick={onStop} disabled={stopping} aria-label="Parar resposta" title="Parar resposta">
                                {stopping ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Square className="h-3.5 w-3.5 fill-current" aria-hidden />}
                            </Button>
                        </motion.span>
                    ) : (
                        <motion.span key="send" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.15 }}>
                            <Button type="button" size="icon" className="h-8 w-8 rounded-full" onClick={submit} disabled={!canSend} aria-label="Enviar mensagem" title={sendHint}>
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
                            </Button>
                        </motion.span>
                    )}
                </AnimatePresence>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-muted-foreground/70">Enter envia · Shift+Enter quebra linha · cole ou arraste arquivos · ações destrutivas pedem sua confirmação</p>
        </div>
    )
})
