"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Switch } from "@/components/ui/opex/switch"
import { ToggleRow } from "@/components/ui/opex/toggle-card"
import type { AiProviderStatusDto } from "@/lib/ai/providers"
import { MADDOX_JEV_DECISION_DEFS, MADDOX_JEV_DECISIONS } from "../../constants"
import type { MaddoxSettings } from "../../schemas"

/** Chaves do JEV (System One) por tipo de decisão. Por enquanto só configuráveis: entram nas próximas entregas. */
export function MaddoxJevCard({ form, jev }: { form: UseFormReturn<MaddoxSettings>; jev: AiProviderStatusDto | undefined }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Decisões com o JEV</CardTitle>
                <CardDescription>Classificações e decisões que o Maddox poderá delegar ao JEV para ganhar precisão e reduzir custo. Ainda sem uso: as chaves passam a valer nas próximas entregas das Campanhas Maddox.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {!jev?.connected && (
                    <p className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> O JEV não está conectado: configure e teste em Provedores › JEV. As chaves podem ser salvas mesmo assim.
                    </p>
                )}
                {MADDOX_JEV_DECISIONS.map((decision) => (
                    <ToggleRow
                        key={decision}
                        id={`maddox-jev-${decision}`}
                        label={MADDOX_JEV_DECISION_DEFS[decision].label}
                        description={MADDOX_JEV_DECISION_DEFS[decision].description}
                        right={
                            <Controller
                                control={form.control}
                                name={`jev.${decision}`}
                                render={({ field }) => <Switch id={`maddox-jev-${decision}`} checked={field.value} onCheckedChange={field.onChange} aria-label={MADDOX_JEV_DECISION_DEFS[decision].label} />}
                            />
                        }
                    />
                ))}
            </CardContent>
        </Card>
    )
}
