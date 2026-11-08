"use client"

import { ArrowUp, HelpCircle, Loader2, MinusCircle } from "lucide-react"
import { Button } from "@/components/ui/opex/button"

/** Botões de ícone do campo da mesa (`GameComposer`), também mostrados no tutorial da página da campanha. */
const ICON_BUTTON = "h-8 w-8 shrink-0 rounded-full"

export function AskMasterButton({ disabled = false, onClick }: { disabled?: boolean; onClick?: () => void }) {
    return (
        <Button type="button" size="icon" variant="ghost" className={ICON_BUTTON} onClick={onClick} disabled={disabled} aria-label="Perguntar ao mestre" title="Perguntar ao mestre">
            <HelpCircle className="h-4 w-4" aria-hidden />
        </Button>
    )
}

export function PassTurnButton({ disabled = false, onClick }: { disabled?: boolean; onClick?: () => void }) {
    return (
        <Button type="button" size="icon" variant="ghost" className={ICON_BUTTON} onClick={onClick} disabled={disabled} aria-label="Não fazer nada" title="Não fazer nada">
            <MinusCircle className="h-4 w-4" aria-hidden />
        </Button>
    )
}

/** `type` = `submit` no campo da mesa; `button` na demonstração (fora de formulário). */
export function DeclareButton({ disabled = false, busy = false, type = "submit" }: { disabled?: boolean; busy?: boolean; type?: "submit" | "button" }) {
    return (
        <Button type={type} size="icon" className={ICON_BUTTON} disabled={disabled} aria-label="Declarar" title="Declarar (Enter)">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
        </Button>
    )
}
