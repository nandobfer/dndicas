"use client"

import { useEffect } from "react"
import { useForm, useWatch, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Input } from "@/components/ui/opex/input"
import { Label } from "@/components/ui/opex/label"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { Textarea } from "@/components/ui/opex/textarea"
import { ErrorState } from "@/components/feedback/ErrorState"
import { FORM_GRID } from "@/components/ui/opex/form-grid"
import { apiErrorMessage } from "@/lib/api"
import { OpexModelCard } from "@/features/opex-agent/components/settings/OpexModelCard"
import type { OpexAgentSettings } from "@/features/opex-agent/schemas"
import { DEFAULT_MEMORY_SUMMARY_SETTINGS, memorySummarySettingsSchema, type MemorySummarySettings } from "../../schemas"
import { useAiProviderStatuses } from "../../hooks/useAi"
import { useMemorySummarySettings, useSaveMemorySummarySettings } from "../../hooks/useMemorySummarySettings"
import { FeatureFormShell } from "../FeatureFormShell"

/**
 * Aba "Resumo de memórias": formata e resume as memórias do Agente Opex. Cópia da aba "Resumo" do
 * Ciliar; o provedor/modelo usa o cartão de modelo do Agente Opex.
 */
export function MemorySummaryTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useMemorySummarySettings()
    const save = useSaveMemorySummarySettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<MemorySummarySettings>({ resolver: zodResolver(memorySummarySettingsSchema), mode: "onChange", defaultValues: DEFAULT_MEMORY_SUMMARY_SETTINGS })
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
        <FeatureFormShell
            id="ai-memory-summary-enabled"
            label="Resumo de memórias"
            description="Revisa o texto das memórias do Agente Opex antes de salvar e gera o resumo de uma linha mostrado nas listas. Desligado, a memória é salva como escrita"
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
            <OpexModelCard form={form as unknown as UseFormReturn<OpexAgentSettings>} target="main" providers={providers} title="Provedor e modelo" description="Provedores configurados na aba Provedores." />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Instruções</CardTitle>
                    <CardDescription>O formato da resposta (texto revisado + resumo) é acrescentado pelo Opex.</CardDescription>
                </CardHeader>
                <CardContent className={`${FORM_GRID} p-6 pt-0`}>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="memory-summary-instructions">Instruções do Resumo de memórias</Label>
                        <Textarea id="memory-summary-instructions" rows={6} {...form.register("instructions")} />
                        {errors.instructions?.message && <p className="text-xs text-destructive">{errors.instructions.message}</p>}
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="memory-summary-max">Tamanho máximo do resumo (caracteres)</Label>
                        <Input id="memory-summary-max" type="number" {...form.register("maxLength", { valueAsNumber: true })} />
                        {errors.maxLength?.message && <p className="text-xs text-destructive">{errors.maxLength.message}</p>}
                    </div>
                </CardContent>
            </Card>
        </FeatureFormShell>
    )
}
