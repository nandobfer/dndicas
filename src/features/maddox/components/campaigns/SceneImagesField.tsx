"use client"

import type { UseFormReturn } from "react-hook-form"
import { ImageIcon } from "lucide-react"
import { GlassSelector } from "@/components/ui/glass-selector"
import type { CreateMaddoxCampaignInput } from "../../campaign-schemas"

type SceneImagesChoice = "on" | "off"

/**
 * Imagens nas cenas (Maddox 10): o dono liga ou desliga as imagens automáticas da campanha (situações e frequência vêm
 * da configuração do Maddox). Desligadas, o "Gerar imagem da cena" da mesa continua valendo.
 */
export function SceneImagesField({ form }: { form: UseFormReturn<CreateMaddoxCampaignInput> }) {
    const enabled = form.watch("sceneImages") ?? true
    return (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="scene-images-field">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
                <ImageIcon className="h-4 w-4 text-primary" aria-hidden /> Imagens nas cenas
            </p>
            <p className="text-xs text-white/60">
                {enabled
                    ? "O Maddox ilustra os momentos marcantes (novos locais, fim de batalha, clímax…) conforme a configuração do agente."
                    : "Sem imagens automáticas: só quando você pedir \"Gerar imagem da cena\" na mesa."}
            </p>
            <GlassSelector<SceneImagesChoice>
                value={enabled ? "on" : "off"}
                onChange={(value) => form.setValue("sceneImages", value === "on", { shouldDirty: true })}
                options={[
                    { value: "on", label: "Ligadas" },
                    { value: "off", label: "Desligadas" },
                ]}
                size="sm"
                layoutId="maddox-scene-images"
            />
        </div>
    )
}
