"use client"

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { ArrowUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Textarea } from "@/components/ui/opex/textarea"
import { cn } from "@/lib/utils"
import { MADDOX_INTERVIEW_MESSAGE_MAX } from "../../constants"

/** Altura máxima (px) do campo antes de rolar, como no chat do Agente Opex. */
const MAX_HEIGHT = 180

/** Campo de resposta no padrão do chat do Opex: Enter envia, Shift+Enter quebra a linha, cresce até 180px. */
export function InterviewComposer({ disabled, busy, placeholder, onSend }: { disabled: boolean; busy: boolean; placeholder: string; onSend: (content: string) => Promise<boolean | undefined> }) {
    const [value, setValue] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const content = value.trim()
    const canSend = !disabled && !busy && content.length > 0 && content.length <= MADDOX_INTERVIEW_MESSAGE_MAX

    useLayoutEffect(() => {
        const element = textareaRef.current
        if (!element) return
        element.style.height = "auto"
        element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`
    }, [value])

    const submit = async (event?: FormEvent) => {
        event?.preventDefault()
        if (!canSend) return
        const draft = value
        setValue("")
        const sent = await onSend(content)
        // Falhou antes de gravar: devolve o texto para não perder a resposta.
        if (sent === false) setValue(draft)
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void submit()
        }
    }

    return (
        <form onSubmit={submit} className="border-t bg-background/60 px-3 pb-3 pt-2.5" aria-label="Responder ao Maddox">
            <div className={cn("flex items-end gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-primary/60", disabled && "opacity-70")} data-testid="interview-composer-box">
                <Textarea
                    ref={textareaRef}
                    aria-label="Sua resposta"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    maxLength={MADDOX_INTERVIEW_MESSAGE_MAX}
                    rows={1}
                    className="mb-1 max-h-[180px] min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                />
                <Button type="submit" size="icon" className="h-8 w-8 shrink-0 rounded-full" disabled={!canSend} aria-label="Enviar resposta" title="Enviar (Enter)">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
                </Button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-muted-foreground/70">Enter envia · Shift+Enter quebra linha</p>
        </form>
    )
}
