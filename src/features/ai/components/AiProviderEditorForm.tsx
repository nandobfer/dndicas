"use client"

import type { Dispatch, SetStateAction } from "react"
import { motion } from "framer-motion"
import { BarChart3, Cpu, Settings2 } from "lucide-react"
import type { IntegrationDef, PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { aiProviderOfIntegration } from "@/lib/ai/providers"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { PublicFieldsCard } from "@/features/integrations/components/detail/PublicFieldsCard"
import { SecretFieldsCard } from "@/features/integrations/components/detail/SecretFieldsCard"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { AI_PROVIDER_TAB_IDS, type AiProviderTab } from "../constants"
import { AiModelsCard } from "./AiModelsCard"
import { JevUsageCard } from "./JevUsageCard"
import { OpencodeUsageCard } from "./OpencodeUsageCard"

interface AiProviderEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
}

const TAB_DEFS: Record<AiProviderTab, IntegrationTabDef<AiProviderTab>> = {
    configuracao: { id: "configuracao", label: "Configuração", icon: Settings2 },
    modelos: { id: "modelos", label: "Modelos", icon: Cpu },
    consumo: { id: "consumo", label: "Consumo", icon: BarChart3 },
}

/**
 * Página de um provedor de IA em abas: Configuração (campos e ações), Modelos (lista do provedor) e
 * Consumo (uso medido). O Gemini não tem a aba Consumo. Trocar de aba com alterações pede descarte.
 */
export function AiProviderEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: AiProviderEditorFormProps) {
    const provider = aiProviderOfIntegration(def.id)
    const allowed: readonly AiProviderTab[] = provider ? AI_PROVIDER_TAB_IDS[provider.id] : ["configuracao"]
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<AiProviderTab>(allowed, "configuracao", dirty, onUndo)

    const setPublic = (key: string, value: PublicFieldValue | "") =>
        setDraft((prev) => ({ ...prev, publicValues: { ...prev.publicValues, [key]: value } }))

    const secretFields = def.secretFields.filter((field) => !field.group)
    const regularFields = def.publicFields.filter((field) => !field.group)
    const tabs = allowed.map((id) => TAB_DEFS[id])

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
                if (tab === "configuracao" && dirty) void onSave()
            }}
        >
            <DetailHeader def={def} data={data} hasAnySecret={def.secretFields.length > 0} />
            <IntegrationTabs tabs={tabs} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções do provedor de IA">
                {tab === "configuracao" && (
                    <>
                        <GeneralCard draft={draft} setDraft={setDraft} />
                        {secretFields.length > 0 && <SecretFieldsCard fields={secretFields} data={data} draft={draft} setDraft={setDraft} />}
                        {regularFields.length > 0 && <PublicFieldsCard fields={regularFields} data={data} publicValues={draft.publicValues} setPublic={setPublic} />}
                        <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
                    </>
                )}
                {tab === "modelos" && provider && <AiModelsCard provider={provider.id} dirty={dirty} />}
                {tab === "consumo" && provider?.id === "jev" && <JevUsageCard />}
                {tab === "consumo" && provider?.id === "opencode" && <OpencodeUsageCard />}
            </IntegrationTabs>
        </motion.form>
    )
}
