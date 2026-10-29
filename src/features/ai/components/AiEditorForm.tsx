"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { motion } from "framer-motion"
import { BrainCircuit, Bot, ImagePlus, Languages, ScrollText, Sparkles } from "lucide-react"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { AI_TABS, type AiTab } from "../constants"
import { useAiFeatureRealtime } from "../hooks/useAi"
import { AiProvidersTab } from "./AiProvidersTab"
import { ImageGeneratorTab } from "./agents/ImageGeneratorTab"
import { EntityUnderstandingTab } from "./agents/EntityUnderstandingTab"
import { EntityImportTab } from "./agents/EntityImportTab"
import { OpexAgentTab } from "@/features/opex-agent/components/settings/OpexAgentTab"
import { MemorySummaryTab } from "./memory-summary/MemorySummaryTab"

interface AiEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
}

const TABS: IntegrationTabDef<AiTab>[] = [
    { id: "provedores", label: "Provedores", icon: BrainCircuit },
    { id: "gerador-imagens", label: "Gerador de imagens", icon: ImagePlus },
    { id: "entender-com-ia", label: "Entender com IA", icon: Sparkles },
    { id: "importador-5etools", label: "Importador 5etools", icon: Languages },
    { id: "agente-opex", label: "Agente Opex", icon: Bot },
    { id: "resumo-memorias", label: "Resumo de memórias", icon: ScrollText },
]

/**
 * Página "Provedores de IA" (`/integracoes/ia`): aba Provedores (OpenCode, Gemini, Anthropic, OpenAI,
 * DeepSeek, JEV e as opções gerais do hub) e uma aba por agente do DnDicas que usa IA. Trocar de aba com alterações pede descarte.
 */
export function AiEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: AiEditorFormProps) {
    useAiFeatureRealtime()
    const [tabDirty, setTabDirty] = useState(false)
    const [resetKey, setResetKey] = useState(0)
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<AiTab>(AI_TABS, "provedores", dirty || tabDirty, () => {
        onUndo()
        setTabDirty(false)
        setResetKey((value) => value + 1)
    })

    return (
        <motion.form
            key="form"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex min-w-0 flex-col gap-6"
            onSubmit={(event) => {
                event.preventDefault()
                if (tab === "provedores" && dirty) void onSave()
            }}
        >
            <DetailHeader def={def} data={data} hasAnySecret={false} />
            <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções de Provedores de IA">
                {tab === "provedores" && (
                    <>
                        <AiProvidersTab />
                        <GeneralCard draft={draft} setDraft={setDraft} />
                        <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
                    </>
                )}
                {tab === "gerador-imagens" && <ImageGeneratorTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "entender-com-ia" && <EntityUnderstandingTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "importador-5etools" && <EntityImportTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "agente-opex" && <OpexAgentTab key={resetKey} onDirtyChange={setTabDirty} />}
                {tab === "resumo-memorias" && <MemorySummaryTab key={resetKey} onDirtyChange={setTabDirty} />}
            </IntegrationTabs>
        </motion.form>
    )
}
