"use client"

import { useState, type FormEvent, type KeyboardEvent } from "react"
import { Loader2, SendHorizontal } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Textarea } from "@/components/ui/opex/textarea"
import { MADDOX_INTERVIEW_MESSAGE_MAX } from "../../constants"

/** Campo de resposta: Enter envia, Shift+Enter quebra a linha. Desabilitado enquanto o Maddox responde. */
export function InterviewComposer({ disabled, busy, placeholder, onSend }: { disabled: boolean; busy: boolean; placeholder: string; onSend: (content: string) => Promise<boolean | undefined> }) {
    const [value, setValue] = useState("")
    const content = value.trim()
    const canSend = !disabled && !busy && content.length > 0 && content.length <= MADDOX_INTERVIEW_MESSAGE_MAX

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
        <form onSubmit={submit} className="flex items-end gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2 backdrop-blur" aria-label="Responder ao Maddox">
            <Textarea
                aria-label="Sua resposta"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                maxLength={MADDOX_INTERVIEW_MESSAGE_MAX}
                rows={2}
                className="max-h-48 min-h-[44px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="icon" disabled={!canSend} aria-label="Enviar resposta">
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <SendHorizontal aria-hidden />}
            </Button>
        </form>
    )
}
