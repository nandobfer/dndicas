"use client"

import { motion, useReducedMotion } from "framer-motion"
import { ArrowUp, HelpCircle, Loader2, MinusCircle } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { cn } from "@/core/utils"

/** Botões de ícone do campo da mesa (`GameComposer`), também mostrados no tutorial da página da campanha. */
const ICON_BUTTON = "h-8 w-8 shrink-0 rounded-full"

/**
 * Botão premium de IA (DND-52): o mesmo anel gradiente azul/roxo animado do "Entender com IA" (`EntityAIUnderstandButton`),
 * no diâmetro dos outros botões do campo. Desabilitado, fica apagado e parado; com `prefers-reduced-motion`, o anel não anima.
 */
export function AskMasterButton({ disabled = false, onClick }: { disabled?: boolean; onClick?: () => void }) {
    const reducedMotion = useReducedMotion()
    const animated = !disabled && !reducedMotion
    return (
        <motion.button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label="Perguntar ao mestre"
            title="Perguntar ao mestre"
            whileHover={animated ? { scale: 1.08 } : undefined}
            whileTap={animated ? { scale: 0.94 } : undefined}
            className={cn(
                ICON_BUTTON,
                "group relative p-[1.5px] shadow-lg shadow-blue-500/10",
                "bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 bg-[length:200%_auto] animate-gradient motion-reduce:animate-none",
                "focus:outline-none focus:ring-2 focus:ring-blue-500/40",
                "disabled:pointer-events-none disabled:animate-none disabled:opacity-50",
            )}
        >
            <span className="grid h-full w-full place-items-center rounded-full bg-black/40 backdrop-blur-[4px] transition-colors group-hover:bg-slate-900/40">
                <HelpCircle className="h-4 w-4 text-blue-400 transition-colors group-hover:text-white" aria-hidden />
            </span>
        </motion.button>
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
