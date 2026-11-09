"use client"

import { useState } from "react"
import { AlertTriangle, Loader2, RefreshCw, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import type { MaddoxGameStateDto } from "../../game-types"

type Actor = NonNullable<MaddoxGameStateDto["turn"]["opexActor"]>

/**
 * O Personagem Opex não conseguiu agir (DND-26): a mesa fica parada até o dono escolher "Tentar de novo" ou "Pular"
 * ("não fez nada" fora do combate; encerra a vez no combate).
 */
export function OpexFailureBanner({ actor, retrying, skipping, onRetry, onSkip }: { actor: Actor; retrying: boolean; skipping: boolean; onRetry: () => void; onSkip: () => void }) {
    const [confirming, setConfirming] = useState(false)
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert" data-testid="opex-failure">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
                {actor.characterName} não conseguiu agir{actor.error ? `: ${actor.error}` : "."}
            </span>
            <Button size="sm" variant="outline" className="h-7" onClick={onRetry} disabled={retrying || skipping}>
                {retrying ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Tentar de novo
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirming(true)} disabled={retrying || skipping}>
                <SkipForward aria-hidden /> Pular
            </Button>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={`Pular a vez de ${actor.characterName}?`}
                description={actor.combat ? "A vez dele no combate é encerrada sem mais ações." : 'O Personagem Opex fica com "não fez nada" neste turno.'}
                confirmLabel="Pular"
                pending={skipping}
                onConfirm={() => {
                    onSkip()
                    setConfirming(false)
                }}
            />
        </div>
    )
}
