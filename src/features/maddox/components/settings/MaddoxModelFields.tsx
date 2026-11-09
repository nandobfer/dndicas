"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, get, useWatch, type FieldPath, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/opex/field"
import { FieldTrigger } from "@/components/ui/opex/field-trigger"
import { FORM_GRID_WIDE } from "@/components/ui/opex/form-grid"
import { Input } from "@/components/ui/opex/input"
import { OptionTabs } from "@/components/ui/opex/option-tabs"
import { SearchPicker } from "@/components/ui/opex/search-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/opex/select"
import { apiErrorMessage } from "@/lib/api"
import { AI_TEXT_PROVIDER_IDS, getAiProvider, type AiModelDto, type AiProviderStatusDto, type AiTextProviderId } from "@/lib/ai/providers"
import { useAiAgents, useAiModels } from "@/features/ai/hooks/useAi"
import type { MaddoxRigorModelTarget, MaddoxSettings } from "../../schemas"

const DEFAULT_OPTION = "__default__"
const SAME_AS_MAIN = "__same__"
const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value))

/** Onde ficam os campos no formulário: a seleção padrão de um cartão ou um bloco por rigor (DND-32). */
export type MaddoxModelPrefix = "main" | "interviewer" | "opexCharacter" | `rigorModels.${MaddoxRigorModelTarget}.${number}`
type ModelField = "provider" | "model" | "variant" | "agent"
type FieldErrorsOf = Partial<Record<ModelField, { message?: string }>> | undefined

interface MaddoxModelFieldsProps {
    form: UseFormReturn<MaddoxSettings>
    prefix: MaddoxModelPrefix
    /** Prefixo dos `id` dos controles (únicos na página). */
    idPrefix: string
    providers: AiProviderStatusDto[]
    /** Opção "Mesmo do Maddox" (provedor vazio): só na seleção padrão do entrevistador. */
    allowSameAsMain?: boolean
    /** Temperatura e máximo de tokens: só na seleção padrão do Maddox. */
    withSampling?: boolean
    /** Aviso quando nenhum provedor de texto está conectado (no lugar das opções). */
    showDisconnectedNotice?: boolean
}

/**
 * Provedor (todos os de texto conectados, inclusive o OpenCode), modelo, variante e agente do OpenCode — os
 * mesmos campos na seleção padrão do cartão e em cada bloco por rigor. Trocar o provedor limpa o resto.
 */
export function MaddoxModelFields({ form, prefix, idPrefix, providers, allowSameAsMain = false, withSampling = false, showDisconnectedNotice = false }: MaddoxModelFieldsProps) {
    const path = (name: ModelField) => `${prefix}.${name}` as FieldPath<MaddoxSettings>
    const errors = get(form.formState.errors, prefix) as FieldErrorsOf
    const provider = useWatch({ control: form.control, name: path("provider") }) as AiTextProviderId | null
    const modelId = useWatch({ control: form.control, name: path("model") }) as string | null
    const models = useAiModels(provider)
    const def = provider ? getAiProvider(provider) : null
    const agents = useAiAgents(def?.supportsAgent === true)
    const model = models.data?.find((item) => item.id === modelId)
    const anyConnected = providers.some((item) => (AI_TEXT_PROVIDER_IDS as readonly string[]).includes(item.id) && item.connected)
    const id = (field: string) => `${idPrefix}-${field}`

    const changeProvider = (next: string) => {
        const value = next === SAME_AS_MAIN ? null : (next as AiTextProviderId)
        if (value === provider) return
        form.setValue(path("provider"), value, { shouldDirty: true, shouldValidate: true })
        form.setValue(path("model"), null, { shouldDirty: true, shouldValidate: true })
        form.setValue(path("variant"), null, { shouldDirty: true })
        form.setValue(path("agent"), null, { shouldDirty: true })
    }

    return (
        <>
            <Field id={id("provider")} label="Provedor" error={errors?.provider?.message}>
                {!anyConnected && showDisconnectedNotice ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum provedor conectado: configure e teste OpenCode, Gemini, Anthropic, OpenAI ou DeepSeek na aba Provedores.</p>
                ) : (
                    <OptionTabs<string>
                        id={id("provider")}
                        options={[
                            ...(allowSameAsMain ? [{ value: SAME_AS_MAIN, label: "Mesmo do Maddox" }] : []),
                            ...AI_TEXT_PROVIDER_IDS.map((providerId) => {
                                const status = providers.find((item) => item.id === providerId)
                                const name = getAiProvider(providerId).name
                                return { value: providerId, label: name, disabled: !status?.connected, title: status?.connected ? undefined : `${name}: não conectado` }
                            }),
                        ]}
                        value={provider ?? (allowSameAsMain ? SAME_AS_MAIN : "")}
                        onChange={changeProvider}
                        className="w-full flex-wrap"
                    />
                )}
                {provider === "opencode" && <p className="text-xs text-muted-foreground">Com o OpenCode, o Maddox mantém sessões próprias no servidor (seção OpenCode).</p>}
            </Field>

            <AnimatePresence initial={false}>
                {provider && (
                    <motion.div key="model" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className={FORM_GRID_WIDE}>
                            <Field id={id("model")} label="Modelo" error={errors?.model?.message ?? (models.isError ? apiErrorMessage(models.error, "Não foi possível listar os modelos") : undefined)}>
                                <SearchPicker<AiModelDto>
                                    trigger={<FieldTrigger id={id("model")} placeholder="Escolha o modelo" invalid={Boolean(errors?.model)} value={model ? model.name : modelId || undefined} />}
                                    items={models.data ?? []}
                                    getKey={(item) => item.id}
                                    searchKeys={["name", "id", "group"]}
                                    renderItem={(item) => (
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{item.name}</span>
                                            <span className="block truncate font-mono text-[11px] text-muted-foreground">{item.id}</span>
                                        </span>
                                    )}
                                    onPick={(item) => {
                                        form.setValue(path("model"), item.id, { shouldDirty: true, shouldValidate: true })
                                        form.setValue(path("variant"), null, { shouldDirty: true })
                                    }}
                                    loading={models.isLoading}
                                    matchTriggerWidth
                                    placeholder="Buscar modelo"
                                    searchLabel="Buscar modelo"
                                    listLabel="Modelos"
                                    emptyText={models.isError ? "Não foi possível listar os modelos" : "Nenhum modelo disponível"}
                                    emptySearchText="Nenhum modelo encontrado"
                                />
                            </Field>
                            {def && model && model.variants.length > 0 && (
                                <Field id={id("variant")} label={def.variantLabel}>
                                    <Controller
                                        control={form.control}
                                        name={path("variant")}
                                        render={({ field }) => (
                                            <Select value={(field.value as string | null) ?? DEFAULT_OPTION} onValueChange={(value) => field.onChange(value === DEFAULT_OPTION ? null : value)}>
                                                <SelectTrigger id={id("variant")} className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={DEFAULT_OPTION}>Padrão do modelo</SelectItem>
                                                    {model.variants.map((variant) => (
                                                        <SelectItem key={variant} value={variant}>
                                                            {variant}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </Field>
                            )}
                            {def?.supportsAgent && (
                                <Field id={id("agent")} label="Agente do OpenCode" error={agents.isError ? apiErrorMessage(agents.error, "Não foi possível listar os agentes") : undefined}>
                                    <Controller
                                        control={form.control}
                                        name={path("agent")}
                                        render={({ field }) => (
                                            <Select value={(field.value as string | null) ?? DEFAULT_OPTION} onValueChange={(value) => field.onChange(value === DEFAULT_OPTION ? null : value)}>
                                                <SelectTrigger id={id("agent")} className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={DEFAULT_OPTION}>Padrão do servidor</SelectItem>
                                                    {(agents.data ?? []).map((agent) => (
                                                        <SelectItem key={agent.id} value={agent.id}>
                                                            {agent.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    />
                                </Field>
                            )}
                            {withSampling && def?.supportsSampling && (
                                <>
                                    <Field id={id("temperature")} label="Temperatura" error={form.formState.errors.main?.temperature?.message}>
                                        <Controller
                                            control={form.control}
                                            name="main.temperature"
                                            render={({ field }) => <Input id={id("temperature")} type="number" step="0.1" min={0} max={2} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                        />
                                    </Field>
                                    <Field id={id("max-tokens")} label="Máximo de tokens por resposta" error={form.formState.errors.main?.maxOutputTokens?.message}>
                                        <Controller
                                            control={form.control}
                                            name="main.maxOutputTokens"
                                            render={({ field }) => <Input id={id("max-tokens")} type="number" step="256" min={256} placeholder="Padrão do modelo" value={field.value ?? ""} onChange={(event) => field.onChange(toNumberOrNull(event.target.value))} />}
                                        />
                                    </Field>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    )
}
