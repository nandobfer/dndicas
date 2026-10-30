"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
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
import type { MaddoxSettings } from "../../schemas"

const DEFAULT_OPTION = "__default__"
const SAME_AS_MAIN = "__same__"
const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value))

interface MaddoxModelCardProps {
    form: UseFormReturn<MaddoxSettings>
    target: "main" | "interviewer"
    providers: AiProviderStatusDto[]
    title: string
    description: string
}

/**
 * Provedor (todos os de texto conectados, inclusive o OpenCode), modelo, variante, agente do OpenCode
 * e, no Maddox, a amostragem. Mesmo visual do cartão de modelo do Agente Opex.
 */
export function MaddoxModelCard({ form, target, providers, title, description }: MaddoxModelCardProps) {
    const errors = form.formState.errors[target]
    const provider = useWatch({ control: form.control, name: `${target}.provider` })
    const modelId = useWatch({ control: form.control, name: `${target}.model` })
    const models = useAiModels(provider)
    const def = provider ? getAiProvider(provider) : null
    const agents = useAiAgents(def?.supportsAgent === true)
    const model = models.data?.find((item) => item.id === modelId)
    const anyConnected = providers.some((item) => (AI_TEXT_PROVIDER_IDS as readonly string[]).includes(item.id) && item.connected)
    const id = (field: string) => `maddox-${target}-${field}`

    const changeProvider = (next: string) => {
        const value = next === SAME_AS_MAIN ? null : (next as AiTextProviderId)
        if (value === provider) return
        form.setValue(`${target}.provider`, value, { shouldDirty: true, shouldValidate: true })
        form.setValue(`${target}.model`, null, { shouldDirty: true, shouldValidate: true })
        form.setValue(`${target}.variant`, null, { shouldDirty: true })
        form.setValue(`${target}.agent`, null, { shouldDirty: true })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id={id("provider")} label="Provedor" error={errors?.provider?.message}>
                    {!anyConnected && target === "main" ? (
                        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum provedor conectado: configure e teste OpenCode, Gemini, Anthropic, OpenAI ou DeepSeek na aba Provedores.</p>
                    ) : (
                        <OptionTabs<string>
                            id={id("provider")}
                            options={[
                                ...(target === "interviewer" ? [{ value: SAME_AS_MAIN, label: "Mesmo do Maddox" }] : []),
                                ...AI_TEXT_PROVIDER_IDS.map((providerId) => {
                                    const status = providers.find((item) => item.id === providerId)
                                    const name = getAiProvider(providerId).name
                                    return { value: providerId, label: name, disabled: !status?.connected, title: status?.connected ? undefined : `${name}: não conectado` }
                                }),
                            ]}
                            value={provider ?? (target === "interviewer" ? SAME_AS_MAIN : "")}
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
                                            form.setValue(`${target}.model`, item.id, { shouldDirty: true, shouldValidate: true })
                                            form.setValue(`${target}.variant`, null, { shouldDirty: true })
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
                                            name={`${target}.variant`}
                                            render={({ field }) => (
                                                <Select value={field.value ?? DEFAULT_OPTION} onValueChange={(value) => field.onChange(value === DEFAULT_OPTION ? null : value)}>
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
                                            name={`${target}.agent`}
                                            render={({ field }) => (
                                                <Select value={field.value ?? DEFAULT_OPTION} onValueChange={(value) => field.onChange(value === DEFAULT_OPTION ? null : value)}>
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
                                {target === "main" && def?.supportsSampling && (
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
            </CardContent>
        </Card>
    )
}
