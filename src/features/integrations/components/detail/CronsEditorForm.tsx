"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { motion } from "framer-motion"
import { AlarmClock, CalendarClock, Settings2 } from "lucide-react"
import { INTEGRATION_CRON_JOBS, type IntegrationDef, type PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { OpexJobsTab } from "@/features/opex-agent/components/jobs/OpexJobsTab"
import { ApiDocsCard } from "./ApiDocsCard"
import { CronJobsCard } from "./CronJobsCard"
import { DetailActions } from "./DetailActions"
import { DetailHeader } from "./DetailHeader"
import type { Draft } from "./draft"
import { GeneralCard } from "./GeneralCard"
import { PublicFieldsCard } from "./PublicFieldsCard"
import { SecretFieldsCard } from "./SecretFieldsCard"
import { IntegrationTabs, type IntegrationTabDef } from "../tabs/IntegrationTabs"
import { useIntegrationTab } from "../tabs/useIntegrationTab"

interface CronsEditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onSave: () => Promise<boolean>
    onUndo: () => void
    onExplore: () => void
}

const CRONS_TABS = ["geral", "rotinas", "jobs"] as const
type CronsTab = (typeof CRONS_TABS)[number]

const TABS: IntegrationTabDef<CronsTab>[] = [
    { id: "geral", label: "Geral", icon: Settings2 },
    { id: "rotinas", label: "Rotinas", icon: CalendarClock },
    { id: "jobs", label: "Jobs", icon: AlarmClock },
]

/**
 * Página da integração Crons em abas: **Geral** (agendador, URL interna, secret e documentação) e
 * **Rotinas** (lista das rotinas agendadas, com busca) e **Jobs** (prompts agendados do Agente Opex,
 * dos usuários). Trocar de aba com alterações pede descarte.
 */
export function CronsEditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo, onExplore }: CronsEditorFormProps) {
    const { tab, requestTab, pendingTab, confirmDiscard, cancelDiscard } = useIntegrationTab<CronsTab>(CRONS_TABS, "geral", dirty, onUndo)
    // Rotinas de integrações ativáveis desativadas não aparecem (nenhuma no DnDicas hoje).
    const hiddenJobIds = useMemo(() => new Set(Object.keys(INTEGRATION_CRON_JOBS)), [])

    const setPublic = (key: string, value: PublicFieldValue | "") =>
        setDraft((prev) => ({ ...prev, publicValues: { ...prev.publicValues, [key]: value } }))

    const secretFields = def.secretFields.filter((field) => !field.group)
    const regularFields = def.publicFields.filter((field) => field.kind !== "cron-jobs" && !field.group)
    const jobsField = def.publicFields.find((field) => field.kind === "cron-jobs")

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
                if (dirty) void onSave()
            }}
        >
            <DetailHeader def={def} data={data} hasAnySecret={def.secretFields.length > 0} />
            <IntegrationTabs tabs={TABS} active={tab} onSelect={requestTab} pendingTab={pendingTab} onConfirmDiscard={confirmDiscard} onCancelDiscard={cancelDiscard} label="Seções da integração Crons">
                {tab === "geral" && (
                    <>
                        <GeneralCard draft={draft} setDraft={setDraft} />
                        {regularFields.length > 0 && <PublicFieldsCard fields={regularFields} data={data} publicValues={draft.publicValues} setPublic={setPublic} />}
                        {secretFields.length > 0 && <SecretFieldsCard fields={secretFields} data={data} draft={draft} setDraft={setDraft} />}
                        <ApiDocsCard data={data} draft={draft} setDraft={setDraft} dirty={dirty} onExplore={onExplore} />
                        <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
                    </>
                )}
                {tab === "rotinas" && (
                    <>
                        {jobsField && (
                            <CronJobsCard
                                field={jobsField}
                                data={data}
                                publicValues={draft.publicValues}
                                setPublic={setPublic}
                                canRun
                                hiddenJobIds={hiddenJobIds}
                            />
                        )}
                        <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
                    </>
                )}
                {tab === "jobs" && <OpexJobsTab />}
            </IntegrationTabs>
        </motion.form>
    )
}
