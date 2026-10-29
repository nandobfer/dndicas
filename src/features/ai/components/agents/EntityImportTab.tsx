"use client"

import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { getAiProvider, isAiTextProviderId, type AiProviderId } from "@/lib/ai/providers"
import { DEFAULT_ENTITY_IMPORT_INSTRUCTIONS } from "../../constants"
import { DEFAULT_ENTITY_IMPORT_SETTINGS, entityImportSettingsSchema, type EntityImportSettings } from "../../schemas"
import { useAiProviderStatuses, useEntityImportSettings, useSaveEntityImportSettings } from "../../hooks/useAi"
import { FeatureFormShell } from "../FeatureFormShell"
import { AgentMemoriesSection } from "../memories/AgentMemoriesSection"
import { ProviderModelCard } from "./ProviderModelCard"
import { InstructionsCard } from "./InstructionsCard"

/**
 * Aba "Importador 5etools": provedor e modelo de texto que traduzem as entidades importadas (tela de
 * geração por IA e scripts de seed), instruções de tradução e as memórias do agente (ex.: glossário).
 */
export function EntityImportTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useEntityImportSettings()
    const save = useSaveEntityImportSettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<EntityImportSettings>({ resolver: zodResolver(entityImportSettingsSchema), mode: "onChange", defaultValues: DEFAULT_ENTITY_IMPORT_SETTINGS })
    const dirty = form.formState.isDirty
    const enabled = useWatch({ control: form.control, name: "enabled" })
    const provider = useWatch({ control: form.control, name: "provider" })

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
    const sampling = provider ? getAiProvider(provider).supportsSampling : false

    const changeProvider = (next: AiProviderId) => {
        if (next === provider || !isAiTextProviderId(next)) return
        form.setValue("provider", next, { shouldDirty: true, shouldValidate: true })
        form.setValue("model", null, { shouldDirty: true, shouldValidate: true })
        form.setValue("variant", null, { shouldDirty: true })
        form.setValue("agent", null, { shouldDirty: true })
    }

    return (
        <>
            <FeatureFormShell
                id="ai-entity-import-enabled"
                label="Importador 5etools"
                description="Traduz magias, raças, talentos e monstros importados do 5etools (Gerar com IA da administração e scripts de seed)"
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
                <ProviderModelCard form={form} providers={providers} onProviderChange={changeProvider} />
                <InstructionsCard
                    form={form}
                    id="ai-entity-import-instructions"
                    label="Instruções do tradutor"
                    description="O formato JSON pedido em cada tradução é acrescentado pelo importador."
                    defaultInstructions={DEFAULT_ENTITY_IMPORT_INSTRUCTIONS}
                >
                    {sampling && (
                        <>
                            <div className="space-y-1.5">
                                <Label htmlFor="ai-entity-import-temperature">Temperatura</Label>
                                <Input
                                    id="ai-entity-import-temperature"
                                    type="number"
                                    step="0.1"
                                    placeholder="Padrão do modelo"
                                    {...form.register("temperature", { setValueAs: (value) => (value === "" || value === null ? null : Number(value)) })}
                                />
                                {errors.temperature?.message && <p className="text-xs text-destructive">{errors.temperature.message}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="ai-entity-import-max-tokens">Máximo de tokens</Label>
                                <Input
                                    id="ai-entity-import-max-tokens"
                                    type="number"
                                    placeholder="Padrão do modelo"
                                    {...form.register("maxOutputTokens", { setValueAs: (value) => (value === "" || value === null ? null : Number(value)) })}
                                />
                                {errors.maxOutputTokens?.message && <p className="text-xs text-destructive">{errors.maxOutputTokens.message}</p>}
                            </div>
                        </>
                    )}
                </InstructionsCard>
            </FeatureFormShell>
            <AgentMemoriesSection tab="importador-5etools" />
        </>
    )
}
