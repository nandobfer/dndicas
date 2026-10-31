"use client"

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { HelpCircle, Loader2, MinusCircle, Send } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Textarea } from "@/components/ui/opex/textarea"
import { cn } from "@/lib/utils"
import { MADDOX_GAME_MESSAGE_MAX } from "../../constants"
import type { MaddoxGameActionInput } from "../../game-schemas"
import { focusComposer } from "../composer-focus"

const MAX_HEIGHT = 180

interface Props {
    /** Motivo de o campo estar bloqueado (`null` = posso agir). */
    blockedReason: string | null
    /** Já declarei neste turno: só posso perguntar ao mestre. */
    declared: boolean
    busy: boolean
    onSend: (input: MaddoxGameActionInput) => Promise<boolean>
    /** Motivo de a última declaração ter sido recusada pelo Maddox (rigores Rigoroso e Fiel ao D&D). */
    invalidReason?: string | null
    /** Muda quando uma fala do Maddox termina: o campo volta a ter foco. */
    focusKey?: string
}

/**
 * Campo da mesa: "Declarar" (intenção, ação ou diálogo), "Perguntar ao mestre" (não encerra o turno) e
 * "Não fazer nada" (atalho para passar a vez). Ctrl/⌘+Enter declara; Enter sozinho quebra a linha, para
 * uma declaração (que é final) nunca sair por acidente.
 */
export function GameComposer({ blockedReason, declared, busy, onSend, invalidReason = null, focusKey = "" }: Props) {
    const [value, setValue] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const content = value.trim()
    const blocked = blockedReason !== null
    const hasText = content.length > 0 && content.length <= MADDOX_GAME_MESSAGE_MAX
    const canDeclare = !blocked && !busy && !declared && hasText
    const canAsk = !blocked && !busy && hasText
    const canPass = !blocked && !busy && !declared

    useLayoutEffect(() => {
        const element = textareaRef.current
        if (!element) return
        element.style.height = "auto"
        element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`
    }, [value])

    // O Maddox terminou de narrar ou responder (ou o campo acabou de ser liberado): foco no campo.
    useEffect(() => {
        if (!blocked) focusComposer(textareaRef.current)
    }, [focusKey, blocked])

    const send = async (kind: "declaration" | "question") => {
        if (kind === "declaration" ? !canDeclare : !canAsk) return
        const draft = value
        setValue("")
        const sent = await onSend({ kind, content })
        if (!sent) setValue(draft)
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void send("declaration")
        }
    }

    const hint = blockedReason ?? (declared ? "Você já declarou. Aguardando os outros jogadores — ainda dá para perguntar ao mestre." : "Declare o que o seu personagem faz, diz ou pretende. Perguntas ao mestre não encerram o seu turno.")

    return (
        <form onSubmit={(event) => event.preventDefault()} className="border-t bg-background/60 px-3 pb-3 pt-2.5" aria-label="Sua vez na mesa">
            {invalidReason && !blocked ? (
                <p className="px-1 pb-2 text-xs text-amber-300" role="alert" data-testid="game-composer-invalid">
                    {invalidReason}
                </p>
            ) : (
                <p className="px-1 pb-2 text-xs text-white/60" role="status" data-testid="game-composer-hint">
                    {hint}
                </p>
            )}
            <div className={cn("rounded-xl border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-primary/60", blocked && "opacity-70")}>
                <Textarea
                    ref={textareaRef}
                    aria-label="O que o seu personagem faz"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={declared ? "Pergunte algo ao mestre…" : "O que o seu personagem faz?"}
                    disabled={blocked}
                    maxLength={MADDOX_GAME_MESSAGE_MAX}
                    rows={1}
                    className="max-h-[180px] min-h-[24px] w-full resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" onClick={() => void send("declaration")} disabled={!canDeclare}>
                        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Declarar
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void send("question")} disabled={!canAsk}>
                        <HelpCircle aria-hidden /> Perguntar ao mestre
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void onSend({ kind: "pass" })} disabled={!canPass}>
                        <MinusCircle aria-hidden /> Não fazer nada
                    </Button>
                    <span className="ml-auto text-[10px] text-muted-foreground/70">
                        {value.length.toLocaleString("pt-BR")}/{MADDOX_GAME_MESSAGE_MAX.toLocaleString("pt-BR")} · Ctrl+Enter declara
                    </span>
                </div>
            </div>
        </form>
    )
}
