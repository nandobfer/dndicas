"use client"

import type { UseFormReturn } from "react-hook-form"
import { Dices } from "lucide-react"
import { GlassSelector } from "@/components/ui/glass-selector"
import { MADDOX_CHECK_RIGORS } from "../../constants"
import type { CreateMaddoxCampaignInput } from "../../campaign-schemas"

type DcVisibility = "hidden" | "visible"

/** CD dos testes pedidos pelo Maddox (Maddox 5): secreta ou visível. Só nos graus que usam testes. */
export function CheckDcField({ form }: { form: UseFormReturn<CreateMaddoxCampaignInput> }) {
    const rigor = form.watch("rigor")
    const show = form.watch("showCheckDc") ?? false
    if (!MADDOX_CHECK_RIGORS.includes(rigor)) return null
    return (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="check-dc-field">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
                <Dices className="h-4 w-4 text-primary" aria-hidden /> CD dos testes
            </p>
            <p className="text-xs text-white/60">
                {show ? "Os jogadores veem a classe de dificuldade de cada teste e, depois da rolagem, se passaram." : "Como num mestre de mesa: o Maddox define a CD em segredo e narra a consequência."}
            </p>
            <GlassSelector<DcVisibility>
                value={show ? "visible" : "hidden"}
                onChange={(value) => form.setValue("showCheckDc", value === "visible", { shouldDirty: true })}
                options={[
                    { value: "hidden", label: "Secreta" },
                    { value: "visible", label: "Visível" },
                ]}
                size="sm"
                layoutId="maddox-check-dc"
            />
        </div>
    )
}
