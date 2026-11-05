import { Schema, model, models, type Model } from "mongoose"
import type { CuratorDecisionRecord } from "../memory-curator"
import type { MigrationReviewStatus } from "../schemas/migration"

/**
 * Coleções da migração das memórias dos agentes para o Engramind (DND-21). O backup é imutável (JSON
 * + SHA-256 do conteúdo); o estado (singleton `agent-memories`) guarda as etapas, as decisões do
 * curador, a revisão e o id do Engramind de cada memória importada.
 */

export interface IMemoryBackup {
    _id: string
    createdAt: Date
    count: number
    sha256: string
    json: string
}

export type MigrationStepStatus = "idle" | "running" | "failed" | "done"

export interface IMigrationStep {
    status: MigrationStepStatus
    error: string | null
    startedAt: Date | null
    finishedAt: Date | null
    progress: { done: number; total: number } | null
}

export interface IMigrationItem {
    sourceId: string
    list: string
    texto: string
    resumo: string
    createdBy: string
    createdAt: Date
    updatedAt: Date
    channel: string | null
    decision: CuratorDecisionRecord | null
    review: { status: MigrationReviewStatus; texto: string | null; categoria: string | null; at: Date | null }
    imported: { engramindId: string; key: string; at: Date; duplicate: boolean } | null
}

export type MigrationStepKey = "backup" | "triage" | "compact" | "import" | "history"

export interface IMemoryMigration {
    _id: string
    backupId: string | null
    steps: Record<MigrationStepKey, IMigrationStep>
    curator: { provider: string; model: string; variant: string | null; agent: string | null; ranAt: Date } | null
    items: IMigrationItem[]
    categoryNotices: string[]
    firstCompletedAt: Date | null
    lastImportAt: Date | null
}

const backupSchema = new Schema<IMemoryBackup>(
    { _id: { type: String, required: true }, createdAt: { type: Date, required: true }, count: Number, sha256: String, json: String },
    { collection: "engramind_memory_backups", versionKey: false },
)

const migrationSchema = new Schema<IMemoryMigration>(
    {
        _id: { type: String, required: true },
        backupId: { type: String, default: null },
        steps: { type: Schema.Types.Mixed, default: null },
        curator: { type: Schema.Types.Mixed, default: null },
        items: { type: Schema.Types.Mixed, default: () => [] },
        categoryNotices: { type: [String], default: [] },
        firstCompletedAt: { type: Date, default: null },
        lastImportAt: { type: Date, default: null },
    },
    { collection: "engramind_memory_migration", versionKey: false, minimize: false },
)

export const MemoryBackup: Model<IMemoryBackup> = (models.EngramindMemoryBackup as Model<IMemoryBackup>) ?? model<IMemoryBackup>("EngramindMemoryBackup", backupSchema)
export const MemoryMigration: Model<IMemoryMigration> = (models.EngramindMemoryMigration as Model<IMemoryMigration>) ?? model<IMemoryMigration>("EngramindMemoryMigration", migrationSchema)

export const MIGRATION_ID = "agent-memories"
/** Coleção antiga (só lida pelo backup; nunca alterada). */
export const LEGACY_MEMORIES_COLLECTION = "agent_memories"
