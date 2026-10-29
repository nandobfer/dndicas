import { dbConnect, recordAudit, AcaoAuditoria, createAuditContext } from "@/lib/db"
import { Integration } from "@/lib/db/models/Integration"
import { IntegrationStatus, type IIntegrationStatus } from "@/lib/db/models/IntegrationStatus"
import { CronJobState, type ICronJobState } from "@/lib/db/models/CronJobState"
import { IntegrationLog } from "@/lib/db/models/IntegrationLog"
import {
    encryptSecret,
    isSecretBoxConfigured,
    SecretBoxKeyError,
    type EncryptedSecret,
} from "@/lib/crypto/secretBox"
import {
    findMissingConditionalField,
    getIntegrationDef,
    INTEGRATIONS,
    isCardManagedField,
    type CronJobConfig,
    type IntegrationId,
} from "@/lib/integrations/catalog"
import { scheduleSignature } from "@/lib/integrations/schedule"
import { buildResolvedIntegration, getIntegration, isIntegrationConfigured, managedSwaggerUrl } from "@/lib/integrations/config"
import { invalidateStoredIntegrations, loadStoredIntegration } from "@/lib/integrations/store"
import type { IntegrationLogLine } from "@/lib/integrations/log-format"
import type { IntegrationUpdateInput } from "../schemas/integration.schema"
import { runIntegrationEnableHook } from "./enable-hooks"
import type {
    CronJobStateDto,
    IntegrationDetailDto,
    IntegrationHealthDto,
    IntegrationListItemDto,
    IntegrationSecretStateDto,
} from "../types"

export const INTEGRATION_AUDIT_ENTITY = "Integracao"

export class IntegrationUpdateError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 409 = 400,
    ) {
        super(message)
        this.name = "IntegrationUpdateError"
    }
}

/**
 * Marcação de "em andamento" vale só dentro do limite do teste (+ folga): se a instância cair
 * no meio, a bolinha não fica girando para sempre.
 */
export const RUNNING_STALE_MS = 75_000 // INTEGRATION_TEST_TIMEOUT_MS (60s) + 15s de folga

export function toHealth(
    status: Pick<IIntegrationStatus, "status" | "latencyMs" | "message" | "checkedAt" | "source" | "runningSince"> | null | undefined,
    now = Date.now(),
): IntegrationHealthDto {
    if (!status) return { status: "unknown" }
    const runningSince = status.runningSince ? new Date(status.runningSince).getTime() : null
    return {
        // Documento criado só pela marcação de início ainda não tem resultado.
        status: status.status ?? "unknown",
        latencyMs: status.latencyMs,
        message: status.message,
        checkedAt: status.checkedAt ? new Date(status.checkedAt).toISOString() : undefined,
        source: status.source,
        checking: runningSince !== null && now - runningSince < RUNNING_STALE_MS,
    }
}

export async function listIntegrations(): Promise<IntegrationListItemDto[]> {
    await dbConnect()
    const statuses = (await IntegrationStatus.find({ integrationId: { $in: INTEGRATIONS.map((d) => d.id) } }).lean()) as IIntegrationStatus[]
    const statusById = new Map(statuses.map((s) => [s.integrationId, s]))

    return Promise.all(
        INTEGRATIONS.map(async (def) => {
            const resolved = await getIntegration(def.id)
            return {
                id: def.id,
                name: def.name,
                description: def.description,
                environment: resolved.environment,
                debugMode: resolved.debugMode,
                health: toHealth(statusById.get(def.id)),
                ...(def.parent ? { parent: def.parent } : {}),
                configured: isIntegrationConfigured(def, resolved),
            }
        }),
    )
}

function toCronStateDto(state: ICronJobState, now = Date.now()): CronJobStateDto {
    const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : undefined)
    return {
        jobId: state.jobId,
        nextRunAt: iso(state.nextRunAt),
        lastRunAt: iso(state.lastRunAt),
        lastFinishedAt: iso(state.lastFinishedAt),
        lastStatus: state.lastStatus ?? null,
        lastError: state.lastError ?? null,
        lastDurationMs: state.lastDurationMs ?? null,
        running: Boolean(state.lockedUntil && new Date(state.lockedUntil).getTime() > now),
    }
}

/**
 * Rotinas cujo `nextRunAt` precisa ser recalculado ao salvar: ativas e (novas, religadas ou
 * com agendamento alterado). Desativadas ficam de fora — recalculam ao serem religadas.
 */
export function jobsToReschedule(previous: CronJobConfig[], next: CronJobConfig[]): CronJobConfig[] {
    const before = new Map(previous.map((job) => [job.id, job]))
    return next.filter((job) => {
        if (!job.enabled) return false
        const old = before.get(job.id)
        if (!old || !old.enabled) return true
        return scheduleSignature(old.schedule) !== scheduleSignature(job.schedule)
    })
}

export async function getIntegrationDetail(id: IntegrationId): Promise<IntegrationDetailDto> {
    await dbConnect()
    const def = getIntegrationDef(id)
    const stored = await loadStoredIntegration(id)
    const resolved = buildResolvedIntegration(def, stored)
    const status = (await IntegrationStatus.findOne({ integrationId: id }).lean()) as IIntegrationStatus | null

    const publicValues: IntegrationDetailDto["publicValues"] = {}
    const values = resolved.values as unknown as Record<string, unknown>
    for (const field of def.publicFields) {
        if (isCardManagedField(field)) continue
        publicValues[field.key] = (values[field.key] as IntegrationDetailDto["publicValues"][string] | undefined) ?? null
    }

    // NUNCA devolve o valor de um segredo — só se está configurado e de onde vem.
    const secrets: Record<string, IntegrationSecretStateDto> = {}
    for (const field of def.secretFields) {
        const source = resolved.secretSources[field.key] ?? "none"
        secrets[field.key] = {
            configured: source !== "none",
            source,
            unreadable: resolved.secretErrors.includes(field.key),
        }
    }

    let cronStates: CronJobStateDto[] | undefined
    if (id === "crons") {
        const states = (await CronJobState.find({}).lean()) as ICronJobState[]
        cronStates = states.map((state) => toCronStateDto(state))
    }

    return {
        id,
        name: def.name,
        description: def.description,
        environment: resolved.environment,
        debugMode: resolved.debugMode,
        publicValues,
        secrets,
        encryptionKeyConfigured: isSecretBoxConfigured(),
        stored: resolved.stored,
        updatedAt: stored?.updatedAt ? new Date(stored.updatedAt).toISOString() : undefined,
        updatedBy: stored?.updatedBy,
        health: toHealth(status),
        swaggerUrl: (await managedSwaggerUrl(def)) ?? resolved.swaggerUrl ?? null,
        swaggerUrlManaged: Boolean(def.managedSwaggerPath),
        explorerAuth: def.explorer?.authLabel ?? null,
        cronStates,
    }
}

/**
 * Aplica o PATCH. Segredos: `set` criptografa, `clear` grava `null` (desliga, sem voltar ao
 * `.env`), ausente mantém. A auditoria registra QUAIS segredos mudaram, nunca os valores.
 */
export async function updateIntegration(
    id: IntegrationId,
    input: IntegrationUpdateInput,
    actorId: string,
): Promise<IntegrationDetailDto> {
    await dbConnect()
    const def = getIntegrationDef(id)
    const stored = await loadStoredIntegration(id)
    const before = buildResolvedIntegration(def, stored)

    const $set: Record<string, unknown> = {}
    const previousData: Record<string, unknown> = {}
    const newData: Record<string, unknown> = {}

    if (input.environment !== undefined && input.environment !== before.environment) {
        $set.environment = input.environment
        previousData.environment = before.environment
        newData.environment = input.environment
    }
    if (input.debugMode !== undefined && input.debugMode !== before.debugMode) {
        $set.debugMode = input.debugMode
        previousData.debugMode = before.debugMode
        newData.debugMode = input.debugMode
    }

    if (input.swaggerUrl !== undefined && def.managedSwaggerPath) {
        throw new IntegrationUpdateError(
            "A documentação desta integração é servida pelo próprio app e não pode ser alterada",
        )
    }
    if (input.swaggerUrl !== undefined) {
        const next = input.swaggerUrl.trim() || null
        const previous = before.swaggerUrl ?? null
        if (next !== previous) {
            $set.swaggerUrl = next
            previousData.swaggerUrl = previous
            newData.swaggerUrl = next
        }
    }

    const beforeValues = before.values as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(input.publicValues ?? {})) {
        if (value === undefined) continue
        if (JSON.stringify(beforeValues[key]) === JSON.stringify(value)) continue
        $set[`publicValues.${key}`] = value
        previousData[key] = beforeValues[key] ?? null
        newData[key] = value
    }

    // Trocar o modo (ex.: Pusher → Host próprio) exige o campo obrigatório do novo modo.
    const touchedPublic = Object.keys(input.publicValues ?? {})
    const missing = findMissingConditionalField(def.publicFields, { ...beforeValues, ...input.publicValues }, touchedPublic)
    if (missing) throw new IntegrationUpdateError(`${missing.label}: preenchimento obrigatório`)

    for (const [key, action] of Object.entries(input.secrets ?? {})) {
        if (!action) continue
        if (action.action === "clear") {
            $set[`secretValues.${key}`] = null
            previousData[key] = before.secretSources[key] === "none" ? "(vazio)" : "(configurado)"
            newData[key] = "(removido)"
            continue
        }
        let box: EncryptedSecret
        try {
            box = encryptSecret(action.value)
        } catch (error) {
            if (error instanceof SecretBoxKeyError) {
                throw new IntegrationUpdateError(
                    "Não é possível salvar campos privados: configure INTEGRATIONS_ENCRYPTION_KEY no servidor",
                    409,
                )
            }
            throw error
        }
        $set[`secretValues.${key}`] = box
        previousData[key] = before.secretSources[key] === "none" ? "(vazio)" : "(configurado)"
        newData[key] = "(alterado)"
    }

    if (Object.keys($set).length > 0) {
        if (!stored) {
            // Primeiro salvamento (sem seed): materializa o documento com o estado efetivo atual.
            const doc = new Integration({
                integrationId: id,
                environment: before.environment,
                debugMode: before.debugMode,
                publicValues: {},
                secretValues: {},
            })
            doc.set("_auditContext", createAuditContext(actorId))
            await doc.save()
        }
        await Integration.updateOne({ integrationId: id }, { $set, _auditContext: { userId: actorId } })
        invalidateStoredIntegrations()

        if (id === "crons" && input.publicValues?.jobs !== undefined) {
            const previousJobs = (beforeValues.jobs as CronJobConfig[] | undefined) ?? []
            const affected = jobsToReschedule(previousJobs, input.publicValues.jobs as CronJobConfig[])
            if (affected.length > 0) {
                const { rescheduleJobs } = await import("../scheduler/cron-scheduler")
                await rescheduleJobs(affected)
            }
        }

        await recordAudit({
            userId: actorId,
            entidade: INTEGRATION_AUDIT_ENTITY,
            entidadeId: id,
            acao: stored ? AcaoAuditoria.ATUALIZAR : AcaoAuditoria.CRIAR,
            antes: previousData,
            depois: newData,
        })

        // Integração ativável (campo `active`): a transição desligada → ligada dispara o gancho de ativação.
        if (beforeValues.active !== true && newData.active === true) await runIntegrationEnableHook(id, actorId)
    }

    return getIntegrationDetail(id)
}

export async function listIntegrationLogs(
    id: IntegrationId,
    options: { after?: Date; limit?: number; scope?: string } = {},
): Promise<IntegrationLogLine[]> {
    await dbConnect()
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 2000)
    const query: Record<string, unknown> = { integrationId: id }
    if (options.after) query.ts = { $gt: options.after }
    // Escopo: só as linhas de um recurso da integração (ex.: uma central de desenvolvimento).
    if (options.scope) query["data.scope"] = options.scope
    const docs = await IntegrationLog.find(query).sort({ ts: -1 }).limit(limit).lean()
    return docs.reverse().map((doc) => ({
        integrationId: doc.integrationId,
        level: doc.level,
        message: doc.message,
        data: doc.data,
        ts: new Date(doc.ts).toISOString(),
        instance: doc.instance,
    }))
}
