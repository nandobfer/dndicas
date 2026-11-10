"use client"

import { useState } from "react"
import { History, Loader2, RotateCcw, Undo2 } from "lucide-react"
import { GlassPopover, GlassPopoverContent, GlassPopoverTrigger } from "@/components/ui/glass-popover"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import type { MaddoxGameStateDto } from "../../game-types"
import { gotoDialogText, resumeDialogText } from "../../rewind-plan"
import { useMaddoxRewindTurns, useResumeMaddoxTurn, useRewindMaddoxTurn } from "../../hooks/useMaddoxGame"

type Confirming = { kind: "goto"; target: number } | { kind: "resume" } | null

/**
 * Botão "Turnos" da mesa (DND-44), só do dono: "Desfazer turno", "Voltar ao turno…" (do mais recente para o mais antigo,
 * com o começo da narração do Maddox) e, com uma volta pendente, "Voltar ao turno atual (N)". Cada ação pede confirmação.
 */
export function TurnsMenu({ campaignId, control, turn }: { campaignId: string; control: NonNullable<MaddoxGameStateDto["me"]["rewind"]>; turn: Pick<MaddoxGameStateDto["turn"], "number" | "rewind"> }) {
    const [open, setOpen] = useState(false)
    const [confirming, setConfirming] = useState<Confirming>(null)
    const turns = useMaddoxRewindTurns(campaignId, open)
    const gotoTurn = useRewindMaddoxTurn(campaignId)
    const resume = useResumeMaddoxTurn(campaignId)
    const rewind = turn.rewind ?? null
    const origin = rewind?.originTurn ?? turn.number
    const hasNewActions = rewind?.hasNewActions ?? false
    const blocked = control.blockReason
    const pending = gotoTurn.isPending || resume.isPending
    const choose = (next: Confirming) => {
        setOpen(false)
        setConfirming(next)
    }
    const dialog = confirming?.kind === "goto" ? gotoDialogText(confirming.target, origin, hasNewActions) : confirming?.kind === "resume" ? resumeDialogText(origin, hasNewActions) : null
    const list = turns.data?.turns ?? []

    return (
        <>
            <GlassPopover open={open} onOpenChange={setOpen}>
                <GlassPopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" data-testid="turns-button" title={blocked ?? "Desfazer turno ou voltar a um turno já jogado"}>
                        <History aria-hidden /> Turnos
                    </Button>
                </GlassPopoverTrigger>
                <GlassPopoverContent align="start" className="w-80 space-y-2" data-testid="turns-menu">
                    {blocked && (
                        <p className="text-xs text-amber-200/90" role="note" data-testid="turns-block-reason">
                            {blocked}
                        </p>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start"
                        disabled={Boolean(blocked) || control.undoTarget === null}
                        title={blocked ?? (control.undoTarget === null ? (control.emptyReason ?? undefined) : `Voltar ao turno ${control.undoTarget}`)}
                        onClick={() => control.undoTarget !== null && choose({ kind: "goto", target: control.undoTarget })}
                        data-testid="turns-undo"
                    >
                        <Undo2 aria-hidden /> Desfazer turno
                    </Button>
                    <div className="space-y-1">
                        <p className="px-2 text-xs font-semibold text-white/70">Voltar ao turno…</p>
                        {turns.isLoading ? (
                            <p className="flex items-center gap-2 px-2 text-xs text-white/60">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Carregando os turnos…
                            </p>
                        ) : list.length === 0 ? (
                            <p className="px-2 text-xs text-white/60" data-testid="turns-empty">
                                {control.emptyReason ?? "Não há turno anterior para onde voltar."}
                            </p>
                        ) : (
                            <ul className="max-h-64 space-y-1 overflow-y-auto" data-testid="turns-list">
                                {list.map((item) => (
                                    <li key={item.turnNumber}>
                                        <button
                                            type="button"
                                            className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                            disabled={Boolean(blocked)}
                                            title={blocked ?? undefined}
                                            onClick={() => choose({ kind: "goto", target: item.turnNumber })}
                                            data-testid={`turns-item-${item.turnNumber}`}
                                        >
                                            <span className="block text-sm font-medium text-white">Turno {item.turnNumber}</span>
                                            {item.excerpt && <span className="block truncate text-xs text-white/60">{item.excerpt}</span>}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {rewind && (
                        <Button size="sm" variant="outline" className="w-full justify-start" disabled={Boolean(blocked)} title={blocked ?? undefined} onClick={() => choose({ kind: "resume" })} data-testid="turns-resume">
                            <RotateCcw aria-hidden /> Voltar ao turno atual ({rewind.originTurn})
                        </Button>
                    )}
                </GlassPopoverContent>
            </GlassPopover>
            <ConfirmDialog
                open={confirming !== null}
                onOpenChange={(value) => !value && setConfirming(null)}
                title={dialog?.title ?? ""}
                description={dialog?.description}
                confirmLabel={dialog?.confirmLabel ?? ""}
                cancelLabel="Cancelar"
                pending={pending}
                onConfirm={() => {
                    if (confirming?.kind === "goto") gotoTurn.mutate(confirming.target)
                    if (confirming?.kind === "resume") resume.mutate(origin)
                    setConfirming(null)
                }}
            />
        </>
    )
}
