import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { fallbackAttachmentName, formatAttachmentSize, isInlineAttachmentMime, safeAttachmentName } from "@/lib/attachments"
import { OpexFile, type IOpexFile, type IOpexFileRef } from "@/lib/db/models/Opex"
import { loggerFor } from "@/lib/logger"
import { copyFile, deleteFile, getFileObject, getUploadUrl, headFile, storageErrorInfo } from "@/lib/storage/s3"
import { OPEX_FILE_PENDING_TTL_MS, OPEX_FILE_TEXT_INLINE_MAX, OPEX_FILE_UPLOAD_URL_TTL_SECONDS, type OpexProviderId } from "../constants"
import { opexFileDelivery, opexFileKind, opexFileReference, opexFileWeight, opexMaxBytes } from "../files"
import type { OpexFilesSettings, ReserveOpexFileInput } from "../schemas"
import type { OpexFileDto, OpexFileReservationDto } from "../types"
import type { OpexServerScope } from "./scope"
import { loadSession, opexDb, toFileDto } from "./sessions"

/**
 * Arquivos do chat do Agente Opex — SOMENTE servidor. O binário vai direto do navegador ao
 * **Storage S3** por URL assinada (mesmo fluxo dos anexos de tarefa): a reserva grava o metadado e
 * assina o PUT para uma chave temporária; a confirmação confere o objeto (HeadObject, tamanho) e o
 * promove à chave definitiva. `opex_files` guarda só metadados. A mensagem guarda os metadados e o
 * histórico do modelo, marcadores `opex-file` trocados pelo conteúdo (baixado do storage) a cada turno.
 */

const FALLBACK_MIME = "application/octet-stream"
const MIME_PATTERN = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/

/**
 * Tipo declarado pelo navegador, normalizado: sem parâmetros, só `tipo/subtipo` válido. Tipos ativos
 * (HTML, SVG, XML, JavaScript) viram `application/octet-stream`: nunca são servidos como página.
 */
export function normalizeOpexMediaType(raw: string | null | undefined): string {
    const mime = (raw ?? "").split(";")[0]!.trim().toLowerCase()
    if (!MIME_PATTERN.test(mime)) return FALLBACK_MIME
    if (/(html|svg|xml|javascript|ecmascript)/.test(mime)) return FALLBACK_MIME
    return mime
}
const log = loggerFor({ module: "opex-agent", feature: "files" })

export type OpexFileDoc = IOpexFile & { _id: Types.ObjectId }

/** Marcador do histórico (formato próprio, nunca enviado ao provedor). */
export interface OpexFileMarker {
    type: "opex-file"
    fileId: string
    /** Peso no orçamento do histórico (caracteres). */
    weight: number
}

export const isFileMarker = (value: unknown): value is OpexFileMarker =>
    typeof value === "object" && value !== null && (value as { type?: unknown }).type === "opex-file" && typeof (value as { fileId?: unknown }).fileId === "string"

const refOf = (doc: Pick<OpexFileDoc, "_id" | "name" | "mediaType" | "size">): IOpexFileRef => ({ id: doc._id.toString(), name: doc.name, mediaType: doc.mediaType, size: doc.size })

function assertFileId(id: string): void {
    if (!Types.ObjectId.isValid(id)) throw new DomainError(404, "Arquivo não encontrado", "OPEX_FILE_NOT_FOUND")
}

/** Arquivo **no escopo**: a sessão dona precisa ser visível para quem pede (404 nos demais casos). */
async function findFile(id: string, scope: OpexServerScope): Promise<OpexFileDoc> {
    assertFileId(id)
    await opexDb()
    const doc = await OpexFile.findById(id).lean<OpexFileDoc>()
    if (!doc) throw new DomainError(404, "Arquivo não encontrado", "OPEX_FILE_NOT_FOUND")
    await loadSession(doc.sessionId.toString(), scope)
    return doc
}

async function removeObjectQuietly(key: string | null | undefined): Promise<boolean> {
    if (!key) return true
    try {
        await deleteFile(key)
        return true
    } catch (error) {
        log.warn({ err: error, key }, "[opex] falha ao remover o objeto no storage")
        return false
    }
}

function tooLarge(size: number, limits: OpexFilesSettings): DomainError {
    return new DomainError(413, `O arquivo tem ${formatAttachmentSize(size)}: o limite é ${formatAttachmentSize(opexMaxBytes(limits.maxSizeMb))}`, "OPEX_FILE_TOO_LARGE")
}

// ── Envio em duas fases ────────────────────────────────────────────────────

/** Reserva o envio de um arquivo para a próxima mensagem (fica pendente até ir numa mensagem). */
export async function reserveOpexFile(sessionId: string, input: ReserveOpexFileInput, limits: OpexFilesSettings, scope: OpexServerScope): Promise<OpexFileReservationDto> {
    await loadSession(sessionId, scope)
    if (input.size > opexMaxBytes(limits.maxSizeMb)) throw tooLarge(input.size, limits)
    const mediaType = normalizeOpexMediaType(input.mediaType)
    const name = safeAttachmentName(input.name.trim() || fallbackAttachmentName(mediaType))
    const _id = new Types.ObjectId()
    const id = _id.toString()
    const uploadKey = `opex/tmp/${id}/${name}`
    await OpexFile.create({ _id, sessionId: new Types.ObjectId(sessionId), messageId: null, pending: true, ready: false, name, mediaType, size: input.size, key: `opex/${sessionId}/${id}/${name}`, uploadKey })
    const url = await getUploadUrl(uploadKey, mediaType, OPEX_FILE_UPLOAD_URL_TTL_SECONDS, "browser")
    return { id, method: "PUT", url, headers: { "Content-Type": mediaType }, expiresIn: OPEX_FILE_UPLOAD_URL_TTL_SECONDS }
}

async function discard(doc: OpexFileDoc): Promise<void> {
    await removeObjectQuietly(doc.uploadKey)
    await OpexFile.deleteOne({ _id: doc._id })
}

/**
 * Confirma o envio: confere o objeto no storage (tamanho real e limite), promove para a chave
 * definitiva e marca pronto. Idempotente. Só a ausência comprovada do objeto descarta a reserva;
 * recusa de acesso e indisponibilidade viram 502 com a reserva preservada (repetir sem reenviar).
 */
export async function completeOpexFile(id: string, limits: OpexFilesSettings, scope: OpexServerScope): Promise<OpexFileDto> {
    const doc = await findFile(id, scope)
    if (doc.ready) return toFileDto(refOf(doc))
    let head: { contentLength: number | undefined; contentType: string | undefined }
    try {
        head = await headFile(doc.uploadKey)
    } catch (error) {
        const info = storageErrorInfo(error)
        log.warn({ err: error, fileId: id, httpStatus: info.httpStatus, code: info.code, kind: info.kind }, "[opex] falha ao conferir o arquivo na confirmação")
        if (info.kind !== "not_found") throw new DomainError(502, "Não foi possível confirmar o arquivo no storage. Tente novamente em instantes.", "OPEX_FILE_STORAGE_UNAVAILABLE")
        await discard(doc)
        throw new DomainError(400, "O arquivo não chegou ao storage. Envie de novo.", "OPEX_FILE_NOT_UPLOADED")
    }
    // A URL assinada fixa o Content-Type; um objeto com outro tipo não veio por ela.
    const storedType = head.contentType?.split(";")[0]?.trim().toLowerCase()
    if (storedType && storedType !== doc.mediaType) {
        await discard(doc)
        throw new DomainError(400, "O tipo do arquivo enviado não confere com o reservado. Envie de novo.", "OPEX_FILE_TYPE_MISMATCH")
    }
    const size = head.contentLength ?? 0
    if (size <= 0) {
        await discard(doc)
        throw new DomainError(400, "O arquivo enviado está vazio.", "OPEX_FILE_EMPTY")
    }
    if (size > opexMaxBytes(limits.maxSizeMb)) {
        await discard(doc)
        throw tooLarge(size, limits)
    }
    try {
        await copyFile(doc.uploadKey, doc.key)
    } catch (error) {
        log.warn({ err: error, fileId: id }, "[opex] falha ao promover o arquivo para a chave definitiva")
        throw new DomainError(502, "Não foi possível finalizar o arquivo no storage. Tente novamente em instantes.", "OPEX_FILE_STORAGE_UNAVAILABLE")
    }
    await removeObjectQuietly(doc.uploadKey)
    const mediaType = doc.mediaType
    await OpexFile.updateOne({ _id: doc._id }, { $set: { ready: true, size, mediaType } })
    return toFileDto(refOf({ ...doc, size, mediaType }))
}

/** Remove um arquivo ainda não enviado numa mensagem (o chip removido antes de mandar). */
export async function deletePendingOpexFile(id: string, scope: OpexServerScope): Promise<void> {
    const doc = await findFile(id, scope)
    if (!doc.pending) throw new DomainError(409, "O arquivo já foi enviado numa mensagem", "OPEX_FILE_SENT")
    await removeObjectQuietly(doc.uploadKey)
    await removeObjectQuietly(doc.key)
    await OpexFile.deleteOne({ _id: doc._id })
}

/** Conteúdo do arquivo por rota autenticada: imagem, áudio e vídeo inline; o resto sempre baixa. */
export async function opexFileContent(id: string, options: { download?: boolean; range?: string } = {}, scope: OpexServerScope): Promise<Response> {
    const doc = await findFile(id, scope)
    if (!doc.ready) throw new DomainError(404, "Arquivo não encontrado", "OPEX_FILE_NOT_FOUND")
    let file
    try {
        file = await getFileObject(doc.key, { range: options.range })
    } catch (error) {
        const info = storageErrorInfo(error)
        if (info.kind === "not_found") throw new DomainError(404, "Arquivo não encontrado", "OPEX_FILE_NOT_FOUND")
        throw new DomainError(502, "Não foi possível carregar o arquivo. Tente novamente em instantes.", "OPEX_FILE_STORAGE_UNAVAILABLE")
    }
    const mediaType = doc.mediaType || FALLBACK_MIME
    const inline = !options.download && isInlineAttachmentMime(mediaType)
    const headers: Record<string, string> = {
        "Content-Type": mediaType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": file.acceptRanges ?? "bytes",
    }
    if (file.contentLength != null) headers["Content-Length"] = String(file.contentLength)
    if (file.contentRange) headers["Content-Range"] = file.contentRange
    return new Response(file.body, { status: file.contentRange ? 206 : 200, headers })
}

// ── Vínculo à mensagem e histórico ─────────────────────────────────────────

/**
 * Vincula os arquivos pendentes e confirmados à mensagem (atômico por arquivo: um arquivo não vai em
 * duas mensagens). Recusa arquivo de outra sessão, ainda em envio, já usado ou acima do limite.
 */
export async function claimOpexFiles(sessionId: string, messageId: Types.ObjectId, fileIds: readonly string[], limits: OpexFilesSettings): Promise<IOpexFileRef[]> {
    const ids = [...new Set(fileIds)]
    if (!ids.length) return []
    if (ids.length > limits.maxPerMessage) throw new DomainError(400, `Envie até ${limits.maxPerMessage} arquivo(s) por mensagem`, "OPEX_TOO_MANY_FILES")
    ids.forEach(assertFileId)
    const session = new Types.ObjectId(sessionId)
    const docs = await OpexFile.find({ _id: { $in: ids }, sessionId: session, pending: true, ready: true }).lean<OpexFileDoc[]>()
    if (docs.length !== ids.length) throw new DomainError(400, "Algum arquivo não foi encontrado (expirou, ainda está em envio ou já foi enviado): anexe de novo", "OPEX_FILE_NOT_FOUND")
    const result = await OpexFile.updateMany({ _id: { $in: ids }, sessionId: session, pending: true, ready: true }, { $set: { pending: false, messageId } })
    if (result.modifiedCount !== ids.length) throw new DomainError(409, "Os arquivos já foram enviados em outra mensagem", "OPEX_FILE_SENT")
    const byId = new Map(docs.map((doc) => [doc._id.toString(), refOf(doc)]))
    return ids.map((id) => byId.get(id)!)
}

/** Marcadores do histórico para os arquivos da mensagem. */
export function fileMarkers(files: readonly IOpexFileRef[]): OpexFileMarker[] {
    return files.map((file) => ({ type: "opex-file", fileId: file.id, weight: opexFileWeight(opexFileKind(file.mediaType, file.name), file.size) }))
}

/** Texto de um arquivo (UTF-8), com janela opcional. */
export function decodeText(data: Uint8Array, offset = 0, limit = OPEX_FILE_TEXT_INLINE_MAX): { text: string; total: number; truncated: boolean } {
    const full = Buffer.from(data).toString("utf8")
    const text = full.slice(offset, offset + limit)
    return { text, total: full.length, truncated: offset + text.length < full.length }
}

/** Baixa o conteúdo do arquivo do storage (usado só abaixo dos tetos de entrega/leitura). */
export async function readOpexFileBytes(doc: Pick<OpexFileDoc, "key">): Promise<Uint8Array> {
    const file = await getFileObject(doc.key)
    if (!file.body) return new Uint8Array()
    return new Uint8Array(await new Response(file.body).arrayBuffer())
}

type ContentPart = { type: "text"; text: string } | { type: "image"; image: Uint8Array; mediaType: string } | { type: "file"; data: Uint8Array; mediaType: string; filename: string }

async function filePartsFor(doc: OpexFileDoc | null, fileId: string, provider: OpexProviderId): Promise<ContentPart[]> {
    if (!doc) return [{ type: "text", text: `[Arquivo do chat ${fileId} não está mais disponível.]` }]
    const kind = opexFileKind(doc.mediaType, doc.name)
    const delivery = opexFileDelivery(provider, kind, doc.size)
    const ref = { id: doc._id.toString(), name: doc.name, mediaType: doc.mediaType, size: doc.size, kind }
    const reference: ContentPart = { type: "text", text: opexFileReference(ref, delivery) }
    if (delivery === "reference") return [reference]
    let data: Uint8Array
    try {
        data = await readOpexFileBytes(doc)
    } catch (error) {
        log.warn({ err: error, fileId }, "[opex] falha ao baixar o arquivo do chat para o turno")
        return [{ type: "text", text: `${opexFileReference(ref, "reference")} (o storage não respondeu ao baixar o conteúdo)` }]
    }
    if (delivery === "inline-text") {
        const decoded = decodeText(data)
        const note = decoded.truncated ? `\n(…cortado em ${OPEX_FILE_TEXT_INLINE_MAX.toLocaleString("pt-BR")} de ${decoded.total.toLocaleString("pt-BR")} caracteres; use read_chat_file para o resto)` : ""
        return [{ type: "text", text: `${reference.text}\n\`\`\`\n${decoded.text}\n\`\`\`${note}` }]
    }
    if (kind === "image") return [reference, { type: "image", image: data, mediaType: doc.mediaType }]
    return [reference, { type: "file", data, mediaType: doc.mediaType, filename: doc.name }]
}

/** Troca os marcadores `opex-file` do histórico pelo conteúdo, conforme o que o provedor lê. */
export async function resolveFileMarkers(messages: readonly unknown[], provider: OpexProviderId): Promise<unknown[]> {
    const ids = new Set<string>()
    for (const message of messages) {
        const content = (message as { content?: unknown })?.content
        if (Array.isArray(content)) for (const part of content) if (isFileMarker(part)) ids.add(part.fileId)
    }
    if (!ids.size) return [...messages]
    const docs = await OpexFile.find({ _id: { $in: [...ids].filter((id) => Types.ObjectId.isValid(id)) }, ready: true }).lean<OpexFileDoc[]>()
    const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]))
    const resolved = new Map<string, ContentPart[]>()
    for (const id of ids) resolved.set(id, await filePartsFor(byId.get(id) ?? null, id, provider))
    return messages.map((message) => {
        const typed = message as { content?: unknown }
        if (!Array.isArray(typed.content) || !typed.content.some(isFileMarker)) return message
        return { ...typed, content: typed.content.flatMap((part: unknown) => (isFileMarker(part) ? (resolved.get(part.fileId) ?? []) : [part])) }
    })
}

// ── Ferramentas ────────────────────────────────────────────────────────────

/** Arquivo confirmado da sessão (metadados), para as ferramentas. */
export async function loadSessionFile(sessionId: string, fileId: string): Promise<OpexFileDoc> {
    assertFileId(fileId)
    const doc = await OpexFile.findOne({ _id: fileId, sessionId: new Types.ObjectId(sessionId), ready: true }).lean<OpexFileDoc>()
    if (!doc) throw new DomainError(404, `Arquivo ${fileId} não encontrado nesta sessão`, "OPEX_FILE_NOT_FOUND")
    return doc
}

export async function listSessionFiles(sessionId: string): Promise<(OpexFileDto & { messageId: string | null; pending: boolean; createdAt: string })[]> {
    const docs = await OpexFile.find({ sessionId: new Types.ObjectId(sessionId), ready: true }).sort({ createdAt: 1 }).lean<OpexFileDoc[]>()
    return docs.map((doc) => ({ ...toFileDto(refOf(doc)), messageId: doc.messageId?.toString() ?? null, pending: doc.pending, createdAt: new Date(doc.createdAt).toISOString() }))
}


// ── Limpeza ────────────────────────────────────────────────────────────────

/** Sessão excluída: apaga os objetos (melhor esforço) e todos os metadados dos arquivos. */
export async function deleteSessionFiles(sessionId: string): Promise<void> {
    const docs = await OpexFile.find({ sessionId: new Types.ObjectId(sessionId) }).select({ key: 1, uploadKey: 1 }).lean<Pick<OpexFileDoc, "_id" | "key" | "uploadKey">[]>()
    for (const doc of docs) {
        await removeObjectQuietly(doc.uploadKey)
        await removeObjectQuietly(doc.key)
    }
    await OpexFile.deleteMany({ sessionId: new Types.ObjectId(sessionId) })
}

/**
 * Rotina `opex-files-cleanup`: remove os arquivos do chat enviados e nunca usados numa mensagem há
 * mais de 24 h. O metadado só some depois de o objeto sair do storage (falha = tenta de novo).
 */
export async function cleanupPendingOpexFiles(now: Date = new Date()): Promise<string> {
    await opexDb()
    const cutoff = new Date(now.getTime() - OPEX_FILE_PENDING_TTL_MS)
    const stale = await OpexFile.find({ pending: true, createdAt: { $lte: cutoff } }).select({ key: 1, uploadKey: 1 }).lean<Pick<OpexFileDoc, "_id" | "key" | "uploadKey">[]>()
    let removed = 0
    let failed = 0
    for (const doc of stale) {
        const ok = (await removeObjectQuietly(doc.uploadKey)) && (await removeObjectQuietly(doc.key))
        if (!ok) {
            failed += 1
            continue
        }
        await OpexFile.deleteOne({ _id: doc._id })
        removed += 1
    }
    if (!removed && !failed) return "Nenhum arquivo pendente do chat"
    return [removed ? `${removed} arquivo(s) pendente(s) do chat removido(s)` : null, failed ? `${failed} com falha no storage (nova tentativa na próxima execução)` : null].filter(Boolean).join("; ")
}
