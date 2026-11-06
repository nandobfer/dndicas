"use client"

import type { Dispatch, SetStateAction } from "react"
import { AlertTriangle } from "lucide-react"
import type { IntegrationDef, PublicFieldValue } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailActions } from "@/features/integrations/components/detail/DetailActions"
import type { Draft } from "@/features/integrations/components/detail/draft"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import { PublicFieldsCard } from "@/features/integrations/components/detail/PublicFieldsCard"
import { SecretFieldsCard } from "@/features/integrations/components/detail/SecretFieldsCard"
import { useEngramindBootstrap, useEngramindConnection } from "../../hooks/useEngramind"
import { BootstrapSteps } from "./BootstrapSteps"
import { formatDateTime } from "./Section"

interface ConnectionTabProps {
    def: IntegrationDef
    data: IntegrationDetailDto
    draft: Draft
    setDraft: Dispatch<SetStateAction<Draft>>
    dirty: boolean
    pending: boolean
    onUndo: () => void
}

/**
 * Aba Conexão: URL base, URL pública do dndicas e o token do app (os tokens dos agentes e o segredo do
 * webhook são gravados só pela configuração automática e nunca aparecem). Salvar dispara a configuração
 * automática (no formulário) e os passos aparecem aqui.
 */
export function ConnectionTab({ def, data, draft, setDraft, dirty, pending, onUndo }: ConnectionTabProps) {
    const connection = useEngramindConnection()
    const bootstrap = useEngramindBootstrap()
    const setPublic = (key: string, value: PublicFieldValue | "") => setDraft((prev) => ({ ...prev, publicValues: { ...prev.publicValues, [key]: value } }))
    const state = connection.data
    const health = state?.memoryContext
    return (
        <>
            <GeneralCard draft={draft} setDraft={setDraft} />
            <PublicFieldsCard fields={def.publicFields.filter((field) => !field.group)} data={data} publicValues={draft.publicValues} setPublic={setPublic} />
            <SecretFieldsCard fields={def.secretFields.filter((field) => !field.group)} data={data} draft={draft} setDraft={setDraft} />
            <DetailActions dirty={dirty} pending={pending} onUndo={onUndo} />
            {health?.unavailable && (
                <p className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm" role="status">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" aria-hidden />
                    Engramind indisponível{health.since ? ` desde ${formatDateTime(health.since)}` : ""}: os agentes usam o último contexto em cache{health.lastOkAt ? ` (de ${formatDateTime(health.lastOkAt)})` : ""} ou seguem sem memórias.
                </p>
            )}
            <BootstrapSteps bootstrap={bootstrap.data ?? state?.bootstrap ?? null} configured={state?.configured ?? false} pending={bootstrap.isPending} onRepeat={() => bootstrap.mutate()} />
            {state?.webhookUrl && <p className="text-xs text-muted-foreground">Webhook: <span className="font-mono">{state.webhookUrl}</span></p>}
        </>
    )
}
