import { Types } from "mongoose"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { publishToChannels } from "@/lib/pusher/channels"
import { opexChannel, opexOwnerKey, type OpexOwnerKey } from "@/lib/pusher/channel-names"
import { OPEX_AUDIT_ENTITY, OPEX_DEFAULT_TITLE, OPEX_SESSION_DELETED_EVENT, OPEX_SESSION_UPDATED_EVENT } from "../constants"
import { opexFileKind, opexFilePath } from "../files"
import type { OpexFileDto, OpexMessageDto, OpexSessionDetailDto, OpexSessionDto } from "../types"
import { forgetSession, isTurnActive } from "./hub"
import { sessionFilterOf, type OpexServerScope } from "./scope"
import { OpexJob, OpexMessage, OpexPendingAction, OpexSession, type IOpexFileRef, type IOpexMessage, type IOpexSession } from "@/lib/db/models/Opex"

/** Conecta ao banco (os índices das coleções vêm da migração `ensure-opex-indexes`). */
export async function opexDb(): Promise<void> {
    await dbConnect()
}

type SessionDoc = IOpexSession & { _id: Types.ObjectId }
type MessageDoc = IOpexMessage & { _id: Types.ObjectId }

export function toSessionDto(doc: SessionDoc): OpexSessionDto {
    return {
        id: doc._id.toString(),
        title: doc.title,
        summary: doc.summary ?? "",
        titleSource: doc.titleSource ?? "auto",
        status: doc.status ?? "idle",
        lastError: doc.lastError ?? null,
        archived: Boolean(doc.archived),
        messageCount: doc.messageCount ?? 0,
        lastMessageAt: new Date(doc.lastMessageAt ?? doc.createdAt).toISOString(),
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

export function toFileDto(file: IOpexFileRef): OpexFileDto {
    return { id: file.id, name: file.name, mediaType: file.mediaType, size: file.size, kind: opexFileKind(file.mediaType, file.name), url: opexFilePath(file.id) }
}

export function toMessageDto(doc: MessageDoc): OpexMessageDto {
    return {
        id: doc._id.toString(),
        role: doc.role,
        kind: doc.kind ?? "message",
        job: doc.job ?? null,
        text: doc.text ?? "",
        files: (doc.files ?? []).map(toFileDto),
        parts: doc.parts ?? [],
        status: doc.status ?? "complete",
        error: doc.error ?? null,
        usage: doc.usage ?? null,
        durationMs: doc.durationMs ?? null,
        model: doc.model ?? null,
        createdAt: new Date(doc.createdAt).toISOString(),
    }
}

export function assertSessionId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
}

/** Canal do dono gravado na sessão (usuário ou visitante). */
function ownerKeyOfSession(doc: Pick<IOpexSession, "userId" | "anonymousId">): OpexOwnerKey | null {
    if (doc.userId) return opexOwnerKey({ userId: doc.userId })
    if (doc.anonymousId) return opexOwnerKey({ anonymousId: doc.anonymousId })
    return null
}

/** Avisa o dono da sessão (`private-opex-u-{userId}` ou `private-opex-a-{anonymousId}`). */
export async function publishSessionUpdated(id: string): Promise<void> {
    const doc = await OpexSession.findById(id).select({ userId: 1, anonymousId: 1 }).lean<Pick<IOpexSession, "userId" | "anonymousId">>()
    const key = doc ? ownerKeyOfSession(doc) : null
    if (key) await publishToChannels([opexChannel(key)], OPEX_SESSION_UPDATED_EVENT, { id })
}

/** Mesma escolha de canal do `publishSessionUpdated`, para a exclusão. */
async function publishSessionDeleted(session: Pick<IOpexSession, "userId" | "anonymousId">, id: string): Promise<void> {
    const key = ownerKeyOfSession(session)
    if (key) await publishToChannels([opexChannel(key)], OPEX_SESSION_DELETED_EVENT, { id })
}

/**
 * "Respondendo" sem turno vivo neste processo (servidor reiniciou no meio do turno): volta a ociosa
 * com o aviso, para a sessão não ficar presa.
 */
async function reconcile(doc: SessionDoc): Promise<SessionDoc> {
    if (doc.status !== "running" || isTurnActive(doc._id.toString())) return doc
    const lastError = "A resposta foi interrompida (o servidor reiniciou durante o turno)."
    await OpexSession.updateOne({ _id: doc._id, status: "running" }, { $set: { status: "error", lastError } })
    return { ...doc, status: "error", lastError }
}

/** Sessão **no escopo**: de outro usuário/visitante responde 404 (não revela existência). */
export async function loadSession(id: string, scope: OpexServerScope): Promise<SessionDoc> {
    assertSessionId(id)
    await opexDb()
    const doc = await OpexSession.findOne({ _id: id, ...sessionFilterOf(scope) }).lean<SessionDoc>()
    if (!doc) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
    return reconcile(doc)
}

/** Sessão sem filtro de escopo: usada só para reconstruir o escopo gravado (follow-up/confirmação). */
export async function loadSessionRaw(id: string): Promise<SessionDoc> {
    assertSessionId(id)
    await opexDb()
    const doc = await OpexSession.findById(id).lean<SessionDoc>()
    if (!doc) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
    return reconcile(doc)
}

export async function listSessions(scope: OpexServerScope): Promise<OpexSessionDto[]> {
    await opexDb()
    const docs = await OpexSession.find(sessionFilterOf(scope)).sort({ lastMessageAt: -1 }).limit(1000).lean<SessionDoc[]>()
    return Promise.all(docs.map(async (doc) => toSessionDto(await reconcile(doc))))
}

export async function getSessionDetail(id: string, scope: OpexServerScope): Promise<OpexSessionDetailDto> {
    const session = await loadSession(id, scope)
    const messages = await OpexMessage.find({ sessionId: session._id }).sort({ seq: 1 }).select({ modelMessages: 0 }).lean<MessageDoc[]>()
    return { session: toSessionDto(session), messages: messages.map(toMessageDto) }
}

/** Validade da sessão de visitante a partir de agora (renovada a cada turno). */
export async function anonymousExpiry(now = new Date()): Promise<Date> {
    const { loadOpexSettings } = await import("./settings")
    const { settings } = await loadOpexSettings()
    return new Date(now.getTime() + settings.anonymous.sessionTtlDays * 24 * 60 * 60 * 1000)
}

export async function createSession(actorId: string, scope: OpexServerScope): Promise<OpexSessionDto> {
    await opexDb()
    const doc = await OpexSession.create({
        title: OPEX_DEFAULT_TITLE,
        summary: "",
        lastMessageAt: new Date(),
        userId: scope.kind === "user" ? scope.actor.id : null,
        anonymousId: scope.kind === "anonymous" ? scope.anonymousId : null,
        expiresAt: scope.kind === "anonymous" ? await anonymousExpiry() : null,
    })
    await recordAudit({ userId: actorId, entidade: OPEX_AUDIT_ENTITY, entidadeId: doc._id.toString(), acao: AcaoAuditoria.CRIAR, depois: { titulo: doc.title } })
    await publishSessionUpdated(doc._id.toString())
    return toSessionDto(doc.toObject() as SessionDoc)
}

export async function updateSession(id: string, input: { title?: string; archived?: boolean }, actorId: string, scope: OpexServerScope): Promise<OpexSessionDto> {
    const before = await loadSession(id, scope)
    const $set: Partial<IOpexSession> = {}
    if (input.title !== undefined) Object.assign($set, { title: input.title, titleSource: "manual" as const })
    if (input.archived !== undefined) $set.archived = input.archived
    const doc = await OpexSession.findByIdAndUpdate(id, { $set }, { new: true }).lean<SessionDoc>()
    if (!doc) throw new DomainError(404, "Sessão não encontrada", "OPEX_SESSION_NOT_FOUND")
    await recordAudit({
        userId: actorId,
        entidade: OPEX_AUDIT_ENTITY,
        entidadeId: id,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { titulo: before.title, arquivada: before.archived },
        depois: { titulo: doc.title, arquivada: doc.archived },
    })
    await publishSessionUpdated(id)
    return toSessionDto(doc)
}

/** Apaga uma sessão inteira: arquivos (storage + metadados), mensagens, ações pendentes e a sessão. */
async function purgeSession(sessionId: Types.ObjectId): Promise<void> {
    const id = sessionId.toString()
    forgetSession(id)
    const { deleteSessionFiles } = await import("./files")
    await deleteSessionFiles(id)
    await Promise.all([OpexMessage.deleteMany({ sessionId }), OpexPendingAction.deleteMany({ sessionId }), OpexSession.deleteOne({ _id: sessionId })])
}

/** Sessões de visitantes vencidas (TTL): apagadas pela rotina de limpeza. Devolve quantas saíram. */
export async function purgeExpiredAnonymousSessions(now = new Date()): Promise<number> {
    await opexDb()
    const expired = await OpexSession.find({ anonymousId: { $ne: null }, expiresAt: { $ne: null, $lte: now }, status: { $ne: "running" } })
        .select({ _id: 1 })
        .limit(200)
        .lean<Pick<SessionDoc, "_id">[]>()
    for (const session of expired) await purgeSession(session._id)
    return expired.length
}

/** Usuário excluído: apaga as sessões do agente, mensagens, ações, arquivos e jobs dele. */
export async function deleteUserOpexData(userId: string): Promise<void> {
    await opexDb()
    await OpexJob.deleteMany({ userId })
    const sessions = await OpexSession.find({ userId }).select({ _id: 1 }).lean<Pick<SessionDoc, "_id">[]>()
    for (const session of sessions) await purgeSession(session._id)
}

export async function deleteSession(id: string, actorId: string, scope: OpexServerScope): Promise<void> {
    const session = await loadSession(id, scope)
    // Arquivos primeiro (objetos no storage + metadados), depois o resto da sessão.
    await purgeSession(session._id)
    await recordAudit({ userId: actorId, entidade: OPEX_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { titulo: session.title, mensagens: session.messageCount } })
    await publishSessionDeleted(session, id)
}
