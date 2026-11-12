import { EngramindError, engramindCodeOf, type EngramindClient } from "@engramind/client/server"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import type { MaddoxCampaignMemoryKind, MaddoxQuestStatus, MaddoxVisibility } from "@/features/maddox/constants"
import { Types } from "mongoose"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel } from "@/features/maddox/models"
import { CAMPAIGN_CHANNEL_PREFIX, campaignChannel, campaignChannels } from "../constants"
import {
    categoryOfKind,
    memoryKeyOf,
    readTags,
    remoteTitle,
    resolveCategory,
    slugOfTitle,
    tagsOf,
    viewOf,
    type CampaignMemoryView,
    type RemoteCampaignMemory,
} from "../campaign-memory-format"
import type { CampaignSyncDto } from "../types"
import { invalidateCategoryCache, listCategoryKeys } from "./categories"
import { engramindAgentClient, engramindAppClient, engramindConnection } from "./client"
import { provisionCampaignMemoryNetworkSafely } from "./campaign-channels"
import { PendingWrite, pendingWriteId } from "./pending-writes"
import { engramindLog, messageOf } from "./shared"

/**
 * Memórias das campanhas Maddox — o Engramind é a ÚNICA fonte (nada no Mongo). Canais
 * `dndicas/maddox/campanhas/<id>/{jogadores,mestre}`, formato em `campaign-memory-format.ts`.
 *
 * - Narrador (gravação, busca e prompt): token do agente `dndicas/maddox` (assina as campanhas em `search`).
 * - Diário: token de app (leitura de tela, sem somar uso do agente), SEMPRE só no canal dos jogadores.
 * - Engramind fora do ar ou token recusado na gravação: a gravação vai para a fila temporária
 *   (`pending-writes.ts`), que o cron entrega e apaga. Leituras sem a rede lançam
 *   `ENGRAMIND_UNAVAILABLE` (503) — não há cópia de reserva.
 */

export const CAMPAIGN_MEMORIES_UNAVAILABLE = "As anotações da campanha estão indisponíveis no momento: a rede de memórias não respondeu."

export class CampaignMemoriesUnavailableError extends DomainError {
    constructor(message = CAMPAIGN_MEMORIES_UNAVAILABLE) {
        super(503, message, "ENGRAMIND_UNAVAILABLE")
    }
}

const PAGE = 200
const MAX_PAGES = 25
const TEXT_MAX_TTL_MS = 60_000
const textMaxCache = globalThis as typeof globalThis & { __engramindCampaignTextMax?: { at: number; value: number; channels: Map<string, number> } | null }

/** Erro que não é culpa da gravação (rede, 5xx, 429, token recusado): a gravação vai para a fila. */
/** A rede inteira está fora (ou o token do agente foi recusado): não adianta tentar as próximas entradas da fila. */
function isServiceDown(error: unknown): boolean {
    if (!(error instanceof EngramindError)) return false
    const code = engramindCodeOf(error)
    // `engramindCodeOf` devolve o código do contrato sem o prefixo `ENGRAMIND_`; o status já vem remapeado pelo cliente.
    return code === "UNREACHABLE" || code === "AUTH_INVALID" || code === "RATE_LIMITED"
}

/** Tentativas de uma entrada da fila antes de ela virar recusa (fica visível com "Descartar"). */
export const PENDING_MAX_ATTEMPTS = 5
/** 5xx seguidos sem nenhuma entrega no ciclo: a rede está fora; para sem gastar tentativas. */
const SERVER_ERRORS_BEFORE_STOP = 3

export function isRetryable(error: unknown): boolean {
    if (!(error instanceof EngramindError)) return true
    const code = engramindCodeOf(error)
    return code === "UNREACHABLE" || code === "AUTH_INVALID" || code === "RATE_LIMITED" || error.status >= 500
}

/** Limite real de texto de uma memória no canal (configuração do consumidor, em cache). */
export async function textMaxOf(client: EngramindClient, channel: string): Promise<number> {
    const cached = textMaxCache.__engramindCampaignTextMax
    if (cached && Date.now() - cached.at < TEXT_MAX_TTL_MS) return cached.channels.get(channel) ?? cached.value
    const settings = await client.consumerSettings()
    const value = { at: Date.now(), value: settings.memory.text_max, channels: new Map((settings.channels ?? []).map((item) => [item.channel, item.memory_text_max])) }
    textMaxCache.__engramindCampaignTextMax = value
    return value.channels.get(channel) ?? value.value
}

export function resetCampaignMemoriesForTests(): void {
    textMaxCache.__engramindCampaignTextMax = null
}

type Query = Record<string, string | number | undefined>

async function listPage(client: EngramindClient, query: Query): Promise<{ memories: RemoteCampaignMemory[]; next_cursor: string | null }> {
    const clean = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== "")) as Record<string, string | number>
    return client.call("GET", "/v1/memories", { query: clean })
}

async function listAll(client: EngramindClient, query: Query): Promise<RemoteCampaignMemory[]> {
    const all: RemoteCampaignMemory[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
        const result: { memories: RemoteCampaignMemory[]; next_cursor: string | null } = await listPage(client, { ...query, limit: PAGE, ...(cursor ? { cursor } : {}) })
        all.push(...result.memories)
        cursor = result.next_cursor
        if (!cursor) break
    }
    return all
}

async function campaignOf(campaignId: string): Promise<{ id: string; name: string; status: string } | null> {
    await dbConnect()
    const campaign = await MaddoxCampaignModel.findById(campaignId).select({ name: 1, status: 1 }).lean<{ _id: unknown; name: string; status: string }>()
    return campaign ? { id: String(campaign._id), name: campaign.name, status: campaign.status } : null
}

// ── Gravação ────────────────────────────────────────────────────────────────

export interface SaveCampaignMemoryInput {
    kind: MaddoxCampaignMemoryKind
    title: string
    text: string
    visibility?: MaddoxVisibility
    tags?: string[]
    status?: MaddoxQuestStatus
    turnNumber?: number | null
    /** Chave fixa (marco de combate); padrão: tipo + título. */
    key?: string
}

export interface SaveCampaignMemoryResult {
    saved: true
    created: boolean
    restored?: true
    pending?: true
    truncated?: true
    aviso?: string
    /** Missão: situação anterior à gravação (`null` = missão nova). Usado pelo marco de nível (DND-56). */
    previousStatus?: string | null
}

export const PENDING_NOTICE = "A rede de memórias está indisponível: a memória entra assim que ela voltar e, até lá, não aparece no Diário nem na busca."

async function enqueue(campaignId: string, key: string, channel: string, body: Record<string, unknown>, error: unknown): Promise<void> {
    await dbConnect()
    const id = pendingWriteId(campaignId, key)
    await PendingWrite.updateOne(
        { _id: id },
        { $set: { campaignId, key, channel, body, lastError: messageOf(error).slice(0, 500), failed: false }, $setOnInsert: { attempts: 0 } },
        { upsert: true },
    )
    engramindLog.warn({ campaignId, err: messageOf(error) }, "[engramind] memória da campanha na fila: a rede não aceitou a gravação agora")
}

/** Memória existente com a mesma chave (qualquer status) nos dois canais; senão, pelo título na categoria. */
async function findExisting(client: EngramindClient, campaignId: string, key: string, input: SaveCampaignMemoryInput): Promise<RemoteCampaignMemory | null> {
    const channels = campaignChannels(campaignId).join(",")
    const byKey = await listPage(client, { channels, key, status: "active,permanent,archived", limit: 5 })
    if (byKey.memories[0]) return byKey.memories[0]
    if (input.key) return null
    const slug = slugOfTitle(input.title)
    const candidates = await listAll(client, { channels, categories: categoryOfKind(input.kind), status: "active,permanent,archived", fields: "title" })
    // `fields=title` não traz a chave: lê cada candidata e só aceita a que não tem chave (criada fora do jogo).
    for (const candidate of candidates.filter((item) => slugOfTitle(item.title ?? "") === slug).slice(0, 5)) {
        const full = (await client.memories.get(candidate.id)) as unknown as RemoteCampaignMemory
        if (!full.key) return full
    }
    return null
}

async function writeWithCategory(client: EngramindClient, kind: MaddoxCampaignMemoryKind, body: Record<string, unknown>, write: (body: Record<string, unknown>) => Promise<{ memory: RemoteCampaignMemory; created?: boolean }>) {
    try {
        return await write(body)
    } catch (error) {
        if (engramindCodeOf(error) !== "CATEGORY_NOT_FOUND") throw error
        invalidateCategoryCache()
        return write({ ...body, category: resolveCategory(kind, await listCategoryKeys(client)) })
    }
}

/**
 * Cria ou atualiza pela chave (tipo + título, ou a do combate) sem duplicar: troca de visibilidade move a
 * memória; uma arquivada volta pelo `upsert`; uma criada fora do jogo (sem chave) é achada pelo título.
 */
export async function saveCampaignMemory(campaignId: string, input: SaveCampaignMemoryInput): Promise<SaveCampaignMemoryResult> {
    if (!(await engramindConnection())) throw new DomainError(409, "A rede de memórias (integração Engramind) não está configurada: a memória não foi gravada.", "ENGRAMIND_NOT_CONFIGURED")
    const campaign = await campaignOf(campaignId)
    if (!campaign) throw new DomainError(404, "Campanha não encontrada", "NOT_FOUND")
    await provisionCampaignMemoryNetworkSafely(campaign)
    const key = input.key ?? memoryKeyOf(input.kind, input.title)
    const title = remoteTitle(input.title)
    const writtenAt = Date.now()
    const client = await engramindAgentClient("maddox")
    const draftChannel = campaignChannel(campaignId, input.visibility ?? "players")
    const draftBody = (text: string, extra: Partial<{ tags: string[]; category: string; channel: string }> = {}) => ({
        channel: extra.channel ?? draftChannel,
        key,
        upsert: true,
        text,
        category: extra.category ?? categoryOfKind(input.kind),
        tags: extra.tags ?? tagsOf({ kind: input.kind, tags: input.tags, status: input.status, turnNumber: input.turnNumber, writtenAt }),
        origin: { source: "maddox", label: "Maddox" },
        ...(title ? { title } : {}),
    })
    // A fila guarda o texto inteiro: o limite real do canal é aplicado na entrega (`flushPendingWrites`).
    const queued = (): SaveCampaignMemoryResult => ({ saved: true, created: false, pending: true, aviso: PENDING_NOTICE })
    if (!client) {
        await enqueue(campaignId, key, draftChannel, draftBody(input.text), new Error("Token do agente dndicas/maddox indisponível"))
        return queued()
    }
    let body: Record<string, unknown> = draftBody(input.text)
    try {
        const existing = await findExisting(client, campaignId, key, input)
        const previous = existing ? readTags(existing.tags, input.kind) : null
        const visibility = input.visibility ?? (existing ? (existing.channel.endsWith("/mestre") ? "master" : "players") : "players")
        const channel = campaignChannel(campaignId, visibility)
        const max = await textMaxOf(client, channel)
        const text = input.text.length > max ? input.text.slice(0, max).trimEnd() : input.text
        const tags = tagsOf({ kind: input.kind, tags: input.tags ?? previous?.tags, status: input.status ?? previous?.status, turnNumber: input.turnNumber ?? previous?.turnNumber, writtenAt })
        const category = resolveCategory(input.kind, await listCategoryKeys(client))
        body = draftBody(text, { tags, channel, ...(category ? { category } : {}) })
        if (existing && existing.channel !== channel) await client.memories.move(existing.id, channel)
        let created = false
        if (existing && existing.key !== key) {
            // Criada fora do jogo, sem chave (a chave é imutável): atualiza pelo id.
            const { channel: _channel, key: _key, upsert: _upsert, ...patch } = body
            await writeWithCategory(client, input.kind, patch, (data) => client.call("PATCH", `/v1/memories/${encodeURIComponent(existing.id)}`, { body: data }))
            if (existing.status === "archived") await client.memories.restore(existing.id)
        } else {
            const written = await writeWithCategory(client, input.kind, body, (data) => client.call("POST", "/v1/memories", { body: data }))
            created = Boolean(written.created)
        }
        await PendingWrite.deleteOne({ _id: pendingWriteId(campaignId, key) }).catch(() => undefined)
        return {
            saved: true,
            created,
            ...(existing?.status === "archived" ? { restored: true as const } : {}),
            ...(input.kind === "missao" ? { previousStatus: previous?.status ?? null } : {}),
            ...(text.length < input.text.length ? { truncated: true as const, aviso: `Texto cortado em ${max} caracteres (limite da rede de memórias).` } : {}),
        }
    } catch (error) {
        if (!isRetryable(error)) {
            engramindLog.warn({ campaignId, err: messageOf(error) }, "[engramind] memória da campanha recusada")
            throw new DomainError(400, `A rede de memórias recusou a memória: ${messageOf(error)}`, "ENGRAMIND_REJECTED")
        }
        await enqueue(campaignId, key, String(body.channel), body, error)
        return queued()
    }
}

// ── Leitura ─────────────────────────────────────────────────────────────────

const views = (items: readonly RemoteCampaignMemory[], campaignId: string) =>
    items.map(viewOf).filter((item): item is CampaignMemoryView => Boolean(item && item.campaignId === campaignId))

async function readClient(reader: "app" | "maddox"): Promise<EngramindClient> {
    const client = reader === "app" ? await engramindAppClient() : await engramindAgentClient("maddox")
    if (!client) throw new CampaignMemoriesUnavailableError()
    return client
}

async function guarded<T>(campaignId: string, work: () => Promise<T>): Promise<T> {
    try {
        return await work()
    } catch (error) {
        if (error instanceof CampaignMemoriesUnavailableError) throw error
        engramindLog.warn({ campaignId, err: messageOf(error) }, "[engramind] leitura das memórias da campanha falhou")
        throw new CampaignMemoriesUnavailableError()
    }
}

export interface CampaignMemoryQuery {
    /** `players`: só o canal dos jogadores (Diário); `all`: os dois (narrador). */
    scope: "players" | "all"
    reader: "app" | "maddox"
    kind?: MaddoxCampaignMemoryKind
    status?: MaddoxQuestStatus
    limit: number
    cursor?: string
}

const channelsOf = (campaignId: string, scope: CampaignMemoryQuery["scope"]) => (scope === "players" ? [campaignChannel(campaignId, "players")] : campaignChannels(campaignId))

/** Página das memórias (da alteração mais recente), com o cursor da rede. */
export async function listCampaignMemories(campaignId: string, query: CampaignMemoryQuery): Promise<{ items: CampaignMemoryView[]; nextCursor: string | null }> {
    return guarded(campaignId, async () => {
        const client = await readClient(query.reader)
        const channels = channelsOf(campaignId, query.scope).join(",")
        if (query.kind === "missao" && query.status) {
            // A situação é decidida aqui, não pela tag: missão sem `status:` (criada no Opex, importada ou pelo
            // Agente Opex) conta como ativa, como no jogo. Paginação pela posição na lista filtrada.
            const all = views(await listAll(client, { channels, categories: categoryOfKind("missao") }), campaignId).filter((item) => item.status === query.status)
            const start = Number(query.cursor?.match(/^o:(\d+)$/)?.[1] ?? 0)
            const end = start + query.limit
            return { items: all.slice(start, end), nextCursor: end < all.length ? `o:${end}` : null }
        }
        const result = await listPage(client, { channels, categories: query.kind ? categoryOfKind(query.kind) : undefined, limit: query.limit, cursor: query.cursor })
        return { items: views(result.memories, campaignId), nextCursor: result.next_cursor }
    })
}

/** Busca híbrida (título e texto) nos canais do escopo. */
export async function searchCampaignMemories(campaignId: string, input: { query: string } & Omit<CampaignMemoryQuery, "cursor" | "status">): Promise<CampaignMemoryView[]> {
    return guarded(campaignId, async () => {
        const client = await readClient(input.reader)
        const result = await client.memories.search({
            query: input.query.slice(0, 500),
            channels: channelsOf(campaignId, input.scope),
            ...(input.kind ? { categories: [categoryOfKind(input.kind)] } : {}),
            limit: Math.min(50, input.limit),
            exclude_context: false,
        })
        return views(result.results.map((item) => item.memory as unknown as RemoteCampaignMemory), campaignId).slice(0, input.limit)
    })
}

/** Missões ativas (tag `status:ativa`) no escopo, das mais recentes. */
export async function activeQuests(campaignId: string, scope: CampaignMemoryQuery["scope"], reader: CampaignMemoryQuery["reader"], limit: number): Promise<CampaignMemoryView[]> {
    return (await listCampaignMemories(campaignId, { scope, reader, kind: "missao", status: "ativa", limit })).items
}

/** Contagem por tipo no canal dos jogadores (Diário). */
export async function countPlayerMemories(campaignId: string): Promise<Record<MaddoxCampaignMemoryKind, number>> {
    return guarded(campaignId, async () => {
        const client = await readClient("app")
        const items = await listAll(client, { channels: campaignChannel(campaignId, "players"), fields: "title" })
        const counts: Record<MaddoxCampaignMemoryKind, number> = { fato: 0, evento: 0, local: 0, missao: 0, relacao: 0, outro: 0 }
        for (const view of views(items.map((item) => ({ ...item, text: item.text ?? "" })), campaignId)) counts[view.kind]++
        return counts
    })
}

/**
 * Memórias que o prompt do narrador recebe: as missões ativas sempre e as mais recentes até o limite (os
 * dois canais). Sem a rede: vazio (o turno segue sem as memórias da campanha).
 */
export async function narratorMemoryIndex(campaignId: string, limit: number): Promise<CampaignMemoryView[]> {
    try {
        const [quests, recent] = await Promise.all([activeQuests(campaignId, "all", "maddox", limit), listCampaignMemories(campaignId, { scope: "all", reader: "maddox", limit: limit * 2 })])
        const ids = new Set(quests.map((item) => item.id))
        return [...quests, ...recent.items.filter((item) => !ids.has(item.id)).slice(0, Math.max(0, limit - quests.length))]
    } catch (error) {
        engramindLog.warn({ campaignId, err: messageOf(error) }, "[engramind] prompt do narrador sem as memórias da campanha")
        return []
    }
}

// ── Fila ────────────────────────────────────────────────────────────────────

/** Entrega a fila (cron e "Sincronizar agora"): apaga o que chegou; recusa definitiva fica marcada. */
export async function flushPendingWrites(): Promise<{ delivered: number; failed: number; remaining: number }> {
    await dbConnect()
    const entries = await PendingWrite.find({ failed: false }).sort({ createdAt: 1 }).limit(500).lean()
    let delivered = 0
    let failed = 0
    // Entradas que receberam 5xx: só contam tentativa se outra entrada for entregue no mesmo ciclo (aí o erro é
    // dela); sem nenhuma entrega, o 5xx é da rede (banco fora, proxy sem upstream) e nada é gasto.
    const serverErrors: { _id: string; updatedAt: Date; attempts: number; error: string }[] = []
    if (entries.length) {
        const client = await engramindAgentClient("maddox")
        for (const entry of entries) {
            if (!client) break
            try {
                const campaign = await campaignOf(entry.campaignId)
                if (!campaign) {
                    await PendingWrite.deleteOne({ _id: entry._id, updatedAt: entry.updatedAt })
                    continue
                }
                await provisionCampaignMemoryNetworkSafely(campaign)
                // Memória de um Personagem Opex (DND-26): sai com o token dele; sem token (removido), a entrada é descartada.
                let writer = client
                if (entry.agentMemberId) {
                    const { opexCharacterClient } = await import("./opex-characters")
                    const own = await opexCharacterClient(entry.agentMemberId)
                    if (!own) {
                        await PendingWrite.deleteOne({ _id: entry._id, updatedAt: entry.updatedAt })
                        continue
                    }
                    writer = own
                } else if (entry.agentNpcId) {
                    // NPC Opex (DND-27): sai com o token dele (provisionado se faltar); deixou de ser Opex = descartada.
                    const { opexNpcWriterFor } = await import("./opex-npcs")
                    const own = await opexNpcWriterFor(entry.campaignId, entry.agentNpcId)
                    if (!own) {
                        await PendingWrite.deleteOne({ _id: entry._id, updatedAt: entry.updatedAt })
                        continue
                    }
                    writer = own
                }
                // Limite real do canal na entrega (a fila guarda o texto inteiro).
                const text = String(entry.body.text ?? "")
                const max = await textMaxOf(client, entry.channel)
                const body = text.length > max ? { ...entry.body, text: text.slice(0, max).trimEnd() } : entry.body
                await writer.call("POST", "/v1/memories", { body })
                await PendingWrite.deleteOne({ _id: entry._id, updatedAt: entry.updatedAt })
                delivered++
            } catch (error) {
                // Rede inteira fora: para e tenta tudo no próximo ciclo, sem gastar tentativas.
                if (isServiceDown(error)) {
                    await PendingWrite.updateOne({ _id: entry._id, updatedAt: entry.updatedAt }, { $set: { lastError: messageOf(error).slice(0, 500) } })
                    break
                }
                if (error instanceof EngramindError && error.status >= 500) {
                    serverErrors.push({ _id: entry._id, updatedAt: entry.updatedAt, attempts: entry.attempts ?? 0, error: messageOf(error).slice(0, 500) })
                    if (!delivered && serverErrors.length >= SERVER_ERRORS_BEFORE_STOP) break
                    continue
                }
                // Falha desta entrada (validação ou erro inesperado): conta a tentativa e segue para a próxima.
                const giveUp = !isRetryable(error) || (entry.attempts ?? 0) + 1 >= PENDING_MAX_ATTEMPTS
                await PendingWrite.updateOne({ _id: entry._id, updatedAt: entry.updatedAt }, { $set: { lastError: messageOf(error).slice(0, 500), failed: giveUp }, $inc: { attempts: 1 } })
                if (giveUp) failed++
            }
        }
    }
    for (const entry of serverErrors) {
        if (!delivered) {
            await PendingWrite.updateOne({ _id: entry._id, updatedAt: entry.updatedAt }, { $set: { lastError: entry.error } })
            continue
        }
        const giveUp = entry.attempts + 1 >= PENDING_MAX_ATTEMPTS
        await PendingWrite.updateOne({ _id: entry._id, updatedAt: entry.updatedAt }, { $set: { lastError: entry.error, failed: giveUp }, $inc: { attempts: 1 } })
        if (giveUp) failed++
    }
    const remaining = await PendingWrite.countDocuments({})
    return { delivered, failed, remaining }
}

export async function pendingWritesSummary(): Promise<Pick<CampaignSyncDto, "pending" | "failures">> {
    await dbConnect()
    const [pending, failures] = await Promise.all([
        PendingWrite.countDocuments({}),
        PendingWrite.find({ $or: [{ failed: true }, { attempts: { $gt: 0 } }] }).sort({ updatedAt: -1 }).limit(20).lean(),
    ])
    return {
        pending,
        failures: failures.map((item) => ({ id: item._id, campaignId: item.campaignId, title: String(item.body.title ?? item.key), error: item.lastError, failed: item.failed })),
    }
}

/** Descarta uma gravação recusada (com confirmação na tela). */
export async function discardPendingWrite(id: string): Promise<boolean> {
    await dbConnect()
    return (await PendingWrite.deleteOne({ _id: id })).deletedCount === 1
}

/** Aviso aos membros da campanha (Diário em tempo real) quando uma memória do canal dos jogadores muda. */
export function campaignOfPlayersChannel(channel: string | null | undefined): string | null {
    if (!channel?.startsWith(CAMPAIGN_CHANNEL_PREFIX) || !channel.endsWith("/jogadores")) return null
    return channel.slice(CAMPAIGN_CHANNEL_PREFIX.length).split("/")[0] ?? null
}

/**
 * Diário em tempo real: avisa os membros da campanha (`maddox.campaign.changed` no canal de cada um; a tela
 * do Diário já recarrega com esse evento). Nunca lança.
 */
export async function notifyJournalChanged(campaignId: string): Promise<void> {
    try {
        if (!Types.ObjectId.isValid(campaignId)) return
        await dbConnect()
        const members = await MaddoxCampaignMemberModel.find({ campaignId: new Types.ObjectId(campaignId), status: "joined" }).select("userId").lean<{ userId: string }[]>()
        const { notifyCampaignChanged } = await import("@/features/maddox/server/campaign-realtime")
        await notifyCampaignChanged(campaignId, members.map((member) => member.userId))
    } catch (error) {
        engramindLog.warn({ campaignId, err: messageOf(error) }, "[engramind] aviso do Diário não enviado")
    }
}
