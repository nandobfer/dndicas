"use client"

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { Textarea } from "@/components/ui/opex/textarea"
import { cn } from "@/lib/utils"
import { MADDOX_GAME_MESSAGE_MAX } from "../../constants"
import type { MaddoxGameActionInput } from "../../game-schemas"
import { focusComposer } from "../composer-focus"
import { AskMasterButton, DeclareButton, PassTurnButton } from "./composer-buttons"

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
 * Campo da mesa, no desenho do campo da entrevista: "Perguntar ao mestre" (não encerra o turno), "Não fazer nada"
 * (atalho para passar a vez) e "Declarar" (intenção, ação ou diálogo) como botões de ícone à direita do texto.
 * Enter declara (também Ctrl/⌘+Enter); Shift+Enter quebra a linha.
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
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void send("declaration")
        }
    }

    const submit = (event: FormEvent) => {
        event.preventDefault()
        void send("declaration")
    }

    const hint = blockedReason ?? (declared ? "Você já declarou. Aguardando os outros jogadores — ainda dá para perguntar ao mestre." : "Declare o que o seu personagem faz, diz ou pretende. Perguntas ao mestre não encerram o seu turno.")

    return (
        <form onSubmit={submit} className="border-t bg-background/60 px-3 pb-3 pt-2.5" aria-label="Sua vez na mesa">
            <div className={cn("flex items-end gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-primary/60", blocked && "opacity-70")} data-testid="game-composer-box">
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
                    className="mb-1 max-h-[180px] min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                />
                <AskMasterButton onClick={() => void send("question")} disabled={!canAsk} />
                <PassTurnButton onClick={() => void onSend({ kind: "pass" })} disabled={!canPass} />
                <DeclareButton disabled={!canDeclare} busy={busy} />
            </div>
            <div className="mt-1.5 flex items-start gap-3 px-1">
                {invalidReason && !blocked ? (
                    <p className="min-w-0 flex-1 text-xs text-amber-300" role="alert" data-testid="game-composer-invalid">
                        {invalidReason}
                    </p>
                ) : (
                    <p className="min-w-0 flex-1 text-xs text-white/60" role="status" data-testid="game-composer-hint">
                        {hint}
                    </p>
                )}
                <span className="shrink-0 text-[10px] text-muted-foreground/70" data-testid="game-composer-counter">
                    {value.length.toLocaleString("pt-BR")}/{MADDOX_GAME_MESSAGE_MAX.toLocaleString("pt-BR")} · Enter declara · Shift+Enter quebra linha
                </span>
            </div>
        </form>
    )
}
