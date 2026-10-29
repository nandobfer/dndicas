"use client"

import { useEffect } from "react"
import { useForm, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Field } from "@/components/ui/opex/field"
import { FieldTrigger } from "@/components/ui/opex/field-trigger"
import { FORM_GRID_WIDE } from "@/components/ui/opex/form-grid"
import { OptionTabs } from "@/components/ui/opex/option-tabs"
import { SearchPicker } from "@/components/ui/opex/search-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/opex/select"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { isAiImageProviderId, type AiImageProviderId, type AiModelDto } from "@/lib/ai/providers"
import { DEFAULT_IMAGE_GENERATOR_INSTRUCTIONS, IMAGE_ASPECT_RATIOS } from "../../constants"
import { DEFAULT_IMAGE_GENERATOR_SETTINGS, imageGeneratorSettingsSchema, type ImageGeneratorSettings } from "../../schemas"
import { useAiImageModels, useAiProviderStatuses, useImageGeneratorSettings, useSaveImageGeneratorSettings } from "../../hooks/useAi"
import { FeatureFormShell } from "../FeatureFormShell"
import { AgentMemoriesSection } from "../memories/AgentMemoriesSection"
import { InstructionsCard } from "./InstructionsCard"

const ASPECT_LABELS: Record<(typeof IMAGE_ASPECT_RATIOS)[number], string> = {
    "1:1": "Quadrada (1:1)",
    "16:9": "Paisagem (16:9)",
    "9:16": "Retrato alto (9:16)",
    "4:3": "Paisagem (4:3)",
    "3:4": "Retrato (3:4)",
}

/**
 * Aba "Gerador de imagens": provedor e modelo de imagem (Gemini ou OpenAI), instruções da arte,
 * proporção padrão e as memórias do agente. Usado pelo botão "Gerar com IA" das imagens dos
 * formulários/fichas e pela importação do 5etools.
 */
export function ImageGeneratorTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useImageGeneratorSettings()
    const save = useSaveImageGeneratorSettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<ImageGeneratorSettings>({ resolver: zodResolver(imageGeneratorSettingsSchema), mode: "onChange", defaultValues: DEFAULT_IMAGE_GENERATOR_SETTINGS })
    const dirty = form.formState.isDirty
    const enabled = useWatch({ control: form.control, name: "enabled" })
    const provider = useWatch({ control: form.control, name: "provider" })
    const modelId = useWatch({ control: form.control, name: "model" })
    const models = useAiImageModels(provider)

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
    const imageProviders = providers.filter((item) => isAiImageProviderId(item.id))
    const connected = imageProviders.filter((item) => item.connected)
    const model = models.data?.find((item) => item.id === modelId)

    const changeProvider = (next: AiImageProviderId) => {
        if (next === provider) return
        form.setValue("provider", next, { shouldDirty: true, shouldValidate: true })
        form.setValue("model", null, { shouldDirty: true, shouldValidate: true })
    }

    return (
        <>
            <FeatureFormShell
                id="ai-image-generator-enabled"
                label="Gerador de imagens"
                description='Botão "Gerar com IA" das imagens: cria a arte a partir de todo o conteúdo do formulário ou da ficha, e as imagens da importação do 5etools'
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
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Provedor e modelo de imagem</CardTitle>
                        <CardDescription>Só os provedores conectados com modelos de imagem (Gemini e OpenAI) podem ser escolhidos.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <Field id="ai-image-provider" label="Provedor" error={errors.provider?.message}>
                            {connected.length === 0 ? (
                                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum provedor de imagem conectado: configure e teste o Gemini ou a OpenAI na aba Provedores.</p>
                            ) : (
                                <OptionTabs<AiImageProviderId>
                                    id="ai-image-provider"
                                    options={imageProviders.map((item) => ({
                                        value: item.id as AiImageProviderId,
                                        label: item.name,
                                        disabled: !item.connected,
                                        title: item.connected ? item.name : `${item.name}: não conectado`,
                                    }))}
                                    value={provider ?? ("" as AiImageProviderId)}
                                    onChange={changeProvider}
                                    className="w-full flex-wrap"
                                />
                            )}
                        </Field>
                        <div className={FORM_GRID_WIDE}>
                            <Field id="ai-image-model" label="Modelo" error={errors.model?.message ?? (models.isError ? apiErrorMessage(models.error, "Não foi possível listar os modelos") : undefined)}>
                                <SearchPicker<AiModelDto>
                                    trigger={<FieldTrigger id="ai-image-model" placeholder={provider ? "Escolha o modelo" : "Escolha o provedor primeiro"} invalid={Boolean(errors.model)} value={model ? model.name : modelId || undefined} disabled={!provider} />}
                                    items={models.data ?? []}
                                    getKey={(item) => item.id}
                                    searchKeys={["name", "id"]}
                                    renderItem={(item) => (
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{item.name}</span>
                                            <span className="block truncate font-mono text-[11px] text-muted-foreground">{item.id}</span>
                                        </span>
                                    )}
                                    onPick={(item) => form.setValue("model", item.id, { shouldDirty: true, shouldValidate: true })}
                                    loading={models.isLoading}
                                    disabled={!provider}
                                    matchTriggerWidth
                                    placeholder="Buscar modelo"
                                    searchLabel="Buscar modelo"
                                    listLabel="Modelos de imagem"
                                    emptyText={models.isError ? "Não foi possível listar os modelos" : "Nenhum modelo de imagem disponível"}
                                    emptySearchText="Nenhum modelo encontrado"
                                />
                            </Field>
                            <Field id="ai-image-aspect" label="Proporção padrão" error={errors.defaultAspectRatio?.message}>
                                <Controller
                                    control={form.control}
                                    name="defaultAspectRatio"
                                    render={({ field }) => (
                                        <Select value={field.value} onValueChange={field.onChange}>
                                            <SelectTrigger id="ai-image-aspect" className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {IMAGE_ASPECT_RATIOS.map((ratio) => (
                                                    <SelectItem key={ratio} value={ratio}>
                                                        {ASPECT_LABELS[ratio]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                />
                            </Field>
                        </div>
                    </CardContent>
                </Card>

                <InstructionsCard
                    form={form}
                    id="ai-image-instructions"
                    label="Instruções do diretor de arte"
                    description="O DnDicas acrescenta a proporção, a entidade e o JSON do formulário depois das instruções e das memórias."
                    defaultInstructions={DEFAULT_IMAGE_GENERATOR_INSTRUCTIONS}
                />
            </FeatureFormShell>
            <AgentMemoriesSection tab="gerador-imagens" />
        </>
    )
}
