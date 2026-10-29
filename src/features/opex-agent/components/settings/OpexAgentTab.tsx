"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Brain, Info, Loader2, RotateCcw, Save, Settings2, Undo2, Wrench } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/opex/card"
import { Field } from "@/components/ui/opex/field"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { Textarea } from "@/components/ui/opex/textarea"
import { FormToggleCard } from "@/components/ui/opex/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { AgentSettingsTabs } from "@/features/ai/components/AgentSettingsTabs"
import type { IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { apiErrorMessage } from "@/lib/api"
import { DEFAULT_OPEX_INSTRUCTIONS, DEFAULT_OPEX_TITLE_INSTRUCTIONS } from "../../constants"
import { DEFAULT_OPEX_AGENT_SETTINGS, opexAgentSettingsSchema, type OpexAgentSettings } from "../../schemas"
import { useOpexSettings, useSaveOpexSettings } from "../../hooks/useOpexSettings"
import { OpexModelCard } from "./OpexModelCard"
import { OpexFilesCard } from "./OpexFilesCard"
import { OpexAnonymousCard } from "./OpexAnonymousCard"
import { OpexToolsCard } from "./OpexToolsCard"
import { OpexMemoriesSection } from "./OpexMemoriesSection"

type OpexSection = "geral" | "ferramentas" | "memorias"
const SECTIONS: IntegrationTabDef<OpexSection>[] = [
    { id: "geral", label: "Geral", icon: Settings2 },
    { id: "ferramentas", label: "Ferramentas", icon: Wrench },
    { id: "memorias", label: "Memórias", icon: Brain },
]

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Aba "Agente Opex" de `/integracoes/ia`, em seções (copiadas do Ciliar): Geral (ativo, agente
 * principal, subagente de título e resumo, instruções, arquivos e visitantes), Ferramentas (seleção e
 * confirmação por ferramenta) e Memórias (globais, de administradores e de usuários). Um único formulário para Geral e
 * Ferramentas: trocar de seção mantém o rascunho.
 */
export function OpexAgentTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useOpexSettings()
    const save = useSaveOpexSettings()
    const { providers } = useAiProviderStatuses()
    const form = useForm<OpexAgentSettings>({ resolver: zodResolver(opexAgentSettingsSchema), mode: "onChange", defaultValues: DEFAULT_OPEX_AGENT_SETTINGS })
    const dirty = form.formState.isDirty

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
    const availability = data.availability
    const errors = form.formState.errors

    const footer = (go: (section: OpexSection) => void) => {
        // Os campos com validação na tela ficam em Geral: com erro, volta para lá.
        const submit = form.handleSubmit(
            async (values) => {
                const saved = await save.mutateAsync(values).catch(() => null)
                if (saved) form.reset(saved.settings)
            },
            () => go("geral"),
        )
        return (
            <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => form.reset(data.settings)}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                </Button>
                <Button type="button" data-ctrl-enter-submit className="gap-1.5" disabled={(!dirty && !data.isDefault) || save.isPending} onClick={() => void submit()}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </div>
        )
    }

    return (
        <AgentSettingsTabs<OpexSection> tabs={SECTIONS} fallback="geral" label="Seções do Agente Opex">
            {(section, go) => (
                <>
                    {section === "geral" && (
                        <>
                            <Card>
                                <CardContent className="space-y-3 pt-6">
                                    <FormToggleCard<OpexAgentSettings>
                                        control={form.control}
                                        name="enabled"
                                        id="opex-enabled"
                                        label="Agente Opex"
                                        description="Assistente por chat para todos (item da barra lateral, Ctrl+Shift+O): consulta o catálogo e a documentação do DnDicas, cuida das fichas e NPCs do usuário e, para administradores, configura integrações, agentes de IA e memórias"
                                    />
                                    <AnimatePresence initial={false}>
                                        {!dirty && !availability.available && availability.reason && (
                                            <motion.p key="availability" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                                            </motion.p>
                                        )}
                                    </AnimatePresence>
                                </CardContent>
                            </Card>

                            <OpexModelCard form={form} target="main" providers={providers} title="Agente principal" description="Modelo que conversa e usa as ferramentas. Prefira modelos fortes em uso de ferramentas." />
                            <OpexModelCard form={form} target="title" providers={providers} title="Título e resumo" description="Subagente que atualiza o título e o resumo da sessão a cada turno. Um modelo rápido e barato basta." />

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Instruções</CardTitle>
                                    <CardDescription>Prompt de sistema do agente e do subagente. A data/hora atual, quem conversa (e o papel), as regras da documentação e as memórias entram sozinhos a cada turno.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <Field id="opex-instructions" label="Agente principal" error={errors.instructions?.message}>
                                        <Textarea id="opex-instructions" rows={10} className="font-mono text-xs" {...form.register("instructions")} />
                                        <div className="flex justify-end">
                                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_OPEX_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                                            </Button>
                                        </div>
                                    </Field>
                                    <Field id="opex-title-instructions" label="Título e resumo" error={errors.titleInstructions?.message}>
                                        <Textarea id="opex-title-instructions" rows={6} className="font-mono text-xs" {...form.register("titleInstructions")} />
                                        <div className="flex justify-end">
                                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("titleInstructions", DEFAULT_OPEX_TITLE_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                                            </Button>
                                        </div>
                                    </Field>
                                </CardContent>
                            </Card>

                            <OpexFilesCard form={form} />
                            <OpexAnonymousCard form={form} />
                            {footer(go)}
                        </>
                    )}
                    {section === "ferramentas" && (
                        <>
                            <OpexToolsCard form={form} tools={data.tools} />
                            {footer(go)}
                        </>
                    )}
                    {/* Salva sozinho (cada memória grava na hora). */}
                    {section === "memorias" && <OpexMemoriesSection />}
                </>
            )}
        </AgentSettingsTabs>
    )
}
