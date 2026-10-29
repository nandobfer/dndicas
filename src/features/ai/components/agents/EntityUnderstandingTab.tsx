"use client"

import { useEffect } from "react"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { OpexModelCard } from "@/features/opex-agent/components/settings/OpexModelCard"
import type { OpexAgentSettings } from "@/features/opex-agent/schemas"
import { DEFAULT_ENTITY_UNDERSTANDING_INSTRUCTIONS, ENTITY_UNDERSTANDING_TOOL_ROUNDS_MAX, ENTITY_UNDERSTANDING_TOOL_ROUNDS_MIN } from "../../constants"
import { DEFAULT_ENTITY_UNDERSTANDING_SETTINGS, entityUnderstandingSettingsSchema, type EntityUnderstandingSettings } from "../../schemas"
import { useAiProviderStatuses, useEntityUnderstandingSettings, useSaveEntityUnderstandingSettings } from "../../hooks/useAi"
import { FeatureFormShell } from "../FeatureFormShell"
import { AgentMemoriesSection } from "../memories/AgentMemoriesSection"
import { InstructionsCard } from "./InstructionsCard"

/**
 * Aba "Entender com IA": provedor e modelo (os que executam ferramentas, como o Agente Opex),
 * instruções, limite de rodadas de ferramenta e as memórias do agente.
 */
export function EntityUnderstandingTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useEntityUnderstandingSettings()
    const save = useSaveEntityUnderstandingSettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<EntityUnderstandingSettings>({ resolver: zodResolver(entityUnderstandingSettingsSchema), mode: "onChange", defaultValues: DEFAULT_ENTITY_UNDERSTANDING_SETTINGS })
    const dirty = form.formState.isDirty
    const enabled = useWatch({ control: form.control, name: "enabled" })

    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
    const data = query.data
    const errors = form.formState.errors

    return (
        <>
            <FeatureFormShell
                id="ai-entity-understanding-enabled"
                label="Entender com IA"
                description='Chat "Entender com IA" das magias, classes, itens e demais entidades: explica a entidade e consulta o catálogo com ferramentas, citando entidades como badges'
                enabled={enabled}
                onEnabledChange={(value) => form.setValue("enabled", value, { shouldDirty: true, shouldValidate: true })}
                availability={data.availability}
                dirty={dirty}
                isDefault={data.isDefault}
                pending={save.isPending}
                readOnly={false}
                onUndo={() => form.reset(data.settings)}
                onSave={() =>
                    void form.handleSubmit(async (values) => {
                        const saved = await save.mutateAsync(values).catch(() => null)
                        if (saved) form.reset(saved.settings)
                    })()
                }
            >
                {/* Mesmo cartão de provedor/modelo do Agente Opex (o formulário tem o mesmo `main`). */}
                <OpexModelCard
                    form={form as unknown as UseFormReturn<OpexAgentSettings>}
                    target="main"
                    providers={providers}
                    title="Provedor e modelo"
                    description="Provedores que executam as ferramentas de busca no catálogo (Gemini, Anthropic, OpenAI e DeepSeek)."
                />
                <InstructionsCard
                    form={form}
                    id="ai-entity-understanding-instructions"
                    label="Instruções do assistente"
                    description="O formato HTML da resposta e das menções (badges de entidades) é acrescentado pelo DnDicas."
                    defaultInstructions={DEFAULT_ENTITY_UNDERSTANDING_INSTRUCTIONS}
                >
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="ai-entity-understanding-rounds">Rodadas de ferramentas por resposta</Label>
                        <Input
                            id="ai-entity-understanding-rounds"
                            type="number"
                            min={ENTITY_UNDERSTANDING_TOOL_ROUNDS_MIN}
                            max={ENTITY_UNDERSTANDING_TOOL_ROUNDS_MAX}
                            {...form.register("maxToolRounds", { valueAsNumber: true })}
                        />
                        {errors.maxToolRounds?.message && <p className="text-xs text-destructive">{errors.maxToolRounds.message}</p>}
                    </div>
                </InstructionsCard>
            </FeatureFormShell>
            <AgentMemoriesSection tab="entender-com-ia" />
        </>
    )
}
