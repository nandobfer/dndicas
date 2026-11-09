"use client"

import type { UseFormReturn } from "react-hook-form"
import { EyeOff } from "lucide-react"
import { GlassSelector } from "@/components/ui/glass-selector"
import type { CreateMaddoxCampaignInput } from "../../campaign-schemas"

type PlayerActionsChoice = "visible" | "hidden"

/**
 * Declarações dos outros jogadores no chat (DND-36): visíveis (padrão) ou ocultas, quando viram a linha "Fulano declarou
 * sua ação". Cada jogador sempre vê a própria; o Maddox recebe tudo e o combate em turnos não muda.
 */
export function PlayerActionsField({ form }: { form: UseFormReturn<CreateMaddoxCampaignInput> }) {
    const hidden = form.watch("hidePlayerActions") ?? false
    return (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="player-actions-field">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
                <EyeOff className="h-4 w-4 text-primary" aria-hidden /> Ações dos outros jogadores
            </p>
            <p className="text-xs text-white/60">
                {hidden
                    ? "Os outros jogadores veem só \"Fulano declarou sua ação\"; cada um continua vendo o próprio texto. O Maddox recebe tudo, e o combate em turnos não muda."
                    : "Todos veem o texto das declarações no chat."}
            </p>
            <GlassSelector<PlayerActionsChoice>
                value={hidden ? "hidden" : "visible"}
                onChange={(value) => form.setValue("hidePlayerActions", value === "hidden", { shouldDirty: true })}
                options={[
                    { value: "visible", label: "Visíveis" },
                    { value: "hidden", label: "Ocultas" },
                ]}
                size="sm"
                layoutId="maddox-player-actions"
            />
        </div>
    )
}
