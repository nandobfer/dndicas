"use client"

import { AlertTriangle } from "lucide-react"
import { maddoxOpexNpcFailureLine } from "../../constants"
import type { MaddoxGameMessageDto } from "../../game-types"

/**
 * Aviso abaixo da narração (DND-27): o agente de um NPC Opex não respondeu e o Maddox decidiu por ele. Só o dono recebe
 * `opexNpcFailures` (o servidor nem serializa o campo para os demais), com o motivo; fica no histórico.
 */
export function OpexNpcFailureLine({ failures }: { failures: NonNullable<MaddoxGameMessageDto["opexNpcFailures"]> }) {
    if (!failures.length) return null
    return (
        <div className="flex flex-col items-center gap-1.5 pb-3" data-testid="opex-npc-failures">
            {failures.map((failure, index) => (
                <div key={`${failure.npcName}-${index}`} className="flex max-w-[90%] flex-col items-center gap-0.5 text-center" role="note" data-testid="opex-npc-failure">
                    <p className="flex items-start gap-1.5 text-xs text-amber-200/90">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
                        <span>{maddoxOpexNpcFailureLine(failure.npcName)}</span>
                    </p>
                    {failure.reason && (
                        <p className="break-words text-[11px] text-white/45" data-testid="opex-npc-failure-reason">
                            Motivo: {failure.reason}
                        </p>
                    )}
                </div>
            ))}
        </div>
    )
}
