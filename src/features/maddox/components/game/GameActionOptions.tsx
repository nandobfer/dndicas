"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Check, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import type { MaddoxActionOptionsView } from "../../game-view"

interface Props {
    view: MaddoxActionOptionsView
    color: string
    /** Uma ação da mesa está sendo enviada (as sugestões travam para não declarar duas vezes). */
    busy: boolean
    /** Declara a sugestão; `false` = não foi aceita (as sugestões continuam clicáveis). */
    onPick: (option: string) => Promise<boolean> | void
}

/**
 * Sugestões de ação do Maddox abaixo da narração (DND-30): atalhos que declaram o texto da opção, como se o jogador tivesse
 * digitado e enviado no campo. Depois da declaração ficam desabilitadas, com a escolhida marcada.
 */
export function GameActionOptions({ view, color, busy, onPick }: Props) {
    const [sending, setSending] = useState<string | null>(null)
    const locked = view.disabled || busy || sending !== null

    const pick = async (option: string) => {
        if (locked) return
        setSending(option)
        try {
            await onPick(option)
        } finally {
            setSending(null)
        }
    }

    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="-mt-2 pb-4 pl-[2.375rem]" data-testid="action-options" data-disabled={view.disabled ? "true" : undefined}>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-white/60">
                <Sparkles className="h-3.5 w-3.5" style={{ color }} aria-hidden /> Sugestões do Maddox
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sugestões de ação do Maddox">
                {view.options.map((option) => {
                    const chosen = option === view.chosen
                    return (
                        <Button
                            key={option}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-auto min-h-8 max-w-full whitespace-normal rounded-full px-3 py-1.5 text-left text-xs font-normal leading-snug"
                            style={chosen ? { borderColor: color, backgroundColor: `${color}26` } : undefined}
                            disabled={locked}
                            aria-label={`Declarar: ${option}`}
                            aria-pressed={chosen || undefined}
                            data-chosen={chosen ? "true" : undefined}
                            onClick={() => void pick(option)}
                        >
                            {sending === option ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : chosen ? <Check className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden /> : null}
                            <span className="break-words">{option}</span>
                        </Button>
                    )
                })}
            </div>
        </motion.div>
    )
}
