import { AcaoAuditoria, recordAudit, type AcaoAuditoriaTipo } from "@/lib/audit/record"
import { loggerFor } from "@/lib/logger"
import { integrationChannel } from "@/lib/pusher/channel-names"
import { ENGRAMIND_INTEGRATION_ID, ENGRAMIND_UPDATED_EVENT } from "../constants"

export const engramindLog = loggerFor({ feature: "engramind" })
export const ENGRAMIND_AUDIT_ENTITY = "Engramind"
export { AcaoAuditoria }

/** Auditoria das operações do Engramind (entrada já sem segredos nem textos de memória). */
export async function auditEngramind(actorId: string, operation: string, acao: AcaoAuditoriaTipo, depois?: Record<string, unknown>): Promise<void> {
    await recordAudit({ userId: actorId, entidade: ENGRAMIND_AUDIT_ENTITY, entidadeId: operation, acao, ...(depois ? { depois } : {}) })
}

/** Avisa as telas da integração (`{ type }`, sem textos nem valores). Nunca lança. */
export async function publishEngramind(payload: { type: string; [key: string]: unknown }): Promise<void> {
    try {
        const { publishToChannels } = await import("@/lib/pusher/channels")
        await publishToChannels([integrationChannel(ENGRAMIND_INTEGRATION_ID)], ENGRAMIND_UPDATED_EVENT, payload)
    } catch (error) {
        engramindLog.debug({ err: error instanceof Error ? error.message : String(error) }, "[engramind] aviso de tempo real não publicado")
    }
}

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
