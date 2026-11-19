"use client"

import { useState, type FormEvent, type KeyboardEvent } from "react"
import { Loader2, Send } from "lucide-react"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { Button } from "@/components/ui/opex/button"
import { Textarea } from "@/components/ui/opex/textarea"
import { MADDOX_REMINDER_MAX_CHARS, MADDOX_TALK_PLACEHOLDER, MADDOX_TALK_SUBTITLE, MADDOX_TALK_TITLE } from "../../constants"
import { MasterTalkIconButton } from "./composer-buttons"

interface Props {
    /** Motivo de não poder conversar agora (`null` = posso). */
    blockReason: string | null
    sending: boolean
    onSend: (text: string) => Promise<unknown>
    /** Aberto por fora: o "Perguntar ao mestre" da barra do combate abre esta mesma conversa. */
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

/**
 * "Conversar com o Mestre" (DND-74): a única porta para falar com o mestre, fora da mesa (o jogador fala, não o
 * personagem). Unifica o "Perguntar ao mestre" e o "Injetar Lembrança": o mestre responde, corrige ou registra na hora.
 * O popover tem texto livre de até 500 caracteres, com contador; Enter envia e Shift+Enter quebra a linha.
 */
export function MasterTalkButton({ blockReason, sending, onSend, open: controlledOpen, onOpenChange }: Props) {
    const [localOpen, setLocalOpen] = useState(false)
    const open = controlledOpen ?? localOpen
    const setOpen = (next: boolean) => {
        if (controlledOpen === undefined) setLocalOpen(next)
        onOpenChange?.(next)
    }
    const [text, setText] = useState("")
    const length = text.trim().length
    const tooLong = text.length > MADDOX_REMINDER_MAX_CHARS
    const invalid = length === 0 || tooLong
    const send = async () => {
        if (invalid || sending || blockReason) return
        try {
            await onSend(text.trim())
            setText("")
            setOpen(false)
        } catch {
            // o aviso de erro vem da mutação; o rascunho fica no campo
        }
    }
    const submit = (event: FormEvent) => {
        event.preventDefault()
        void send()
    }
    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void send()
        }
    }
    return (
        <GlassPopover open={open && !blockReason} onOpenChange={setOpen}>
            <GlassPopoverTrigger asChild>
                <MasterTalkIconButton disabled={Boolean(blockReason)} title={blockReason ?? MADDOX_TALK_TITLE} aria-description={blockReason ?? undefined} data-testid="master-talk-button" />
            </GlassPopoverTrigger>
            <GlassPopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))]" data-testid="master-talk-popover">
                <form className="space-y-2.5" onSubmit={submit}>
                    <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-white">{MADDOX_TALK_TITLE}</p>
                        <p className="text-xs text-white/60" data-testid="master-talk-subtitle">
                            {MADDOX_TALK_SUBTITLE}
                        </p>
                    </div>
                    <Textarea
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={MADDOX_TALK_PLACEHOLDER}
                        rows={6}
                        className="min-h-[9rem] resize-none"
                        aria-label="Mensagem para o mestre"
                        aria-invalid={tooLong || undefined}
                        data-testid="master-talk-text"
                    />
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-white/50">
                            <span className={tooLong ? "font-semibold text-destructive" : undefined} data-testid="master-talk-counter">
                                {text.length}/{MADDOX_REMINDER_MAX_CHARS}
                            </span>{" "}
                            · Enter envia · Shift+Enter quebra linha
                        </span>
                        <Button type="submit" size="sm" disabled={invalid || sending} data-testid="master-talk-send">
                            {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Enviar
                        </Button>
                    </div>
                </form>
            </GlassPopoverContent>
        </GlassPopover>
    )
}
