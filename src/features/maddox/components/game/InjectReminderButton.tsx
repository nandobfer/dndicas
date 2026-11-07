"use client"

import { useState, type FormEvent } from "react"
import { Lightbulb, Loader2, Send } from "lucide-react"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { Button } from "@/components/ui/opex/button"
import { Textarea } from "@/components/ui/opex/textarea"
import { MADDOX_REMINDER_MAX_CHARS, MADDOX_REMINDER_PLACEHOLDER } from "../../constants"

/**
 * "Injetar Lembrança" (DND-25, todos os graus): ao lado de "Gerar imagem da cena". Abre um popover com um texto livre de
 * até 500 caracteres que o Maddox considera na próxima narração. Desabilitado com o motivo quando a campanha não está
 * em jogo ou o jogador ainda não concluiu a entrevista.
 */
export function InjectReminderButton({ blockReason, sending, onSend }: { blockReason: string | null; sending: boolean; onSend: (text: string) => Promise<unknown> }) {
    const [open, setOpen] = useState(false)
    const [text, setText] = useState("")
    const length = text.trim().length
    const tooLong = text.length > MADDOX_REMINDER_MAX_CHARS
    const invalid = length === 0 || tooLong
    const submit = async (event: FormEvent) => {
        event.preventDefault()
        if (invalid || sending || blockReason) return
        try {
            await onSend(text.trim())
            setText("")
            setOpen(false)
        } catch {
            // o aviso de erro vem da mutação; o rascunho fica no campo
        }
    }
    return (
        <GlassPopover open={open} onOpenChange={setOpen}>
            <GlassPopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={Boolean(blockReason)} title={blockReason ?? "Lembrar o Maddox de algo que ele deve considerar agora"} aria-description={blockReason ?? undefined} data-testid="inject-reminder-button">
                    <Lightbulb aria-hidden /> Injetar Lembrança
                </Button>
            </GlassPopoverTrigger>
            <GlassPopoverContent align="end" className="w-80" data-testid="inject-reminder-popover">
                <form className="space-y-2.5" onSubmit={(event) => void submit(event)}>
                    <p className="text-sm font-semibold text-white">Injetar Lembrança</p>
                    <Textarea
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder={MADDOX_REMINDER_PLACEHOLDER}
                        rows={4}
                        aria-label="Lembrança para o Maddox"
                        aria-invalid={tooLong || undefined}
                        data-testid="inject-reminder-text"
                    />
                    <div className="flex items-center justify-between gap-2">
                        <span className={tooLong ? "text-xs font-semibold text-destructive" : "text-xs text-white/50"} data-testid="inject-reminder-counter">
                            {text.length}/{MADDOX_REMINDER_MAX_CHARS}
                        </span>
                        <Button type="submit" size="sm" disabled={invalid || sending} data-testid="inject-reminder-send">
                            {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Enviar
                        </Button>
                    </div>
                </form>
            </GlassPopoverContent>
        </GlassPopover>
    )
}
