"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Brain, Info, Loader2, MapPinned, RotateCcw, Save, ScanEye, Server, Settings2, Undo2, UserRound } from "lucide-react"
import { Button } from "@/components/ui/opex/button"
import { GlassCard as Card, GlassCardContent as CardContent, GlassCardDescription as CardDescription, GlassCardHeader as CardHeader, GlassCardTitle as CardTitle } from "@/components/ui/glass-card"
import { Field } from "@/components/ui/opex/field"
import { Skeleton } from "@/components/ui/opex/skeleton"
import { Textarea } from "@/components/ui/opex/textarea"
import { FormToggleCard } from "@/components/ui/opex/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useAiProviderStatuses, useImageGeneratorSettings } from "@/features/ai/hooks/useAi"
import { AgentSettingsTabs } from "@/features/ai/components/AgentSettingsTabs"
import type { IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { apiErrorMessage } from "@/lib/api"
import { DEFAULT_MADDOX_INSTRUCTIONS, DEFAULT_MADDOX_INTERVIEWER_INSTRUCTIONS, MADDOX_SCRIPT_KINDS, type MaddoxScriptKind } from "../../constants"
import { DEFAULT_MADDOX_SETTINGS, maddoxSettingsSchema, type MaddoxSettings } from "../../schemas"
import { firstHiddenFormError } from "../../form-errors"
import { draftFromScript, isScriptDraftDirty, isScriptDraftValid, type MaddoxScriptDraft } from "../../script-draft"
import type { MaddoxScriptVersionDto } from "../../types"
import { useMaddoxSettings, useSaveMaddoxScript, useSaveMaddoxSettings } from "../../hooks/useMaddoxSettings"
import { MaddoxAvatarCard } from "./MaddoxAvatarCard"
import { MaddoxJevCard } from "./MaddoxJevCard"
import { MaddoxMemoriesSection } from "./MaddoxMemoriesSection"
import { MaddoxModelCard } from "./MaddoxModelCard"
import { MaddoxOpencodeMcpCard, MaddoxOpencodePolicyCard, MaddoxOpencodeSessionsCard } from "./MaddoxOpencodeCard"
import { MaddoxScriptCard } from "./MaddoxScriptCard"

type MaddoxSection = "geral" | "entrevista-cenario" | "entrevista-personagem" | "jev" | "opencode" | "memorias"
const SECTIONS: IntegrationTabDef<MaddoxSection>[] = [
    { id: "geral", label: "Geral", icon: Settings2 },
    { id: "entrevista-cenario", label: "Entrevista: cenário", icon: MapPinned },
    { id: "entrevista-personagem", label: "Entrevista: personagem", icon: UserRound },
    { id: "jev", label: "JEV", icon: ScanEye },
    { id: "opencode", label: "OpenCode", icon: Server },
    { id: "memorias", label: "Memórias", icon: Brain },
]
const SCRIPT_SECTION: Record<MaddoxScriptKind, MaddoxSection> = { scenario: "entrevista-cenario", character: "entrevista-personagem" }

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

type ScriptDrafts = Record<MaddoxScriptKind, { draft: MaddoxScriptDraft; baseline: MaddoxScriptVersionDto }>

/**
 * Aba "Agente Maddox" de `/integracoes/ia`, em seções: Geral (ativo, avatar, modelos do Maddox e do
 * entrevistador, instruções), Entrevista: cenário e Entrevista: personagem (roteiros versionados,
 * salvos à parte), JEV (chaves por decisão), OpenCode (política e sessões) e Memórias. Um único
 * formulário para Geral, JEV e OpenCode: trocar de seção mantém o rascunho.
 */
export function MaddoxTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useMaddoxSettings()
    const save = useSaveMaddoxSettings()
    const saveScenario = useSaveMaddoxScript("scenario")
    const saveCharacter = useSaveMaddoxScript("character")
    const scriptSavers = { scenario: saveScenario, character: saveCharacter }
    const imageGenerator = useImageGeneratorSettings()
    // `true`: inclui o JEV, que não gera texto e fica fora da lista padrão.
    const { providers } = useAiProviderStatuses(true)
    const form = useForm<MaddoxSettings>({ resolver: zodResolver(maddoxSettingsSchema), mode: "onChange", defaultValues: DEFAULT_MADDOX_SETTINGS })
    const [scripts, setScripts] = useState<ScriptDrafts | null>(null)
    // O rascunho dos roteiros nasce uma vez, durante a renderização (um refetch não sobrescreve o que está sendo editado).
    if (query.data && !scripts) {
        const loaded = query.data
        setScripts(Object.fromEntries(MADDOX_SCRIPT_KINDS.map((kind) => [kind, { draft: draftFromScript(loaded.scripts[kind].current), baseline: loaded.scripts[kind].current }])) as ScriptDrafts)
    }
    const formDirty = form.formState.isDirty
    const scriptsDirty = scripts ? MADDOX_SCRIPT_KINDS.some((kind) => isScriptDraftDirty(scripts[kind].draft, scripts[kind].baseline)) : false
    const dirty = formDirty || scriptsDirty

    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data?.settings, form]) // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    if (query.isLoading || (query.data && !scripts)) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data || !scripts) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />

    const data = query.data
    const availability = data.availability
    const errors = form.formState.errors
    const jevStatus = providers.find((item) => item.id === "jev")

    const resetScript = (kind: MaddoxScriptKind, script: MaddoxScriptVersionDto) => setScripts((current) => (current ? { ...current, [kind]: { draft: draftFromScript(script), baseline: script } } : current))

    const footer = (go: (section: MaddoxSection) => void) => {
        // Os campos com validação na tela ficam em Geral: com erro, volta para lá.
        const submit = form.handleSubmit(
            async (values) => {
                const saved = await save.mutateAsync(values).catch(() => null)
                if (saved) form.reset(saved.settings)
            },
            (fieldErrors) => {
                go(fieldErrors.opencode ? "opencode" : "geral")
                // Campos sem mensagem própria na tela (ex.: URL do avatar) não podem falhar em silêncio.
                const hidden = firstHiddenFormError(fieldErrors)
                if (hidden) toast.error(`Não foi possível salvar: ${hidden}`)
            },
        )
        return (
            <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                <Button type="button" variant="outline" className="gap-1.5" disabled={!formDirty || save.isPending} onClick={() => form.reset(data.settings)}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                </Button>
                <Button type="button" data-ctrl-enter-submit className="gap-1.5" disabled={(!formDirty && !data.isDefault) || save.isPending} onClick={() => void submit()}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </div>
        )
    }

    const scriptSection = (kind: MaddoxScriptKind) => {
        const { draft, baseline } = scripts[kind]
        const current = data.scripts[kind].current
        const outdated = draft.version !== current.version
        const scriptDirty = isScriptDraftDirty(draft, baseline)
        const saver = scriptSavers[kind]
        const submit = async () => {
            const state = await saver.mutateAsync({ guide: draft.guide, topics: draft.topics, notes: draft.notes, version: draft.version }).catch(() => null)
            if (state) resetScript(kind, state.current)
        }
        return (
            <>
                <MaddoxScriptCard kind={kind} state={data.scripts[kind]} draft={draft} onChange={(next) => setScripts((value) => (value ? { ...value, [kind]: { ...value[kind], draft: next } } : value))} />
                {outdated && <p className="text-xs text-warning">Outra pessoa salvou a versão v{current.version} do roteiro. Desfaça para carregá-la; salvar este rascunho será recusado.</p>}
                <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                    <Button type="button" variant="outline" className="gap-1.5" disabled={(!scriptDirty && !outdated) || saver.isPending} onClick={() => resetScript(kind, current)}>
                        <Undo2 className="h-4 w-4" aria-hidden /> Desfazer roteiro
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={!scriptDirty || !isScriptDraftValid(draft) || saver.isPending} onClick={() => void submit()}>
                        {saver.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                        Salvar nova versão do roteiro
                    </Button>
                </div>
            </>
        )
    }

    return (
        <AgentSettingsTabs<MaddoxSection> tabs={SECTIONS} fallback="geral" label="Seções do Agente Maddox">
            {(section, go) => (
                <>
                    {section === "geral" && (
                        <>
                            <Card>
                                <CardContent className="space-y-3 pt-6">
                                    <FormToggleCard<MaddoxSettings>
                                        control={form.control}
                                        name="enabled"
                                        id="maddox-enabled"
                                        label="Agente Maddox"
                                        description="Mestre e narrador das Campanhas Maddox: conduz as entrevistas de cenário e de personagem e narra as campanhas por turnos, com o grau de rigor escolhido em cada campanha"
                                    />
                                    <AnimatePresence initial={false}>
                                        {!formDirty && !availability.available && availability.reason && (
                                            <motion.p key="availability" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                                            </motion.p>
                                        )}
                                    </AnimatePresence>
                                </CardContent>
                            </Card>

                            <MaddoxAvatarCard form={form} imageGenerator={imageGenerator.data?.availability} />
                            <MaddoxModelCard form={form} target="main" providers={providers} title="Maddox (narrador)" description="Modelo que narra as campanhas como mestre. Inclui o OpenCode, com sessões próprias por campanha." />
                            <MaddoxModelCard form={form} target="interviewer" providers={providers} title="Entrevistador" description="Modelo que conduz as entrevistas de cenário e de personagem. Sem provedor próprio, usa o do Maddox." />

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Instruções</CardTitle>
                                    <CardDescription>Prompt de sistema do Maddox e do entrevistador. O grau de rigor da campanha, o roteiro da entrevista e as memórias entram sozinhos.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <Field id="maddox-instructions" label="Maddox (narrador)" error={errors.instructions?.message}>
                                        <Textarea id="maddox-instructions" rows={10} className="font-mono text-xs" {...form.register("instructions")} />
                                        <div className="flex justify-end">
                                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_MADDOX_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                                            </Button>
                                        </div>
                                    </Field>
                                    <Field id="maddox-interviewer-instructions" label="Entrevistador" error={errors.interviewerInstructions?.message}>
                                        <Textarea id="maddox-interviewer-instructions" rows={8} className="font-mono text-xs" {...form.register("interviewerInstructions")} />
                                        <div className="flex justify-end">
                                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("interviewerInstructions", DEFAULT_MADDOX_INTERVIEWER_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                                            </Button>
                                        </div>
                                    </Field>
                                </CardContent>
                            </Card>
                            {footer(go)}
                        </>
                    )}
                    {section === SCRIPT_SECTION.scenario && scriptSection("scenario")}
                    {section === SCRIPT_SECTION.character && scriptSection("character")}
                    {section === "jev" && (
                        <>
                            <MaddoxJevCard form={form} jev={jevStatus} />
                            {footer(go)}
                        </>
                    )}
                    {section === "opencode" && (
                        <>
                            <MaddoxOpencodePolicyCard form={form} />
                            {footer(go)}
                            <MaddoxOpencodeMcpCard />
                            <MaddoxOpencodeSessionsCard />
                        </>
                    )}
                    {/* Salva sozinho (cada memória grava na hora). */}
                    {section === "memorias" && <MaddoxMemoriesSection />}
                </>
            )}
        </AgentSettingsTabs>
    )
}
