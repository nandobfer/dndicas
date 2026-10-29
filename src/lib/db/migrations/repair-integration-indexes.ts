import type { Types } from 'mongoose'
import { CronJobState } from '@/lib/db/models/CronJobState'
import { Integration } from '@/lib/db/models/Integration'
import { IntegrationLog } from '@/lib/db/models/IntegrationLog'
import { IntegrationStatus } from '@/lib/db/models/IntegrationStatus'
import type { CronJobConfig } from '@/lib/integrations/catalog'
import { nextRunAt, scheduleSignature, validateSchedule } from '@/lib/integrations/schedule'
import { logger } from '@/lib/logger'

/**
 * Repara as coleções das integrações. Idempotente; roda a cada boot.
 *
 * 1. Os índices dos models (único de `jobId`/`integrationId`, TTL de 48h dos logs) nunca foram
 *    criados pelo autoIndex do Mongoose — os models são compilados pelo `instrumentation.ts`
 *    antes da conexão, com `bufferCommands: false`. Sem o índice único, o agendador antigo
 *    inseria um estado de rotina novo a cada tick. Aqui os índices são criados explicitamente.
 * 2. Antes disso, remove os duplicados (o índice único não seria criado com eles), mantendo
 *    um documento por chave, e recalcula o `nextRunAt` das rotinas a partir da configuração.
 */

interface DuplicateGroup {
    _id: string
    keep: Types.ObjectId
    count: number
}

async function dedupeCronJobStates(now: Date): Promise<number> {
    // Mantém a última execução real; sem nenhuma, o documento mais antigo.
    const groups = (await CronJobState.aggregate([
        { $sort: { lastRunAt: -1, _id: 1 } },
        { $group: { _id: '$jobId', keep: { $first: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ])) as DuplicateGroup[]
    if (groups.length === 0) return 0

    let removed = 0
    for (const group of groups) {
        const result = await CronJobState.deleteMany({ jobId: group._id, _id: { $ne: group.keep } })
        removed += result.deletedCount ?? 0
    }

    // O documento mantido pode estar com um agendamento velho: recalcula pela configuração.
    const config = (await Integration.findOne({ integrationId: 'crons' }).lean()) as
        | { publicValues?: { jobs?: CronJobConfig[] } }
        | null
    for (const job of config?.publicValues?.jobs ?? []) {
        if (!groups.some((group) => group._id === job.id) || validateSchedule(job.schedule)) continue
        await CronJobState.updateOne(
            { jobId: job.id },
            { $set: { scheduleSignature: scheduleSignature(job.schedule), nextRunAt: nextRunAt(job.schedule, now) } },
        )
    }
    return removed
}

async function dedupeIntegrationStatuses(): Promise<number> {
    const groups = (await IntegrationStatus.aggregate([
        { $sort: { checkedAt: -1, _id: 1 } },
        { $group: { _id: '$integrationId', keep: { $first: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ])) as DuplicateGroup[]
    let removed = 0
    for (const group of groups) {
        const result = await IntegrationStatus.deleteMany({ integrationId: group._id, _id: { $ne: group.keep } })
        removed += result.deletedCount ?? 0
    }
    return removed
}

export async function repairIntegrationIndexes(now: Date = new Date()): Promise<void> {
    const removedJobs = await dedupeCronJobStates(now)
    const removedStatuses = await dedupeIntegrationStatuses()
    if (removedJobs || removedStatuses) {
        logger.warn(
            { removedJobs, removedStatuses },
            '[migration] Estados duplicados das integrações removidos',
        )
    }

    // Cada coleção isolada: falha em uma (ex.: conflito de opções) não impede as outras.
    const models = [
        ['integration_cron_jobs', CronJobState],
        ['integration_statuses', IntegrationStatus],
        ['integration_logs', IntegrationLog],
        ['integration_configs', Integration],
    ] as const
    for (const [collection, model] of models) {
        try {
            await model.createIndexes()
        } catch (err) {
            logger.error({ err, collection }, '[migration] Falha ao criar os índices das integrações')
        }
    }
}
