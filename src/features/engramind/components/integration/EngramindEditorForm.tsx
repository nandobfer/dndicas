"use client"

import type { Dispatch, SetStateAction } from "react"
import { motion } from "framer-motion"
import { ArrowLeftRight, Orbit, Plug, RefreshCw } from "lucide-react"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { useEngramindBootstrap, useEngramindRealtime } from "../../hooks/useEngramind"
import { ConnectionTab } from "./ConnectionTab"
import { MigrationTab } from "./migration/MigrationTab"
import { SyncTab } from "./SyncTab"
import { UniverseLayoutTab } from "./universe-layout/UniverseLayoutTab"

const ENGRAMIND_TABS = ["conexao", "migracao", "sincronizacao", "visualizacao"] as const
type EngramindTab = (typeof ENGRAMIND_TABS)[number]

const TABS: IntegrationTabDef<EngramindTab>[] = [
    { id: "conexao", label: "Conexão", icon: Plug },
    { id: "migracao", label: "Migração", icon: ArrowLeftRight },
    { id: "sincronizacao", label: "Sincronização", icon: RefreshCw },
    { id: "visualizacao", label: "Visualização", icon: Orbit },
]

interface EngramindEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
}

/**
 * Página da integração Engramind (`/integracoes/engramind`): Conexão (salvar dispara a configuração
 * automática), Migração das memórias, Sincronização das campanhas e Visualização (importar/exportar o layout
 * dos universos da rede, sem formulário). Sem gestão da rede: apps, agentes, tokens e configurações ficam
 * no Opex.
 */
export function EngramindEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo }: EngramindEditorFormProps) {
    useEngramindRealtime()
    const bootstrap = useEngramindBootstrap()
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<EngramindTab>(ENGRAMIND_TABS, "conexao", dirty, onUndo)
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
                if (tab !== "conexao" || !dirty) return
                void onSave().then((saved) => {
                    if (saved) bootstrap.mutate()
                })
            }}
        >
            <DetailHeader def={def} data={data} hasAnySecret />
            <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções da integração Engramind">
                {tab === "conexao" && <ConnectionTab def={def} data={data} draft={draft} setDraft={setDraft} dirty={dirty} pending={pending || bootstrap.isPending} onUndo={onUndo} />}
                {tab === "migracao" && <MigrationTab />}
                {tab === "sincronizacao" && <SyncTab />}
                {tab === "visualizacao" && <UniverseLayoutTab />}
            </IntegrationTabs>
        </motion.form>
    )
}
