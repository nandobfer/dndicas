import AuditLog, { logAction as baseLogAction } from "@/core/database/audit-log"
import { headers } from "next/headers"
import { requestAccess } from "./access"
export { default } from "@/core/database/audit-log"
export type { IAuditLog } from "@/core/database/audit-log"
/** Acrescenta o administrador real sem mudar a identidade efetiva da operação. */
export async function logAction(action: string, collection: string, docId: string, userId?: string, details?: Record<string, unknown>) {
    let isRequest = false
    try { await headers(); isRequest = true } catch { /* Jobs, scripts e migrações não possuem requisição. */ }
    if (!isRequest) return baseLogAction(action, collection, docId, userId, details)
    const access = await requestAccess()
    return baseLogAction(action, collection, docId, userId, { ...details,
        ...(access?.dto.simulation ? { realActorId: access.realUserId, effectiveUserId: access.userId, simulation: access.dto.simulation } : {}) })
}
