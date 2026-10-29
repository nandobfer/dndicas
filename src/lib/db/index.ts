/**
 * Ponto de entrada do banco para os módulos copiados do Opex: usa a conexão cacheada do core
 * (`@/core/database/db`) e executa as migrações uma única vez por processo (idempotentes).
 * Use sempre `dbConnect()` antes de usar os modelos.
 */

import connectCore from "@/core/database/db"
import { runMigrations } from "./migrations"

let migrationsPromise: Promise<void> | null = null

export async function dbConnect() {
    const conn = await connectCore()
    if (!migrationsPromise) {
        migrationsPromise = runMigrations().catch((error: unknown) => {
            migrationsPromise = null
            throw error
        })
    }
    await migrationsPromise
    return conn
}

export { AcaoAuditoria, recordAudit } from "@/lib/audit/record"
export { createAuditContext, auditPlugin } from "./plugins/audit.plugin"
