import { hostname } from "os"
import { dbConnect } from "@/lib/db"
import { CronJobState } from "@/lib/db/models/CronJobState"
import { HEALTH_CHECK_JOB_ID, OPEX_FILES_CLEANUP_JOB_ID, type CronJobConfig } from "@/lib/integrations/catalog"
import { getIntegrationConfig, getInternalBaseUrl } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { nextRunAt, scheduleSignature, validateSchedule } from "@/lib/integrations/schedule"
import { logger } from "@/lib/logger"

/**
 * Agendador interno dos crons.
 *
 * Um tick por minuto em CADA instância (processo Node). Para cada rotina ativa, a instância tenta
 * reivindicar atomicamente o lease no Mongo (`nextRunAt <= agora` e sem lease vigente);
 * somente quem vence executa. O `nextRunAt` já é avançado na reivindicação, então uma
 * execução lenta ou que falha não dispara de novo no minuto seguinte.
 */

export const SCHEDULER_TICK_MS = 60_000
/** Lease máximo de uma execução. Passado o prazo, outra instância pode assumir. */
export const JOB_LEASE_MS = 15 * 60_000
const HTTP_JOB_TIMEOUT_MS = 10 * 60_000

const INSTANCE = `${hostname()}#${process.env.NODE_APP_INSTANCE ?? process.pid}`
const dbg = integrationDebug("crons")

export type InternalJobRunner = (job: CronJobConfig) => Promise<string | void>

const internalRunners = new Map<string, InternalJobRunner>()

export function registerInternalJob(id: string, runner: InternalJobRunner): void {
    internalRunners.set(id, runner)
}

async function runHttpJob(job: CronJobConfig, cronSecret: string | undefined): Promise<string> {
    if (!job.path) throw new Error("Rotina HTTP sem caminho configurado")
    if (!cronSecret) throw new Error("Cron secret não configurado")
    const url = `${await getInternalBaseUrl()}${job.path}`
    dbg.request(`${job.label}: POST ${url}`)
    const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(HTTP_JOB_TIMEOUT_MS),
    })
    const text = await res.text().catch(() => "")
    dbg.response(`${job.label}: HTTP ${res.status}`, { body: text.slice(0, 1000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`)
    return `HTTP ${res.status}`
}

async function executeJob(job: CronJobConfig, cronSecret: string | undefined): Promise<string> {
    if (job.kind === "internal") {
        const runner = internalRunners.get(job.id)
        if (!runner) throw new Error(`Rotina interna "${job.id}" não registrada`)
        return (await runner(job)) ?? "OK"
    }
    return runHttpJob(job, cronSecret)
}

/**
 * Instante de referência do tick para (re)calcular `nextRunAt`: 1 ms antes do minuto atual.
 * O tick roda em hh:mm:01, então calcular "a partir de agora" pularia a rotina agendada para
 * o próprio minuto (edição para 08:51 processada às 08:51:01 cairia em amanhã). Não há
 * execução dupla: quem reivindica já avança `nextRunAt` a partir do instante real.
 */
export function tickReference(now: Date): Date {
    return new Date(Math.floor(now.getTime() / SCHEDULER_TICK_MS) * SCHEDULER_TICK_MS - 1)
}

/**
 * Garante UM documento de estado por rotina e recalcula `nextRunAt` quando o agendamento foi
 * editado (em outra instância, ou antes de o salvamento recalcular).
 *
 * São duas operações de propósito: o upsert só cria (`$setOnInsert`) e o recálculo nunca faz
 * upsert. Um único upsert filtrando por `scheduleSignature: { $ne }` insere um documento novo
 * a cada tick quando o agendamento NÃO mudou. Corrida entre instâncias no upsert gera E11000
 * (índice único de `jobId`) — inofensivo, outra já criou.
 */
export async function syncJobState(job: CronJobConfig, now: Date): Promise<void> {
    const signature = scheduleSignature(job.schedule)
    const reference = tickReference(now)
    try {
        await CronJobState.updateOne(
            { jobId: job.id },
            // `jobId` entra no documento criado pela igualdade do filtro.
            { $setOnInsert: { scheduleSignature: signature, nextRunAt: nextRunAt(job.schedule, reference) } },
            { upsert: true },
        )
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error
    }
    const changed = await CronJobState.updateOne(
        { jobId: job.id, scheduleSignature: { $ne: signature } },
        { $set: { scheduleSignature: signature, nextRunAt: nextRunAt(job.schedule, reference) } },
    )
    if (changed.modifiedCount > 0) {
        dbg.step(`Agendamento de "${job.label}" alterado: próxima em ${nextRunAt(job.schedule, reference).toISOString()}`)
    }
}

/**
 * Recalcula já o `nextRunAt` das rotinas indicadas, a partir de `now` (instante do
 * salvamento). Chamado por `updateIntegration("crons")` para que a próxima execução reflita
 * a edição na hora — sem esperar o tick — e para que uma rotina religada não dispare de
 * imediato por um `nextRunAt` antigo. Uma execução em andamento não é afetada: o lease e o
 * `finishJob` não dependem de `nextRunAt`.
 */
export async function rescheduleJobs(jobs: CronJobConfig[], now: Date = new Date()): Promise<void> {
    for (const job of jobs) {
        if (validateSchedule(job.schedule)) continue
        const next = nextRunAt(job.schedule, now)
        try {
            await CronJobState.updateOne(
                { jobId: job.id },
                { $set: { scheduleSignature: scheduleSignature(job.schedule), nextRunAt: next } },
                { upsert: true },
            )
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error
        }
        dbg.step(`Agendamento de "${job.label}" recalculado: próxima em ${next.toISOString()}`)
    }
}

async function claimJob(job: CronJobConfig, now: Date): Promise<boolean> {
    const claimed = await CronJobState.findOneAndUpdate(
        {
            jobId: job.id,
            nextRunAt: { $lte: now },
            $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }],
        },
        {
            $set: {
                lockedUntil: new Date(now.getTime() + JOB_LEASE_MS),
                lockedBy: INSTANCE,
                lastRunAt: now,
                nextRunAt: nextRunAt(job.schedule, now),
            },
        },
        { new: true },
    )
    return claimed !== null
}

async function finishJob(jobId: string, status: "ok" | "error", startedAt: number, error?: string): Promise<void> {
    await CronJobState.updateOne(
        { jobId, lockedBy: INSTANCE },
        {
            $set: {
                lockedUntil: null,
                lockedBy: null,
                lastFinishedAt: new Date(),
                lastStatus: status,
                lastError: error ? error.slice(0, 1000) : null,
                lastDurationMs: Date.now() - startedAt,
            },
        },
    )
}

export class CronJobRunError extends Error {
    constructor(
        message: string,
        readonly status: 404 | 409,
    ) {
        super(message)
        this.name = "CronJobRunError"
    }
}

export interface ManualRunResult {
    ok: boolean
    message: string
    durationMs: number
}

/**
 * "Executar agora": executa uma rotina SALVA imediatamente, sem esperar o agendamento.
 *
 * Reivindica só o lease (nunca `nextRunAt`): a próxima execução agendada não muda. Com o lease
 * ocupado (execução em andamento em qualquer instância) recusa com 409. Funciona com a rotina
 * desativada e com o agendador desligado — a execução manual independe do agendamento.
 * Falha da rotina não lança: volta `ok: false` e fica gravada no estado, como no tick.
 */
export async function runJobNow(jobId: string, now: Date = new Date()): Promise<ManualRunResult> {
    const config = await getIntegrationConfig("crons")
    const job = config.jobs.find((candidate) => candidate.id === jobId)
    if (!job) throw new CronJobRunError("Rotina não encontrada. Salve as alterações antes de executar.", 404)

    registerBuiltInJobs()
    await dbConnect()
    try {
        await CronJobState.updateOne(
            { jobId: job.id },
            {
                $setOnInsert: {
                    scheduleSignature: scheduleSignature(job.schedule),
                    // Agendamento inválido é ignorado pelo tick; só precisa de um valor (campo obrigatório).
                    nextRunAt: validateSchedule(job.schedule) ? now : nextRunAt(job.schedule, now),
                },
            },
            { upsert: true },
        )
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error
    }

    const claimed = await CronJobState.findOneAndUpdate(
        { jobId: job.id, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
        { $set: { lockedUntil: new Date(now.getTime() + JOB_LEASE_MS), lockedBy: INSTANCE, lastRunAt: now } },
        { new: true },
    )
    if (!claimed) throw new CronJobRunError(`A rotina "${job.label}" já está em execução.`, 409)

    const startedAt = Date.now()
    dbg.step(`[manual] Executando "${job.label}"`, { jobId: job.id, instance: INSTANCE })
    try {
        const message = await executeJob(job, config.cronSecret)
        await finishJob(job.id, "ok", startedAt)
        dbg.success(`[manual] "${job.label}" concluída em ${Date.now() - startedAt} ms`, { message })
        return { ok: true, message, durationMs: Date.now() - startedAt }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await finishJob(job.id, "error", startedAt, message)
        dbg.error(`[manual] "${job.label}" falhou`, error)
        logger.error({ err: error, jobId: job.id }, "[scheduler] Execução manual de rotina falhou")
        return { ok: false, message, durationMs: Date.now() - startedAt }
    }
}

export interface TickResult {
    skipped?: "disabled"
    executed: string[]
}

export async function runSchedulerTick(now: Date = new Date()): Promise<TickResult> {
    const config = await getIntegrationConfig("crons")
    if (!config.schedulerEnabled) return { skipped: "disabled", executed: [] }

    await dbConnect()
    const executed: string[] = []

    for (const job of config.jobs) {
        if (!job.enabled || validateSchedule(job.schedule)) continue
        await syncJobState(job, now)
        if (!(await claimJob(job, now))) continue

        executed.push(job.id)
        const startedAt = Date.now()
        dbg.step(`Executando "${job.label}"`, { jobId: job.id, instance: INSTANCE })
        try {
            const message = await executeJob(job, config.cronSecret)
            await finishJob(job.id, "ok", startedAt)
            dbg.success(`"${job.label}" concluída em ${Date.now() - startedAt} ms`, { message })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await finishJob(job.id, "error", startedAt, message)
            dbg.error(`"${job.label}" falhou`, error)
            logger.error({ err: error, jobId: job.id }, "[scheduler] Rotina agendada falhou")
        }
    }

    // Agente Opex: jobs (prompts agendados) vencidos — ver aicontext/modules/opex-agent.md.
    try {
        const { runDueOpexJobs } = await import("@/features/opex-agent/server/jobs")
        await runDueOpexJobs(now)
    } catch (error) {
        logger.error({ err: error }, "[scheduler] Falha nos jobs do Agente Opex")
    }

    return { executed }
}

/**
 * Registra as rotinas internas nativas. Idempotente. Chamado pelo tick periódico
 * (`startCronScheduler`) e pela rota `/api/routines/scheduler-tick` (disparo sob demanda), onde o
 * `instrumentation.ts` não inicia o agendador em processo.
 */
export function registerBuiltInJobs(): void {
    if (internalRunners.has(HEALTH_CHECK_JOB_ID)) return
    registerInternalJob(HEALTH_CHECK_JOB_ID, async () => {
        const { runAllIntegrationHealthChecks } = await import("../services/integration-test-runner")
        const results = await runAllIntegrationHealthChecks()
        const failing = Object.entries(results).filter(([, r]) => !r.ok).map(([id]) => id)
        return failing.length ? `Com falha: ${failing.join(", ")}` : "Todas as integrações OK"
    })
    registerInternalJob(OPEX_FILES_CLEANUP_JOB_ID, async () => {
        const [{ cleanupPendingOpexFiles }, { purgeExpiredAnonymousSessions }] = await Promise.all([import("@/features/opex-agent/server/files"), import("@/features/opex-agent/server/sessions")])
        const files = await cleanupPendingOpexFiles()
        const sessions = await purgeExpiredAnonymousSessions()
        return sessions ? `${files} · ${sessions} sessão(ões) de visitantes expiradas removidas` : files
    })
}

let started = false

/** Inicia o tick periódico. Idempotente; chamado em `instrumentation.ts`. */
export function startCronScheduler(): void {
    if (started) return
    started = true
    logger.info({ instance: INSTANCE }, "[scheduler] Agendador interno iniciado (liga/desliga em Integrações › Crons)")

    registerBuiltInJobs()

    const tick = () => {
        runSchedulerTick().catch((error) => logger.error({ err: error }, "[scheduler] Falha no tick do agendador"))
    }
    // Alinha ao início do próximo minuto para que "17:30" dispare às 17:30:0x.
    const delay = SCHEDULER_TICK_MS - (Date.now() % SCHEDULER_TICK_MS) + 1000
    const first = setTimeout(() => {
        tick()
        const interval = setInterval(tick, SCHEDULER_TICK_MS)
        interval.unref?.()
    }, delay)
    first.unref?.()
}
