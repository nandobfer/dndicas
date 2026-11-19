"use client"

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { Textarea } from "@/components/ui/opex/textarea"
import { cn } from "@/lib/utils"
import { MADDOX_GAME_MESSAGE_MAX, MADDOX_TALK_TITLE } from "../../constants"
import type { MaddoxGameActionInput } from "../../game-schemas"
import { focusComposer } from "../composer-focus"
import { DeclareButton, PassTurnButton } from "./composer-buttons"

const MAX_HEIGHT = 180

interface Props {
    /** Motivo de o campo estar bloqueado (`null` = posso agir). */
    blockedReason: string | null
    /** Já declarei neste turno: o campo espera o próximo turno (falar com o mestre é o "Conversar com o Mestre"). */
    declared: boolean
    busy: boolean
    onSend: (input: MaddoxGameActionInput) => Promise<boolean>
    /** Motivo de a última declaração ter sido recusada pelo Maddox (rigores Rigoroso e Fiel ao D&D). */
    invalidReason?: string | null
    /** Muda quando uma fala do Maddox termina: o campo volta a ter foco. */
    focusKey?: string
}

/**
 * Campo da mesa, no desenho do campo da entrevista: só a declaração do personagem (DND-74: falar com o mestre é o
 * "Conversar com o Mestre", no canto do chat). "Não fazer nada" (atalho para passar a vez) e "Declarar" (intenção, ação ou
 * diálogo) são botões de ícone à direita do texto. Enter declara (também Ctrl/⌘+Enter); Shift+Enter quebra a linha.
 */
export function GameComposer({ blockedReason, declared, busy, onSend, invalidReason = null, focusKey = "" }: Props) {
    const [value, setValue] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const content = value.trim()
    const blocked = blockedReason !== null || declared
    const hasText = content.length > 0 && content.length <= MADDOX_GAME_MESSAGE_MAX
    const canDeclare = !blocked && !busy && hasText
    const canPass = !blocked && !busy

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

    const declare = async () => {
        if (!canDeclare) return
        const draft = value
        setValue("")
        const sent = await onSend({ kind: "declaration", content })
        if (!sent) setValue(draft)
    }

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void declare()
        }
    }

    const submit = (event: FormEvent) => {
        event.preventDefault()
        void declare()
    }

    const hint = blockedReason ?? (declared ? `Você já declarou. Aguardando os outros jogadores — para falar com o mestre, use “${MADDOX_TALK_TITLE}”.` : `Declare o que o seu personagem faz, diz ou pretende. Para falar com o mestre fora da mesa, use “${MADDOX_TALK_TITLE}”.`)

    return (
        <form onSubmit={submit} className="border-t bg-background/60 px-3 pb-3 pt-2.5" aria-label="Sua vez na mesa">
            <div className={cn("flex items-end gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-primary/60", blocked && "opacity-70")} data-testid="game-composer-box">
                <Textarea
                    ref={textareaRef}
                    aria-label="O que o seu personagem faz"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={declared ? "Você já declarou neste turno" : "O que o seu personagem faz?"}
                    disabled={blocked}
                    maxLength={MADDOX_GAME_MESSAGE_MAX}
                    rows={1}
                    className="mb-1 max-h-[180px] min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                />
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
