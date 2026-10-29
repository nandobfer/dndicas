import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { OpexJob, OpexSession, type IOpexJob } from "@/lib/db/models/Opex"
import { User } from "@/features/users/models/user"
import { loggerFor } from "@/lib/logger"
import { opexChannel, opexOwnerKey } from "@/lib/pusher/channel-names"
import { publishAppEvent, publishToChannels } from "@/lib/pusher/channels"
import {
    OPEX_JOB_AUDIT_ENTITY,
    OPEX_JOB_FINISHED_EVENT,
    OPEX_JOB_LIST_LIMIT,
    OPEX_JOB_RETENTION_MS,
    OPEX_JOB_UPDATED_EVENT,
    jobModelText,
    resolveRunAt,
    scheduleOf,
    type OpexJobDto,
    type OpexJobFilter,
    type OpexJobFinishedPayload,
    type OpexJobInput,
    type OpexJobListQuery,
    type OpexJobStatus,
} from "../jobs"
import { hasQueuedJob, isTurnActive } from "./hub"
import { sendJobMessage } from "./runner"
import { loadActor, userOpexScope, type OpexServerScope } from "./scope"
import { createSession, opexDb, publishSessionUpdated } from "./sessions"
import { loadOpexSettings, opexAvailability } from "./settings"

const log = loggerFor({ module: "opex-agent", feature: "jobs" })

/** Job "executando" sem turno vivo nem fila depois disto foi perdido (o servidor reiniciou). */
const LOST_AFTER_MS = 2 * 60_000
/** Jobs vencidos disparados por tick (o resto fica para o minuto seguinte). */
const DUE_BATCH = 20

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
const formatDate = (date: Date) => dateFormatter.format(date)
const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null)
const idOf = (id: Types.ObjectId | string | null | undefined) => (id ? id.toString() : null)

/** Jobs exigem usuário logado: visitantes recebem 403 com o motivo. */
function userOfScope(scope: OpexServerScope): { id: string; admin: boolean } {
    if (scope.kind !== "user") throw new DomainError(403, "Faça login para agendar jobs do Agente Opex.", "OPEX_JOB_LOGIN_REQUIRED")
    return { id: scope.actor.id, admin: scope.actor.role === "admin" }
}

/** Jobs visíveis no escopo: o administrador vê todos; o usuário, só os próprios. */
function jobFilterOf(scope: OpexServerScope): Record<string, unknown> {
    const user = userOfScope(scope)
    return user.admin ? {} : { userId: user.id }
}

/** Sessões em que o job pode rodar: as do próprio dono do job. */
const sessionFilterOfUser = (userId: string) => ({ userId, anonymousId: null })

/** Nomes dos usuários donos dos jobs. */
async function namesFor(docs: readonly IOpexJob[]): Promise<Map<string, string>> {
    const ids = [...new Set(docs.map((doc) => doc.userId).filter((id) => Types.ObjectId.isValid(id)))]
    if (!ids.length) return new Map()
    const users = await User.find({ _id: { $in: ids } }).select({ name: 1, username: 1 }).lean<{ _id: Types.ObjectId; name?: string; username: string }[]>()
    return new Map(users.map((item) => [String(item._id), item.name?.trim() || item.username]))
}

export function toJobDto(doc: IOpexJob, names: Map<string, string> = new Map()): OpexJobDto {
    return {
        id: doc._id.toString(),
        title: doc.title,
        prompt: doc.prompt,
        sessionId: idOf(doc.sessionId),
        resultSessionId: idOf(doc.resultSessionId),
        schedule: doc.schedule,
        runAt: new Date(doc.runAt).toISOString(),
        status: doc.status,
        startedAt: iso(doc.startedAt),
        finishedAt: iso(doc.finishedAt),
        delayMs: doc.delayMs ?? null,
        error: doc.error ?? null,
        createdBy: doc.createdBy ?? "user",
        originSessionId: idOf(doc.originSessionId),
        sourceJobId: idOf(doc.sourceJobId),
        origin: { userId: doc.userId, userName: names.get(doc.userId) ?? "Usuário removido" },
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

async function toJobDtos(docs: IOpexJob[]): Promise<OpexJobDto[]> {
    const names = await namesFor(docs)
    return docs.map((doc) => toJobDto(doc, names))
}

function assertJobId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Job não encontrado", "OPEX_JOB_NOT_FOUND")
}

/** Job **no escopo**: de outro usuário responde 404 (não revela existência). */
async function findJob(id: string, scope: OpexServerScope): Promise<IOpexJob> {
    assertJobId(id)
    await opexDb()
    const doc = await OpexJob.findOne({ _id: id, ...jobFilterOf(scope) }).lean<IOpexJob>()
    if (!doc) throw new DomainError(404, "Job não encontrado", "OPEX_JOB_NOT_FOUND")
    return doc
}

/** Telas de administração (`private-app`) e o canal do usuário dono do job. */
async function publishJobEvent(job: Pick<IOpexJob, "userId">, event: string, payload: Record<string, unknown>): Promise<void> {
    await publishAppEvent(event, payload)
    if (job.userId) await publishToChannels([opexChannel(opexOwnerKey({ userId: job.userId }))], event, payload)
}

async function publishJob(job: Pick<IOpexJob, "userId">, id: string, status: OpexJobStatus): Promise<void> {
    await publishJobEvent(job, OPEX_JOB_UPDATED_EVENT, { id, status })
}

function listQuery(filter: OpexJobFilter): Record<string, unknown> {
    if (filter === "scheduled") return { status: { $in: ["scheduled", "running"] } }
    if (filter === "finished") return { status: { $nin: ["scheduled", "running"] } }
    return {}
}

/** Filtros de origem da lista do administrador (o usuário comum só vê os próprios). */
function originQuery(query: Partial<OpexJobListQuery>, adminId: string): Record<string, unknown> {
    if (query.userId) return { userId: query.userId }
    if (query.origin === "mine") return { userId: adminId }
    if (query.origin === "others") return { userId: { $ne: adminId } }
    return {}
}

export async function listOpexJobs(query: Partial<OpexJobListQuery>, scope: OpexServerScope): Promise<OpexJobDto[]> {
    await opexDb()
    const user = userOfScope(scope)
    const filter = query.filter ?? "all"
    const where = { ...listQuery(filter), ...(user.admin ? originQuery(query, user.id) : {}), ...jobFilterOf(scope) }
    const docs = await OpexJob.find(where)
        .sort({ runAt: filter === "scheduled" ? 1 : -1 })
        .limit(OPEX_JOB_LIST_LIMIT)
        .lean<IOpexJob[]>()
    return toJobDtos(docs)
}

export async function getOpexJob(id: string, scope: OpexServerScope): Promise<OpexJobDto> {
    const [dto] = await toJobDtos([await findJob(id, scope)])
    return dto!
}

/** Sessão escolhida precisa existir e ser do dono do job (400: a entrada é que está errada). */
async function assertSessionExists(sessionId: string | null, userId: string): Promise<void> {
    if (!sessionId) return
    const exists = Types.ObjectId.isValid(sessionId) ? await OpexSession.exists({ _id: sessionId, ...sessionFilterOfUser(userId) }) : null
    if (!exists) throw new DomainError(400, "A sessão escolhida não existe mais", "OPEX_JOB_SESSION_NOT_FOUND")
}

function runAtOrThrow(input: OpexJobInput, now: Date): Date {
    const resolved = resolveRunAt(scheduleOf(input), now)
    if ("error" in resolved) throw new DomainError(400, resolved.error, "OPEX_JOB_INVALID_SCHEDULE")
    return resolved.runAt
}

export interface OpexJobOrigin {
    actorId: string
    createdBy: "user" | "agent"
    /** Sessão do agente que agendou (ferramenta). */
    originSessionId?: string | null
}

const objectIdOrNull = (value: string | null | undefined) => (value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null)

/**
 * Cria o job no escopo; "agora" (ou horário já vencido) começa na hora, sem esperar o tick.
 * Reexecução pelo administrador de um job de outro usuário mantém o usuário e a sessão do original.
 */
export async function createOpexJob(input: OpexJobInput, origin: OpexJobOrigin, scope: OpexServerScope, now = new Date()): Promise<OpexJobDto> {
    await opexDb()
    const user = userOfScope(scope)
    const runAt = runAtOrThrow(input, now)
    const source = input.sourceJobId && Types.ObjectId.isValid(input.sourceJobId) ? await OpexJob.findOne({ _id: input.sourceJobId, ...jobFilterOf(scope) }).lean<IOpexJob>() : null
    const inherited = source && source.userId !== user.id ? source : null
    const userId = inherited ? inherited.userId : user.id
    const sessionId = inherited ? idOf(inherited.sessionId) : input.sessionId
    await assertSessionExists(sessionId, userId)
    const doc = await OpexJob.create({
        title: input.title,
        prompt: input.prompt,
        sessionId: objectIdOrNull(sessionId),
        schedule: scheduleOf(input),
        runAt,
        status: "scheduled",
        createdBy: origin.createdBy,
        originSessionId: objectIdOrNull(origin.originSessionId),
        sourceJobId: source?._id ?? null,
        userId,
    })
    const id = doc._id.toString()
    await recordAudit({
        userId: origin.actorId,
        entidade: OPEX_JOB_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.CRIAR,
        depois: { titulo: input.title, execucao: runAt.toISOString(), sessao: sessionId ?? "nova", origem: origin.createdBy, usuario: userId, reexecucaoDe: idOf(source?._id) },
    })
    log.info({ jobId: id, runAt: runAt.toISOString(), createdBy: origin.createdBy, userId }, "[opex] job agendado")
    await publishJob({ userId }, id, "scheduled")
    if (runAt.getTime() <= now.getTime()) await runOpexJob(id, now)
    return getOpexJob(id, scope)
}

/** Edita um job ainda agendado (409 se já saiu da fila; 403 para o administrador num job de outro usuário). */
export async function updateOpexJob(id: string, input: OpexJobInput, actorId: string, scope: OpexServerScope, now = new Date()): Promise<OpexJobDto> {
    const user = userOfScope(scope)
    const before = await findJob(id, scope)
    if (before.userId !== user.id) throw new DomainError(403, "Jobs de outros usuários só podem ser cancelados ou reexecutados.", "OPEX_JOB_READONLY")
    if (before.status !== "scheduled") throw new DomainError(409, "Só jobs agendados podem ser editados", "OPEX_JOB_NOT_SCHEDULED")
    const runAt = runAtOrThrow(input, now)
    await assertSessionExists(input.sessionId, before.userId)
    const updated = await OpexJob.findOneAndUpdate(
        { _id: before._id, status: "scheduled" },
        { $set: { title: input.title, prompt: input.prompt, sessionId: objectIdOrNull(input.sessionId), schedule: scheduleOf(input), runAt } },
        { new: true },
    ).lean<IOpexJob>()
    if (!updated) throw new DomainError(409, "O job começou a executar e não pode mais ser editado", "OPEX_JOB_NOT_SCHEDULED")
    await recordAudit({
        userId: actorId,
        entidade: OPEX_JOB_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { titulo: before.title, execucao: new Date(before.runAt).toISOString(), sessao: idOf(before.sessionId) ?? "nova" },
        depois: { titulo: updated.title, execucao: runAt.toISOString(), sessao: idOf(updated.sessionId) ?? "nova" },
    })
    await publishJob(before, id, "scheduled")
    if (runAt.getTime() <= now.getTime()) await runOpexJob(id, now)
    return getOpexJob(id, scope)
}

/** Cancela um job agendado (409 se já começou). O administrador cancela também os dos outros usuários. */
export async function cancelOpexJob(id: string, actorId: string, scope: OpexServerScope, now = new Date()): Promise<OpexJobDto> {
    const before = await findJob(id, scope)
    const updated = await OpexJob.findOneAndUpdate(
        { _id: before._id, status: "scheduled" },
        { $set: { status: "canceled", finishedAt: now, purgeAt: new Date(now.getTime() + OPEX_JOB_RETENTION_MS) } },
        { new: true },
    ).lean<IOpexJob>()
    if (!updated) throw new DomainError(409, "Só jobs agendados podem ser cancelados", "OPEX_JOB_NOT_SCHEDULED")
    await recordAudit({ userId: actorId, entidade: OPEX_JOB_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ABORTAR, antes: { titulo: before.title, execucao: new Date(before.runAt).toISOString(), usuario: before.userId } })
    await publishJob(before, id, "canceled")
    const [dto] = await toJobDtos([updated])
    return dto!
}

/** Termina o job (falha, aguardando confirmação ou concluído), audita e avisa as telas. */
async function finishJob(job: IOpexJob, status: Extract<OpexJobStatus, "done" | "error" | "awaiting_confirmation">, error: string | null, now = new Date()): Promise<void> {
    const updated = await OpexJob.findOneAndUpdate(
        { _id: job._id, status: "running" },
        { $set: { status, error: error ? error.slice(0, 1000) : null, finishedAt: now, purgeAt: new Date(now.getTime() + OPEX_JOB_RETENTION_MS) } },
        { new: true },
    ).lean<IOpexJob>()
    if (!updated) return
    const id = job._id.toString()
    await recordAudit({
        userId: job.userId,
        entidade: OPEX_JOB_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.EXECUTAR,
        depois: {
            titulo: job.title,
            resultado: status,
            mensagem: error,
            sessao: idOf(updated.resultSessionId),
            atrasoMs: updated.delayMs,
            duracaoMs: updated.startedAt ? now.getTime() - new Date(updated.startedAt).getTime() : null,
        },
    })
    log[status === "error" ? "warn" : "info"]({ jobId: id, status, err: error, userId: job.userId }, "[opex] job terminado")
    await publishJob(job, id, status)
    const payload: OpexJobFinishedPayload = { id, title: job.title, status, sessionId: idOf(updated.resultSessionId), error, userId: job.userId }
    await publishJobEvent(job, OPEX_JOB_FINISHED_EVENT, { ...payload })
}

class JobFailure extends Error {}

/** Agente desligado ou sem modelo: o job espera (não falha) e roda depois, com atraso. */
async function agentReady(): Promise<boolean> {
    const { settings } = await loadOpexSettings()
    return (await opexAvailability(settings)).available
}

/** Usuário dono revalidado no banco (ativo, papel atual). */
async function actorForJob(job: IOpexJob) {
    try {
        return await loadActor(job.userId)
    } catch (error) {
        throw new JobFailure(error instanceof Error ? error.message : String(error))
    }
}

/**
 * Executa um job agendado: reivindica (atômico, `scheduled` → `running`), resolve o escopo (usuário
 * revalidado no banco) e a sessão (cria uma nova quando não há escolhida) e envia o prompt. O turno
 * roda em segundo plano e conclui o job no fim (`finishJobTurn`). Com a sessão respondendo, o prompt
 * espera na fila dela. Com o agente indisponível, o job continua agendado.
 */
export async function runOpexJob(id: string, now = new Date(), ready?: boolean): Promise<"started" | "deferred" | "skipped"> {
    await opexDb()
    const pending = await OpexJob.exists({ _id: id, status: "scheduled" })
    if (!pending) return "skipped"
    if (!(ready ?? (await agentReady()))) return "deferred"
    const job = await OpexJob.findOneAndUpdate({ _id: new Types.ObjectId(id), status: "scheduled" }, { $set: { status: "running", startedAt: now, error: null } }, { new: true }).lean<IOpexJob>()
    if (!job) return "skipped"
    const delayMs = Math.max(0, now.getTime() - new Date(job.runAt).getTime())
    await OpexJob.updateOne({ _id: job._id }, { $set: { delayMs } })
    await publishJob(job, id, "running")
    try {
        const scope: OpexServerScope = userOpexScope(await actorForJob(job))
        let sessionId = idOf(job.sessionId)
        if (sessionId) {
            const exists = await OpexSession.exists({ _id: sessionId, ...sessionFilterOfUser(job.userId) })
            if (!exists) throw new JobFailure("A sessão escolhida para o job foi excluída: reexecute o job em uma sessão nova")
        } else {
            sessionId = (await createSession(job.userId, scope)).id
            await OpexSession.updateOne({ _id: sessionId }, { $set: { title: job.title.slice(0, 120) } })
            await publishSessionUpdated(sessionId)
        }
        await OpexJob.updateOne({ _id: job._id }, { $set: { resultSessionId: new Types.ObjectId(sessionId) } })
        const result = await sendJobMessage(
            sessionId,
            {
                kind: "job",
                text: jobModelText({ ...job, createdAt: new Date(job.createdAt), runAt: new Date(job.runAt), delayMs }, formatDate),
                display: job.prompt,
                job: { id, title: job.title },
            },
            scope,
        )
        log.info({ jobId: id, sessionId, result, delayMs, userId: job.userId }, "[opex] job iniciado")
        await publishJob(job, id, "running")
    } catch (error) {
        await finishJob({ ...job, delayMs }, "error", error instanceof Error ? error.message : String(error))
    }
    return "started"
}

/** Fim do turno do job (chamado pelo runner). */
export async function finishJobTurn(jobId: string, outcome: { status: "complete" | "interrupted" | "error"; error: string | null; pendingConfirmation: boolean }): Promise<void> {
    await opexDb()
    const job = await OpexJob.findById(jobId).lean<IOpexJob>()
    if (!job || job.status !== "running") return
    if (outcome.status === "interrupted") return finishJob(job, "error", outcome.error ?? "Resposta interrompida")
    if (outcome.status === "error") return finishJob(job, "error", outcome.error ?? "A resposta falhou")
    return finishJob(job, outcome.pendingConfirmation ? "awaiting_confirmation" : "done", null)
}

/** "Executando" sem turno vivo nem fila neste processo: o servidor reiniciou no meio. */
async function recoverLostJobs(now: Date): Promise<void> {
    const running = await OpexJob.find({ status: "running", startedAt: { $lte: new Date(now.getTime() - LOST_AFTER_MS) } }).lean<IOpexJob[]>()
    for (const job of running) {
        const sessionId = idOf(job.resultSessionId)
        if (hasQueuedJob(job._id.toString()) || (sessionId && isTurnActive(sessionId))) continue
        await finishJob(job, "error", "O turno do job foi perdido (o servidor reiniciou durante a execução)", now)
    }
}

/**
 * Tick dos jobs (ponto de montagem em `runSchedulerTick`): recupera os perdidos e dispara os
 * vencidos — também os atrasados (app desligado ou agendador parado no horário). Esperam enquanto o
 * agente estiver desligado ou sem modelo.
 */
export async function runDueOpexJobs(now = new Date()): Promise<string[]> {
    await opexDb()
    await recoverLostJobs(now)
    if (!(await agentReady())) return []
    const due = await OpexJob.find({ status: "scheduled", runAt: { $lte: now } })
        .sort({ runAt: 1 })
        .limit(DUE_BATCH)
        .select({ _id: 1 })
        .lean<Pick<IOpexJob, "_id">[]>()
    const started: string[] = []
    for (const item of due) {
        const id = item._id.toString()
        try {
            if ((await runOpexJob(id, now, true)) === "started") started.push(id)
        } catch (error) {
            log.error({ err: error, jobId: id }, "[opex] falha ao disparar o job")
        }
    }
    return started
}
