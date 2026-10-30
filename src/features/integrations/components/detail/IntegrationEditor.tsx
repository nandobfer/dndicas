"use client"

import { useMemo, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { findMissingConditionalField, getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { buildIntegrationUpdateSchema } from "../../schemas/integration.schema"
import { integrationErrorMessage, useUpdateIntegration } from "../../hooks/useIntegrations"
import { useScrollViewportHeight } from "../../hooks/useScrollViewportHeight"
import type { IntegrationDetailDto } from "../../types"
import { buildIntegrationPatch, draftFrom, type Draft } from "./draft"
import { AiEditorForm } from "@/features/ai/components/AiEditorForm"
import { aiProviderOfIntegration } from "@/lib/ai/providers"
import { AiProviderEditorForm } from "@/features/ai/components/AiProviderEditorForm"
import { CronsEditorForm } from "./CronsEditorForm"
import { EditorForm } from "./EditorForm"
import { ExplorerPane } from "./ExplorerPane"
import { LogsPanel } from "./LogsPanel"
import { useLogsMaximized } from "./useLogsMaximized"
import { PerfixEditorForm } from "@/features/perfix/components/PerfixEditorForm"

export function IntegrationEditor({ id, data }: { id: IntegrationId; data: IntegrationDetailDto }) {
    const def = getIntegrationDef(id)
    const mutation = useUpdateIntegration(id)
    const [draft, setDraft] = useState<Draft>(() => draftFrom(data))
    // Explorador substitui o formulário na coluna da esquerda (o debug segue à direita).
    const [exploring, setExploring] = useState(false)
    const gridRef = useRef<HTMLDivElement>(null)
    // Debug ocupa exatamente a área visível do <main> rolável: a última linha sempre aparece.
    const debugHeight = useScrollViewportHeight(gridRef, data.debugMode)
    const { logsCardRef, logsMaximized, setLogsMaximized } = useLogsMaximized(data.debugMode)

    const patch = useMemo(() => buildIntegrationPatch(def.publicFields, data, draft), [data, def.publicFields, draft])
    const dirty = Object.keys(patch).length > 0

    /** Salva o rascunho; `true` se salvou. */
    const save = async (): Promise<boolean> => {
        const parsed = buildIntegrationUpdateSchema(def).safeParse(patch)
        if (!parsed.success) {
            toast.error(parsed.error.issues[0]?.message ?? "Revise os campos destacados")
            return false
        }
        // Mesma regra do servidor: o modo escolhido exige o próprio campo obrigatório.
        const missing = findMissingConditionalField(def.publicFields, draft.publicValues, Object.keys(patch.publicValues ?? {}))
        if (missing) {
            toast.error(`${missing.label}: preenchimento obrigatório`)
            return false
        }
        try {
            const saved = await mutation.mutateAsync(patch)
            setDraft(draftFrom(saved))
            toast.success(`${def.name} salva`)
            return true
        } catch (error) {
            toast.error(integrationErrorMessage(error, "Não foi possível salvar a integração"))
            return false
        }
    }

    return (
        // Sem `layout` aqui de propósito: a projeção de layout do framer-motion dentro do
        // <motion.main> que anima a troca de rota (e rola) media errado quando o editor montava
        // no meio da entrada, deixando a tela em branco de vez em quando.
        <div
            ref={gridRef}
            className={cn(
                "grid items-start gap-6",
                data.debugMode && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
            )}
        >
            <AnimatePresence mode="wait" initial={false}>
                {exploring && data.swaggerUrl ? (
                    <ExplorerPane
                        key="explorer"
                        id={id}
                        integrationName={def.name}
                        swaggerUrl={data.swaggerUrl}
                        onBack={() => setExploring(false)}
                    />
                ) : id === "perfix" ? <PerfixEditorForm key="form" /> : id === "ai" ? (
                    <AiEditorForm
                        key="form"
                        def={def}
                        data={data}
                        draft={draft}
                        setDraft={setDraft}
                        dirty={dirty}
                        pending={mutation.isPending}
                        onSave={save}
                        onUndo={() => setDraft(draftFrom(data))}
                    />
                ) : aiProviderOfIntegration(id) ? (
                    <AiProviderEditorForm
                        key="form"
                        def={def}
                        data={data}
                        draft={draft}
                        setDraft={setDraft}
                        dirty={dirty}
                        pending={mutation.isPending}
                        onSave={save}
                        onUndo={() => setDraft(draftFrom(data))}
                    />
                ) : id === "crons" ? (
                    <CronsEditorForm
                        key="form"
                        def={def}
                        data={data}
                        draft={draft}
                        setDraft={setDraft}
                        dirty={dirty}
                        pending={mutation.isPending}
                        onSave={save}
                        onUndo={() => setDraft(draftFrom(data))}
                        onExplore={() => setExploring(true)}
                    />
                ) : (
                    <EditorForm
                        key="form"
                        def={def}
                        data={data}
                        draft={draft}
                        setDraft={setDraft}
                        dirty={dirty}
                        pending={mutation.isPending}
                        onSave={save}
                        onUndo={() => setDraft(draftFrom(data))}
                        onExplore={() => setExploring(true)}
                    />
                )}
            </AnimatePresence>

            <LogsPanel
                id={id}
                visible={data.debugMode}
                debugHeight={debugHeight}
                logsCardRef={logsCardRef}
                maximized={logsMaximized}
                onMaximizedChange={setLogsMaximized}
            />
        </div>
    )
}
