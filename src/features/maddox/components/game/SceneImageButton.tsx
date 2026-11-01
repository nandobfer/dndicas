"use client"

import { Loader2, Paintbrush } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import type { MaddoxSceneImageControlDto } from "../../game-types"

/**
 * "Gerar imagem da cena" (só o dono, Maddox 10): o Maddox descreve a cena atual e pinta em segundo plano. Fica
 * desabilitado com o motivo (teto do dia, uma já sendo pintada, Gerador indisponível) no `title` e no texto de apoio.
 */
export function SceneImageButton({ control, busy, onRequest }: { control: MaddoxSceneImageControlDto | undefined; busy: boolean; onRequest: () => void }) {
    if (!control?.owner) return null
    const pending = busy || control.generating
    const reason = busy ? null : control.reason
    return (
        <Button
            size="sm"
            variant="outline"
            disabled={!control.canRequest || busy}
            onClick={onRequest}
            title={reason ?? `Gerar imagem da cena atual (${control.remainingToday} restante(s) hoje)`}
            aria-description={reason ?? undefined}
            data-testid="scene-image-button"
        >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Paintbrush aria-hidden />} {pending ? "Pintando a cena…" : "Gerar imagem da cena"}
        </Button>
    )
}
