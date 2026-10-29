import type { Query, Schema } from "mongoose"

/**
 * Campos de auditoria inline (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`).
 *
 * Adaptado do Smart Desk: o contexto é passado em `_auditContext: { userId }` no documento
 * ou no update. Diferença deliberada: sem contexto, grava `"system"` em vez de lançar —
 * operações de sistema (rotinas, migrações) também escrevem.
 * A trilha de EVENTOS continua em `AuditLog` (`recordAudit`).
 */

export interface AuditFields {
    createdBy: string
    createdAt: Date
    updatedBy: string
    updatedAt: Date
}

export const SYSTEM_USER = "system"

interface UpdateWithAuditContext extends Record<string, unknown> {
    _auditContext?: { userId: string }
    $set?: Record<string, unknown>
    $setOnInsert?: Record<string, unknown>
}

export function auditPlugin(schema: Schema) {
    schema.add({
        createdBy: { type: String, immutable: true, default: SYSTEM_USER },
        createdAt: { type: Date, immutable: true, default: Date.now },
        updatedBy: { type: String, default: SYSTEM_USER },
        updatedAt: { type: Date, default: Date.now },
    })

    schema
        .virtual("_auditContext")
        .get(function (this: { __auditContext?: { userId: string } }) {
            return this.__auditContext
        })
        .set(function (this: { __auditContext?: { userId: string } }, value: { userId: string }) {
            this.__auditContext = value
        })

    schema.pre("validate", function (this: Record<string, unknown> & { isNew: boolean; __auditContext?: { userId: string } }) {
        const userId = this.__auditContext?.userId ?? SYSTEM_USER
        const now = new Date()
        if (this.isNew) {
            this.createdBy = userId
            this.createdAt = now
        }
        this.updatedBy = userId
        this.updatedAt = now
    })

    const onUpdate = function (this: Query<unknown, unknown>) {
        const update = (this.getUpdate() ?? {}) as UpdateWithAuditContext
        const userId = update._auditContext?.userId ?? SYSTEM_USER
        delete update._auditContext
        update.$set = { ...(update.$set ?? {}), updatedBy: userId, updatedAt: new Date() }
        if (this.getOptions().upsert) {
            update.$setOnInsert = { createdBy: userId, createdAt: new Date(), ...(update.$setOnInsert ?? {}) }
        }
        this.setUpdate(update)
    }
    schema.pre("findOneAndUpdate", onUpdate)
    schema.pre(["updateOne", "updateMany"], onUpdate)
}

export function createAuditContext(userId: string | null | undefined): { userId: string } {
    return { userId: userId || SYSTEM_USER }
}
