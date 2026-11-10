"use client"

import { useState } from "react"
import { Bot, BotOff } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { ConfirmDialog } from "@/components/ui/opex/confirm-dialog"
import { useMaddoxOpexNpcActions } from "../../hooks/useMaddoxOpexNpcs"

export interface OpexNpcActionTarget {
    id: string
    name: string
    status: "active" | "inactive" | "dead" | "unknown"
    opex?: boolean
}

/**
 * "Promover a NPC Opex" / "Remover Opex" de um NPC conhecido (DND-27), com a confirmação. Só aparece para o dono com a
 * permissão (quem desenha decide); NPC morto não pode ser promovido. `icon` no painel da mesa, `button` no Diário.
 */
export function OpexNpcActions({ campaignId, npc, variant = "icon" }: { campaignId: string; npc: OpexNpcActionTarget; variant?: "icon" | "button" }) {
    const { promote, remove } = useMaddoxOpexNpcActions(campaignId)
    const [confirming, setConfirming] = useState(false)
    const isOpex = Boolean(npc.opex)
    if (!isOpex && npc.status === "dead") return null
    const label = isOpex ? "Remover Opex" : "Promover a NPC Opex"
    const Icon = isOpex ? BotOff : Bot
    const mutation = isOpex ? remove : promote
    return (
        <>
            {variant === "icon" ? (
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={mutation.isPending} onClick={() => setConfirming(true)} aria-label={`${label}: ${npc.name}`} title={label}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                </Button>
            ) : (
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" disabled={mutation.isPending} onClick={() => setConfirming(true)} aria-label={`${label}: ${npc.name}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
                </Button>
            )}
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={isOpex ? `Remover Opex de ${npc.name}?` : `Promover ${npc.name} a NPC Opex?`}
                description={isOpex ? "O agente deste NPC será desligado e as memórias dele, arquivadas. O Maddox volta a narrá-lo sozinho." : "Ele ganha um agente próprio que decide o que fala e faz em cena."}
                confirmLabel={isOpex ? "Remover Opex" : "Promover"}
                cancelLabel="Cancelar"
                variant={isOpex ? "destructive" : "default"}
                pending={mutation.isPending}
                onConfirm={() => mutation.mutate(npc.id, { onSettled: () => setConfirming(false) })}
            />
        </>
    )
}
