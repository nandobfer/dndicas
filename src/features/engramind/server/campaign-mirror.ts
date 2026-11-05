import { Types } from "mongoose"
import { engramindCodeOf, type EngramindClient, type WebhookEvent } from "@engramind/client/server"
import { dbConnect } from "@/lib/db"
import { normalizeCatalogName } from "@/features/maddox/catalog-markup"
import { MADDOX_TOOL_NAME_MAX, type MaddoxCampaignMemoryKind } from "@/features/maddox/constants"
import { MaddoxCampaignMemoryModel, MaddoxCampaignModel, type IMaddoxCampaignMemory } from "@/features/maddox/models"
import { CAMPAIGN_CHANNEL_PREFIX, campaignChannel, campaignChannels, parseCampaignChannel } from "../constants"
import { engramindTextOf, kindOfCategory, memoryIdOfKey, mirrorKey, parseEngramindText, resolveCategory } from "../campaign-mirror-format"
import type { CampaignHistoryCountDto, CampaignSyncDto } from "../types"
import { listCategoryKeys } from "./categories"
import { engramindAgentClient, engramindAppClient, engramindConnection } from "./client"
import { provisionCampaignMemoryNetwork, provisionCampaignMemoryNetworkSafely, syncCampaignChannelLifecycle } from "./campaign-channels"
import { ENGRAMIND_STATE_ID, EngramindState } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf, publishEngramind } from "./shared"

/**
 * Espelho em mão dupla das memórias das campanhas (`maddox_campaign_memories` ↔
 * `dndicas/maddox/campanhas/<id>/{jogadores,mestre}`). O Mongo é a fonte do jogo e do Diário.
 *
 * - Jogo → rede (`mirrorCampaignMemory`): upsert pela `key` `mx-<_id>` com o token `dndicas/maddox`;
 *   escondida → arquivada; troca de visibilidade → `move_memory`. Falha marca `engramindSyncPending`
 *   (o cron reenvia) e nunca afeta o jogo.
 * - Rede → jogo (`handleCampaignMemoryEvent`, webhook e cron): lê a memória com o token de app e aplica
 *   quando a versão é maior que `engramindVersion` (anti-laço; vale a última gravação). Canal fora das
 *   campanhas remove a memória do jogo; campanha inexistente é ignorada.
 */

type LeanMemory = IMaddoxCampaignMemory

type RemoteMemory = {
    id: string
    channel: string
    title: string | null
    text: string
    category: string
    status: "active" | "permanent" | "archived"
    version: number
    key?: string | null
    author?: { app: string | null; agent: string | null }
    updated_at?: string
}

const keyOfTitle = (value: string) => normalizeCatalogName(value)
const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max).trimEnd() : value)

async function markPending(id: Types.ObjectId | string, error: string): Promise<void> {
    await MaddoxCampaignMemoryModel.updateOne({ _id: id }, { $set: { engramindSyncPending: true, engramindSyncError: error.slice(0, 500) } }, { timestamps: false })
}

/** Título enviado ao Engramind: 3 a 200 caracteres, sem quebras (o título fica travado para o Redator). */
function remoteTitle(title: string): string | undefined {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 200)
    return clean.length >= 3 ? clean : undefined
}

async function pushMemory(client: EngramindClient, memory: LeanMemory, categories: readonly string[] | null): Promise<{ id: string; version: number }> {
    const channel = campaignChannel(String(memory.campaignId), memory.visibility)
    // Visibilidade trocada no jogo: a memória muda de canal levando a `key`.
    if (memory.engramindMemoryId) {
        try {
            const remote = (await client.memories.get(memory.engramindMemoryId)) as RemoteMemory
            if (remote.channel !== channel) await client.memories.move(memory.engramindMemoryId, channel)
        } catch (error) {
            if (engramindCodeOf(error) !== "MEMORY_NOT_FOUND") throw error
        }
    }
    const title = remoteTitle(memory.title)
    const body = {
        channel,
        key: mirrorKey(String(memory._id)),
        upsert: true,
        text: engramindTextOf(memory),
        category: resolveCategory(memory.kind, categories),
        origin: { source: "maddox", label: memory.origin === "agent" ? "Maddox" : "Jogo" },
        ...(title ? { title } : {}),
    }
    const written = (await client.call("POST", "/v1/memories", { body })) as { memory: RemoteMemory }
    let version = written.memory.version
    if (memory.hiddenAt && written.memory.status !== "archived") version = ((await client.memories.archive(written.memory.id)) as RemoteMemory).version
    return { id: written.memory.id, version }
}

/** Jogo → rede. Nunca lança; sem integração configurada não faz nada. */
export async function mirrorCampaignMemory(memoryId: Types.ObjectId | string): Promise<void> {
    try {
        if (!(await engramindConnection())) return
        await dbConnect()
        const memory = await MaddoxCampaignMemoryModel.findById(memoryId).lean<LeanMemory>()
        if (!memory) return
        const campaign = await MaddoxCampaignModel.findById(memory.campaignId).select({ name: 1, status: 1 }).lean<{ _id: Types.ObjectId; name: string; status: string }>()
        if (!campaign) return
        await provisionCampaignMemoryNetworkSafely({ id: String(campaign._id), name: campaign.name, status: campaign.status })
        const client = await engramindAgentClient("maddox")
        if (!client) {
            await markPending(memory._id, "Token do agente dndicas/maddox indisponível: rode a configuração automática")
            return
        }
        const { id, version } = await pushMemory(client, memory, await listCategoryKeys())
        await MaddoxCampaignMemoryModel.updateOne({ _id: memory._id }, { $set: { engramindMemoryId: id, engramindVersion: version, engramindSyncPending: false, engramindSyncError: null } }, { timestamps: false })
    } catch (error) {
        const reason = messageOf(error)
        engramindLog.warn({ memoryId: String(memoryId), err: reason }, "[engramind] espelho da memória da campanha falhou: fica pendente para o cron")
        await markPending(memoryId, reason).catch(() => undefined)
    }
}

/** Disparo sem espera (o jogo não aguarda o Engramind). */
export function mirrorCampaignMemoryLater(memoryId: Types.ObjectId | string): void {
    void mirrorCampaignMemory(memoryId).catch((error: unknown) => engramindLog.warn({ err: messageOf(error) }, "[engramind] espelho não agendado"))
}

// ── Rede → jogo ─────────────────────────────────────────────────────────────

async function findLocal(remote: Pick<RemoteMemory, "id" | "key">): Promise<LeanMemory | null> {
    const byId = await MaddoxCampaignMemoryModel.findOne({ engramindMemoryId: remote.id }).lean<LeanMemory>()
    if (byId) return byId
    const sourceId = memoryIdOfKey(remote.key)
    return sourceId ? MaddoxCampaignMemoryModel.findById(sourceId).lean<LeanMemory>() : null
}

export type ApplyOutcome = "created" | "updated" | "removed" | "ignored"

/** Aplica no Mongo uma memória lida da rede (webhook e cron). Idempotente pela versão. */
export async function applyRemoteMemory(remote: RemoteMemory, categories?: readonly string[] | null): Promise<ApplyOutcome> {
    await dbConnect()
    const local = await findLocal(remote)
    const target = parseCampaignChannel(remote.channel)
    if (!target) {
        if (!local) return "ignored"
        await MaddoxCampaignMemoryModel.deleteOne({ _id: local._id })
        engramindLog.info({ memoryId: String(local._id), channel: remote.channel }, "[engramind] memória movida para fora das campanhas: removida do jogo")
        return "removed"
    }
    if (local?.engramindVersion != null && remote.version <= local.engramindVersion) return "ignored"
    // Edição do jogo ainda não enviada e mais nova que a da rede: vale a última gravação (o cron a envia).
    if (local?.engramindSyncPending && remote.updated_at && new Date(local.updatedAt).getTime() > new Date(remote.updated_at).getTime()) return "ignored"
    const campaign = await MaddoxCampaignModel.exists({ _id: target.campaignId })
    if (!campaign) {
        engramindLog.warn({ channel: remote.channel, memory: remote.id }, "[engramind] memória num canal de campanha que não existe no dndicas: ignorada")
        return "ignored"
    }
    const available = categories === undefined ? await listCategoryKeys() : categories
    // A categoria de fallback (`OUTRO` ou a padrão) não troca o tipo do jogo.
    const kind: MaddoxCampaignMemoryKind = local && resolveCategory(local.kind, available) === remote.category ? local.kind : kindOfCategory(remote.category)
    const parsed = parseEngramindText(remote.text, kind, local?.status ?? null)
    const title = clip((remote.title ?? parsed.text.split("\n")[0] ?? "").replace(/\s+/g, " ").trim() || "Sem título", MADDOX_TOOL_NAME_MAX)
    const hiddenAt = remote.status === "archived" ? (local?.hiddenAt ?? new Date()) : null
    const set = {
        campaignId: new Types.ObjectId(target.campaignId),
        kind,
        title,
        titleKey: keyOfTitle(title),
        text: parsed.text,
        visibility: target.visibility,
        status: kind === "missao" ? parsed.status : null,
        hiddenAt,
        engramindMemoryId: remote.id,
        engramindVersion: remote.version,
        engramindSyncPending: false,
        engramindSyncError: null,
    }
    if (local) {
        const result = await MaddoxCampaignMemoryModel.updateOne({ _id: local._id, $or: [{ engramindVersion: null }, { engramindVersion: { $exists: false } }, { engramindVersion: { $lt: remote.version } }] }, { $set: set })
        return result.modifiedCount ? "updated" : "ignored"
    }
    const createdBy = remote.author?.agent ?? remote.author?.app ?? "engramind"
    await MaddoxCampaignMemoryModel.create({ ...set, tags: [], origin: "user", createdBy })
    return "created"
}

/** Webhook `memory.*` (menos `memory.consumed`) de um canal de campanha. Nunca lança. */
export async function handleCampaignMemoryEvent(event: Pick<WebhookEvent, "type" | "channel" | "memory_ids">): Promise<void> {
    if (!["memory.created", "memory.updated", "memory.archived", "memory.deleted"].includes(event.type)) return
    // Mover gera um evento por canal envolvido (inclusive o canal de campanha de origem ou de destino):
    // eventos só de canais fora das campanhas não interessam ao jogo. O canal atual vem da leitura.
    if (event.channel && !event.channel.startsWith(CAMPAIGN_CHANNEL_PREFIX)) return
    try {
        const client = await engramindAppClient()
        if (!client) return
        await dbConnect()
        const categories = await listCategoryKeys(client)
        for (const id of event.memory_ids ?? []) {
            try {
                const remote = (await client.memories.get(id)) as RemoteMemory
                const outcome = await applyRemoteMemory(remote, categories)
                if (outcome !== "ignored") await notifyGame(remote.channel)
            } catch (error) {
                if (engramindCodeOf(error) !== "MEMORY_NOT_FOUND") throw error
                const removed = await MaddoxCampaignMemoryModel.findOneAndDelete({ engramindMemoryId: id }).lean<LeanMemory>()
                if (removed) {
                    engramindLog.info({ memoryId: String(removed._id) }, "[engramind] memória excluída na rede: removida do jogo")
                    await notifyGame(campaignChannel(String(removed.campaignId), removed.visibility))
                }
            }
        }
    } catch (error) {
        engramindLog.warn({ type: event.type, err: messageOf(error) }, "[engramind] evento de memória da campanha não aplicado: o cron reconcilia")
    }
}

/** Avisa a mesa (Diário) da campanha. */
async function notifyGame(channel: string): Promise<void> {
    const target = parseCampaignChannel(channel)
    if (!target) return
    try {
        const { publishGameChanged } = await import("@/features/maddox/server/game")
        await publishGameChanged(new Types.ObjectId(target.campaignId))
    } catch (error) {
        engramindLog.debug({ err: messageOf(error) }, "[engramind] aviso da mesa não publicado")
    }
}

// ── Busca do narrador ───────────────────────────────────────────────────────

/**
 * `search_memories` do narrador: busca híbrida nos dois canais da campanha (o narrador vê `mestre`) com o
 * token `dndicas/maddox`, devolvendo os documentos do Mongo (sem as escondidas). `null` = use a busca do
 * Mongo (sem Engramind, sem token ou falha).
 */
export async function searchCampaignMemories(campaignId: Types.ObjectId | string, input: { query: string; kind?: MaddoxCampaignMemoryKind; limit: number }): Promise<LeanMemory[] | null> {
    try {
        if (!(await engramindConnection())) return null
        const client = await engramindAgentClient("maddox")
        if (!client) return null
        const result = await client.memories.search({ query: input.query.slice(0, 500), channels: campaignChannels(String(campaignId)), limit: Math.min(50, input.limit * 2), exclude_context: false })
        const ids = result.results.map((item) => item.memory.id)
        if (!ids.length) return []
        const docs = await MaddoxCampaignMemoryModel.find({ campaignId, engramindMemoryId: { $in: ids }, hiddenAt: null, ...(input.kind ? { kind: input.kind } : {}) }).lean<LeanMemory[]>()
        const order = new Map(ids.map((id, index) => [id, index]))
        return docs.sort((a, b) => (order.get(a.engramindMemoryId ?? "") ?? 0) - (order.get(b.engramindMemoryId ?? "") ?? 0)).slice(0, input.limit)
    } catch (error) {
        engramindLog.warn({ campaignId: String(campaignId), err: messageOf(error) }, "[engramind] busca das memórias da campanha falhou: usando a busca do Mongo")
        return null
    }
}

// ── Reconciliação (cron e "Sincronizar agora") ──────────────────────────────

const PAGE = 200
const MAX_PAGES = 50
const sync = globalThis as typeof globalThis & { __engramindCampaignSync?: Promise<string> | null }

async function listCampaignMemories(client: EngramindClient, query: Record<string, string>): Promise<{ memories: RemoteMemory[]; complete: boolean }> {
    const memories: RemoteMemory[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
        const result = (await client.memories.list({ channels: `${CAMPAIGN_CHANNEL_PREFIX}*`, status: "active,permanent,archived", limit: PAGE, ...query, ...(cursor ? { cursor } : {}) })) as { memories: RemoteMemory[]; next_cursor: string | null }
        memories.push(...result.memories)
        cursor = result.next_cursor
        if (!cursor) return { memories, complete: true }
    }
    return { memories, complete: false }
}

async function reconcile(actorId: string): Promise<string> {
    await dbConnect()
    const client = await engramindAppClient()
    if (!client) return "Engramind não configurado"
    const startedAt = new Date()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ campaignSync: 1 }).lean()
    const result = { pushed: 0, pulled: 0, removed: 0, failed: 0, channels: 0 }
    try {
        // 1. Rede das campanhas (cache por processo) e o ciclo de vida das arquivadas.
        const campaigns = await MaddoxCampaignModel.find({}).select({ name: 1, status: 1 }).lean<{ _id: Types.ObjectId; name: string; status: string }[]>()
        for (const campaign of campaigns) {
            const input = { id: String(campaign._id), name: campaign.name, status: campaign.status }
            try {
                if (await provisionCampaignMemoryNetwork(input)) result.channels += 2
            } catch (error) {
                engramindLog.warn({ campaignId: input.id, err: messageOf(error) }, "[engramind] canais da campanha ainda sem configurar")
            }
            if (campaign.status === "archived") await syncCampaignChannelLifecycle(input, actorId)
        }
        // 2. Pendentes do jogo.
        const pending = await MaddoxCampaignMemoryModel.find({ engramindSyncPending: true }).select({ _id: 1 }).limit(500).lean<{ _id: Types.ObjectId }[]>()
        for (const item of pending) {
            await mirrorCampaignMemory(item._id)
            const after = await MaddoxCampaignMemoryModel.findById(item._id).select({ engramindSyncPending: 1 }).lean<{ engramindSyncPending?: boolean }>()
            if (after?.engramindSyncPending) result.failed++
            else result.pushed++
        }
        // 3. Alteradas na rede desde a última sincronização.
        const categories = await listCategoryKeys(client)
        const since = state?.campaignSync?.cursor ?? undefined
        const changed = await listCampaignMemories(client, since ? { since } : {})
        let cursor = since ?? null
        for (const remote of changed.memories) {
            const outcome = await applyRemoteMemory(remote, categories)
            if (outcome === "created" || outcome === "updated") result.pulled++
            if (remote.updated_at && (!cursor || remote.updated_at > cursor)) cursor = remote.updated_at
        }
        // 4. Excluídas na rede que o webhook perdeu (só com a listagem completa).
        const all = await listCampaignMemories(client, { fields: "title" })
        if (all.complete) {
            const remoteIds = new Set(all.memories.map((item) => item.id))
            const mirrored = await MaddoxCampaignMemoryModel.find({ engramindMemoryId: { $ne: null }, engramindSyncPending: { $ne: true } }).select({ engramindMemoryId: 1 }).lean<{ _id: Types.ObjectId; engramindMemoryId: string }[]>()
            const gone = mirrored.filter((item) => !remoteIds.has(item.engramindMemoryId))
            for (const item of gone) {
                try {
                    await client.memories.get(item.engramindMemoryId)
                } catch (error) {
                    if (engramindCodeOf(error) !== "MEMORY_NOT_FOUND") continue
                    await MaddoxCampaignMemoryModel.deleteOne({ _id: item._id })
                    result.removed++
                }
            }
        }
        await EngramindState.updateOne(
            { _id: ENGRAMIND_STATE_ID },
            { $set: { campaignSync: { lastRunAt: startedAt, lastOkAt: new Date(), cursor, lastError: null, lastResult: result } } },
            { upsert: true },
        )
        return `${result.pushed} enviadas, ${result.pulled} recebidas, ${result.removed} removidas, ${result.failed} pendentes`
    } catch (error) {
        const reason = messageOf(error)
        await EngramindState.updateOne(
            { _id: ENGRAMIND_STATE_ID },
            { $set: { campaignSync: { lastRunAt: startedAt, lastOkAt: state?.campaignSync?.lastOkAt ?? null, cursor: state?.campaignSync?.cursor ?? null, lastError: reason, lastResult: result } } },
            { upsert: true },
        )
        throw error
    } finally {
        await publishEngramind({ type: "sync.updated" })
    }
}

/** Reconciliação das campanhas (uma por vez; quem chega junto espera a que está rodando). */
export function reconcileCampaignMemories(actorId = "system:cron"): Promise<string> {
    if (sync.__engramindCampaignSync) return sync.__engramindCampaignSync
    const job = reconcile(actorId).finally(() => {
        sync.__engramindCampaignSync = null
    })
    sync.__engramindCampaignSync = job
    return job
}

export async function getCampaignSync(): Promise<CampaignSyncDto> {
    await dbConnect()
    const [state, pending, failures, configured] = await Promise.all([
        EngramindState.findById(ENGRAMIND_STATE_ID).lean(),
        MaddoxCampaignMemoryModel.countDocuments({ engramindSyncPending: true }),
        MaddoxCampaignMemoryModel.find({ engramindSyncPending: true }).sort({ updatedAt: -1 }).limit(20).select({ campaignId: 1, title: 1, engramindSyncError: 1 }).lean<{ _id: Types.ObjectId; campaignId: Types.ObjectId; title: string; engramindSyncError?: string | null }[]>(),
        engramindConnection(),
    ])
    const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)
    const record = state?.campaignSync
    return {
        configured: Boolean(configured),
        lastRunAt: iso(record?.lastRunAt),
        lastOkAt: iso(record?.lastOkAt),
        lastError: record?.lastError ?? null,
        lastResult: record?.lastResult ?? null,
        pending,
        failures: failures.map((item) => ({ id: String(item._id), campaignId: String(item.campaignId), title: item.title, error: item.engramindSyncError ?? null })),
        redator: { supported: state?.channelSettings?.supported ?? null, checkedAt: iso(state?.channelSettings?.checkedAt), message: state?.channelSettings?.message ?? null },
        categoryWarnings: state?.categoryWarnings ?? [],
        running: Boolean(sync.__engramindCampaignSync),
    }
}

// ── Histórico das campanhas (aba Migração) ──────────────────────────────────

/**
 * Espelha o histórico (`maddox_campaign_memories`) sem curadoria: `import_memories` por campanha e canal
 * com a `key` `mx-<_id>` (idempotente: repetir não duplica). Grava o `engramindMemoryId` de cada uma.
 */
export async function mirrorCampaignHistory(actorId: string): Promise<CampaignHistoryCountDto[]> {
    await dbConnect()
    const client = await engramindAppClient()
    if (!client) throw new Error("Configure a integração Engramind antes")
    const settings = await client.consumerSettings()
    const batchSize = Math.max(1, settings.limits.max_batch)
    const categories = await listCategoryKeys(client)
    const campaigns = await MaddoxCampaignModel.find({}).select({ name: 1, status: 1 }).lean<{ _id: Types.ObjectId; name: string; status: string }[]>()
    let created = 0
    let duplicates = 0
    for (const campaign of campaigns) {
        await provisionCampaignMemoryNetwork({ id: String(campaign._id), name: campaign.name, status: campaign.status }, { force: true })
        for (const visibility of ["players", "master"] as const) {
            const channel = campaignChannel(String(campaign._id), visibility)
            const docs = await MaddoxCampaignMemoryModel.find({ campaignId: campaign._id, visibility, engramindMemoryId: null }).sort({ createdAt: 1 }).lean<LeanMemory[]>()
            for (let start = 0; start < docs.length; start += batchSize) {
                const batch = docs.slice(start, start + batchSize)
                const memories = batch.map((memory) => {
                    const title = remoteTitle(memory.title)
                    return {
                        text: engramindTextOf(memory),
                        key: mirrorKey(String(memory._id)),
                        category: resolveCategory(memory.kind, categories),
                        created_at: new Date(memory.createdAt).toISOString(),
                        status: memory.hiddenAt ? "archived" : "active",
                        origin: { source: "maddox", label: memory.origin === "agent" ? "Maddox" : "Jogo" },
                        ...(title ? { title } : {}),
                    }
                })
                const key = `dndicas-campaign-history-${channel}-${batch.map((memory) => String(memory._id)).join(",")}`.slice(0, 200)
                const imported = await client.memories.import({ channel, memories }, key)
                const marks = new Map<number, { id: string; version: number | null }>()
                for (const item of imported.created) marks.set(item.index, { id: item.id, version: 1 })
                for (const item of imported.duplicates) marks.set(item.index, { id: item.existing_id, version: null })
                created += imported.created.length
                duplicates += imported.duplicates.length
                for (const [index, memory] of batch.entries()) {
                    const mark = marks.get(index)
                    if (mark) await MaddoxCampaignMemoryModel.updateOne({ _id: memory._id }, { $set: { engramindMemoryId: mark.id, engramindVersion: mark.version, engramindSyncPending: false, engramindSyncError: null } }, { timestamps: false })
                }
            }
        }
    }
    await auditEngramind(actorId, "migracao", AcaoAuditoria.EXECUTAR, { passo: "historico-campanhas", campanhas: campaigns.length, criadas: created, duplicadas: duplicates })
    await publishEngramind({ type: "migration.updated" })
    return campaignHistoryCounts()
}

/** Contagem por campanha: memórias no Mongo × espelhadas no Engramind. */
export async function campaignHistoryCounts(): Promise<CampaignHistoryCountDto[]> {
    await dbConnect()
    const [campaigns, totals] = await Promise.all([
        MaddoxCampaignModel.find({}).select({ name: 1 }).lean<{ _id: Types.ObjectId; name: string }[]>(),
        MaddoxCampaignMemoryModel.aggregate<{ _id: Types.ObjectId; source: number; mirrored: number }>([
            { $group: { _id: "$campaignId", source: { $sum: 1 }, mirrored: { $sum: { $cond: [{ $gt: ["$engramindMemoryId", null] }, 1, 0] } } } },
        ]),
    ])
    const byId = new Map(totals.map((item) => [String(item._id), item]))
    return campaigns.map((campaign) => ({ campaignId: String(campaign._id), name: campaign.name, source: byId.get(String(campaign._id))?.source ?? 0, mirrored: byId.get(String(campaign._id))?.mirrored ?? 0 }))
}
