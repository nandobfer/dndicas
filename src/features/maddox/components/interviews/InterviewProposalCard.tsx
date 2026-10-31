"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { rarityColors } from "@/lib/config/colors"
import type { MaddoxScriptKind } from "../../constants"

/** O Maddox apresentou a síntese: confirmar consolida e grava; responder pede ajustes. */
export function InterviewProposalCard({ kind, pending, disabled, onConfirm }: { kind: MaddoxScriptKind; pending: boolean; disabled: boolean; onConfirm: () => void }) {
    const color = rarityColors.legendary
    return (
        <div role="region" aria-label="Proposta de conclusão" className="mx-3 mb-2 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: `${color}66`, backgroundColor: `${color}14` }}>
            <div className="space-y-1">
                <p className="flex items-center gap-2 text-sm font-semibold" style={{ color }}>
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> {kind === "scenario" ? "O cenário está pronto para ser salvo" : "O personagem está pronto para ser salvo"}
                </p>
                <p className="text-xs text-white/60">Ou responda pedindo ajustes: o Maddox atualiza a síntese.</p>
            </div>
            <Button onClick={onConfirm} disabled={disabled || pending} style={{ backgroundColor: color, color: "#000" }}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} {pending ? "Consolidando…" : "Confirmar e concluir"}
            </Button>
        </div>
    )
}
