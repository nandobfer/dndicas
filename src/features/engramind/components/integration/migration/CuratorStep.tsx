"use client"

import { useForm, useWatch } from "react-hook-form"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { isAiTextProviderId, type AiProviderId } from "@/lib/ai/providers"
import { ProviderModelCard, type ProviderModelFields } from "@/features/ai/components/agents/ProviderModelCard"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { useMigrationCurator } from "../../../hooks/useEngramind"
import { curatorRunSchema } from "../../../schemas/migration"
import type { MemoryMigrationDto } from "../../../types"
import { Section } from "../Section"
import { CuratorReport } from "./CuratorReport"
import { StepStatus } from "./StepStatus"

/**
 * Etapa 2: o curador classifica cada memória (provedor e modelo entre os provedores de texto já
 * configurados, uma chamada por lista, até 8 min).
 */
export function CuratorStep({ state }: { state: MemoryMigrationDto }) {
    const { providers } = useAiProviderStatuses()
    const form = useForm<ProviderModelFields>({ defaultValues: { provider: (state.curator?.provider as AiProviderId | undefined) ?? null, model: state.curator?.model ?? null, agent: null, variant: state.curator?.variant ?? null } })
    const values = useWatch({ control: form.control })
    const run = useMigrationCurator()
    const busy = Object.values(state.steps).some((step) => step.status === "running")
    const input = { provider: values.provider ?? undefined, model: values.model ?? "", variant: values.variant ?? null, agent: values.agent ?? null }
    const valid = curatorRunSchema.safeParse(input).success
    const start = () => {
        const parsed = curatorRunSchema.safeParse(input)
        if (parsed.success) run.mutate(parsed.data)
    }
    const changeProvider = (next: AiProviderId) => {
        if (next === values.provider || !isAiTextProviderId(next)) return
        form.setValue("provider", next)
        form.setValue("model", null)
        form.setValue("variant", null)
        form.setValue("agent", null)
    }
    return (
        <Section title="2. Curador" description="O curador lê cada lista inteira e decide, por memória: migrar, migrar reescrevendo, descartar ou revisar. Ele só propõe: nada é importado sem a sua revisão. Pode sugerir uma categoria nova quando nenhuma serve.">
            {!state.backup ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Gere o backup antes de rodar o curador.</p>
            ) : (
                <>
                    <ProviderModelCard form={form} providers={providers} onProviderChange={changeProvider} />
                    <div className="flex justify-end">
                        <Button type="button" disabled={!valid || busy || run.isPending} onClick={start}>
                            {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />} {state.curator ? "Rodar o curador de novo" : "Rodar o curador"}
                        </Button>
                    </div>
                    <StepStatus step={state.steps.triage} onRetry={start} retrying={run.isPending} />
                    <StepStatus step={state.steps.compact} />
                    {state.report && <CuratorReport report={state.report} />}
                </>
            )}
        </Section>
    )
}
