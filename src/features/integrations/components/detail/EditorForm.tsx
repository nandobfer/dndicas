"use client"

import type { Dispatch, SetStateAction } from "react"
import { motion } from "framer-motion"
import type { IntegrationDef, PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "../../types"
import { McpServerCard } from "../internal-api/McpServerCard"
import { ApiDocsCard } from "./ApiDocsCard"
import { CronJobsCard } from "./CronJobsCard"
import { DetailActions } from "./DetailActions"
import { DetailHeader } from "./DetailHeader"
import type { Draft } from "./draft"
import { GeneralCard } from "./GeneralCard"
import { PublicFieldsCard } from "./PublicFieldsCard"
import { SecretFieldsCard } from "./SecretFieldsCard"

interface EditorFormProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    /** Salva o rascunho; `true` se salvou. */
    onSave: () => Promise<boolean>
    onUndo: () => void
    onExplore: () => void
}

/** Formulário de configuração da integração (coluna da esquerda). */
export function EditorForm({ def, data, draft, setDraft, dirty, pending, onSave, onUndo, onExplore }: EditorFormProps) {

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

            <GeneralCard draft={draft} setDraft={setDraft} />

            <ApiDocsCard data={data} draft={draft} setDraft={setDraft} dirty={dirty} onExplore={onExplore} />

            {def.id === "internal_api" && <McpServerCard />}

            {regularFields.length > 0 && (
                <PublicFieldsCard fields={regularFields} data={data} publicValues={draft.publicValues} setPublic={setPublic} />
            )}

            {secretFields.length > 0 && <SecretFieldsCard fields={secretFields} data={data} draft={draft} setDraft={setDraft} />}

            {jobsField && (
                <CronJobsCard
                    field={jobsField}
                    data={data}
                    publicValues={draft.publicValues}
                    setPublic={setPublic}
                   
                    canRun
                />
            )}

            <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
        </motion.form>
    )
}
