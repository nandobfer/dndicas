import { createHash } from "node:crypto"
import mongoose, { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import type { MaddoxCampaignMemoryKind, MaddoxQuestStatus, MaddoxVisibility } from "@/features/maddox/constants"
import { MaddoxCampaignModel } from "@/features/maddox/models"
import { campaignChannel } from "../constants"
import { combatMemoryKey, memoryKeyOf, remoteTitle, resolveCategory, tagsOf } from "../campaign-memory-format"
import type { CampaignMoveRowDto } from "../types"
import { listCategoryKeys } from "./categories"
import { engramindAppClient } from "./client"
import { provisionCampaignMemoryNetwork } from "./campaign-channels"
import { MemoryBackup } from "./migration-models"
import { ENGRAMIND_STATE_ID, EngramindState } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf, publishEngramind } from "./shared"

/**
 * Move as memórias antigas das campanhas (`maddox_campaign_memories`, de antes da revisão da DND-21) para o
 * Engramind e APAGA as cópias do banco do dndicas, por campanha:
 * 1. backup obrigatório da coleção inteira (JSON com SHA-256, em `engramind_memory_backups`, baixável);
 * 2. `import_memories` por campanha e canal com as chaves do jogo (`mx:<tipo>:<título>`, `mx:combate:<id>`),
 *    tags de situação e turno, `created_at` original e `archived` para as escondidas;
 * 3. confere cada documento pela chave no canal certo (criada ou já existente);
 * 4. apaga SÓ os documentos da campanha quando todos conferiram (divergência → nada apagado, com o motivo).
 * Idempotente: repetir pula o que já foi movido (a coleção perde o que foi apagado).
 */

export const CAMPAIGN_MEMORIES_COLLECTION = "maddox_campaign_memories"
const BACKUP_PREFIX = "campaign-memories-"

interface LegacyCampaignMemory {
    _id: Types.ObjectId
    campaignId: Types.ObjectId
    kind?: MaddoxCampaignMemoryKind
    title?: string
    text?: string
    visibility?: MaddoxVisibility
    tags?: string[]
    status?: MaddoxQuestStatus | null
    turnNumber?: number | null
    combatId?: Types.ObjectId | null
    hiddenAt?: Date | null
    createdAt?: Date
}

async function collection() {
    await dbConnect()
    const db = mongoose.connection.db
    if (!db) throw new DomainError(503, "Banco indisponível", "DB_UNAVAILABLE")
    return db.collection<LegacyCampaignMemory>(CAMPAIGN_MEMORIES_COLLECTION)
}

export async function legacyCampaignMemoryCount(): Promise<number> {
    return (await collection()).countDocuments({})
}

/** Tamanho de cada parte do JSON do backup (bem abaixo dos 16 MB de um documento, mesmo com caracteres de 3 bytes). */
export const BACKUP_PART_CHARS = 2_000_000

/**
 * Divide o JSON em partes de até `size` unidades UTF-16 sem partir um par substituto (emoji): uma metade solta
 * seria gravada pelo BSON como U+FFFD e o SHA-256 da concatenação deixaria de conferir.
 */
export function splitBackupParts(json: string, size = BACKUP_PART_CHARS): string[] {
    const parts: string[] = []
    let start = 0
    while (start < json.length) {
        let end = Math.min(start + size, json.length)
        const last = json.charCodeAt(end - 1)
        if (end < json.length && end - start > 1 && last >= 0xd800 && last <= 0xdbff) end--
        parts.push(json.slice(start, end))
        start = end
    }
    return parts
}

/**
 * Backup da coleção inteira antes de apagar. Cada execução ACRESCENTA um backup à lista (nenhum é substituído) e
 * o JSON vai em partes (`<id>:p<n>`). Coleção vazia não gera backup (não há o que apagar).
 */
async function backupCollection(actorId: string): Promise<{ id: string; count: number; sha256: string } | null> {
    const rows = await (await collection()).find({}).sort({ _id: 1 }).toArray()
    if (!rows.length) return null
    const json = JSON.stringify(rows)
    const sha256 = createHash("sha256").update(json).digest("hex")
    const id = `${BACKUP_PREFIX}${new Types.ObjectId().toString()}`
    const createdAt = new Date()
    const parts: { _id: string; createdAt: Date; count: number; sha256: string; json: string }[] = []
    splitBackupParts(json).forEach((part, index) => parts.push({ _id: `${id}:p${index}`, createdAt, count: rows.length, sha256, json: part }))
    await MemoryBackup.insertMany(parts)
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $push: { campaignBackups: { id, count: rows.length, sha256, createdAt, parts: parts.length } } }, { upsert: true })
    await auditEngramind(actorId, "migracao", AcaoAuditoria.EXECUTAR, { passo: "backup-campanhas", quantidade: rows.length, sha256, partes: parts.length })
    return { id, count: rows.length, sha256 }
}

/** Baixa um backup (o mais recente sem `id`): as partes concatenadas, conferidas pelo SHA-256. */
export async function downloadCampaignBackup(id?: string | null): Promise<{ filename: string; body: string }> {
    await dbConnect()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ campaignBackups: 1 }).lean()
    const list = state?.campaignBackups ?? []
    const backup = id ? list.find((item) => item.id === id) : list.at(-1)
    if (!backup) throw new DomainError(404, "Nenhum backup das memórias das campanhas ainda", "NOT_FOUND")
    const parts = await MemoryBackup.find({ _id: { $in: Array.from({ length: backup.parts }, (_, index) => `${backup.id}:p${index}`) } }).lean()
    const ordered = Array.from({ length: backup.parts }, (_, index) => parts.find((part) => part._id === `${backup.id}:p${index}`))
    const body = ordered.every(Boolean) ? ordered.map((part) => part!.json).join("") : ""
    if (!body || createHash("sha256").update(body).digest("hex") !== backup.sha256) throw new DomainError(500, "O backup das memórias das campanhas está incompleto no banco: não confere com o SHA-256", "BACKUP_CORRUPTED")
    return { filename: `dndicas-memorias-campanhas-${new Date(backup.createdAt).toISOString().slice(0, 10)}-${backup.sha256.slice(0, 8)}.json`, body }
}

/** Chaves das memórias de uma campanha: a do jogo; repetida no mesmo par campanha × chave → sufixo do `_id`. */
export function legacyKeys(rows: readonly Pick<LegacyCampaignMemory, "_id" | "kind" | "title" | "combatId">[]): Map<string, string> {
    const used = new Set<string>()
    const keys = new Map<string, string>()
    for (const row of rows) {
        let key = row.combatId ? combatMemoryKey(String(row.combatId)) : memoryKeyOf(row.kind ?? "fato", row.title ?? String(row._id))
        if (used.has(key)) key = `${key.slice(0, 80 - 25)}:${String(row._id)}`
        used.add(key)
        keys.set(String(row._id), key)
    }
    return keys
}

async function moveCampaign(campaign: { _id: Types.ObjectId; name: string; status: string }, actorId: string): Promise<CampaignMoveRowDto> {
    const col = await collection()
    const rows = await col.find({ campaignId: campaign._id }).sort({ createdAt: 1, _id: 1 }).toArray()
    const row: CampaignMoveRowDto = { campaignId: String(campaign._id), name: campaign.name, source: rows.length, imported: 0, verified: 0, deleted: 0, error: null }
    if (!rows.length) return row
    const client = await engramindAppClient()
    if (!client) throw new DomainError(409, "Configure a integração Engramind antes", "ENGRAMIND_NOT_CONFIGURED")
    await provisionCampaignMemoryNetwork({ id: String(campaign._id), name: campaign.name, status: campaign.status }, { force: true })
    const settings = await client.consumerSettings()
    const batchSize = Math.max(1, settings.limits.max_batch)
    const categories = await listCategoryKeys(client)
    const keys = legacyKeys(rows)
    const verified = new Set<string>()
    let oversized = 0
    for (const visibility of ["players", "master"] as const) {
        const channel = campaignChannel(String(campaign._id), visibility)
        const textMax = (settings.channels ?? []).find((item) => item.channel === channel)?.memory_text_max ?? settings.memory.text_max
        // Texto acima do limite do canal não é cortado: fica fora da importação e conta como divergência (nada apagado).
        const all = rows.filter((item) => (item.visibility ?? "players") === visibility)
        const tooLong = all.filter((item) => (item.text ?? "").length > textMax)
        oversized += tooLong.length
        const docs = all.filter((item) => !tooLong.includes(item))
        for (let start = 0; start < docs.length; start += batchSize) {
            const batch = docs.slice(start, start + batchSize)
            const memories = batch.map((item) => {
                const kind = item.kind ?? "fato"
                const title = remoteTitle(item.title ?? "")
                const text = item.text || (item.title ?? "—")
                return {
                    text,
                    key: keys.get(String(item._id)),
                    category: resolveCategory(kind, categories),
                    tags: tagsOf({ kind, tags: item.tags ?? [], status: item.status ?? null, turnNumber: item.turnNumber ?? null }),
                    status: item.hiddenAt ? "archived" : "active",
                    origin: { source: "maddox", label: "Maddox" },
                    ...(item.createdAt ? { created_at: new Date(item.createdAt).toISOString() } : {}),
                    ...(title ? { title } : {}),
                }
            })
            const idempotency = `dndicas-campaign-move-${channel}-${createHash("sha1").update(batch.map((item) => String(item._id)).join(",")).digest("hex")}`
            const result = await client.memories.import({ channel, memories }, idempotency)
            row.imported += result.created.length
            for (const item of [...result.created.map((entry) => entry.index), ...result.duplicates.map((entry) => entry.index)]) {
                const doc = batch[item]
                if (doc) verified.add(String(doc._id))
            }
        }
        // Conferência pela chave no canal (cobre o que o resultado da importação não trouxe).
        for (const item of docs) {
            if (verified.has(String(item._id))) continue
            const found = (await client.call("GET", "/v1/memories", { query: { channels: channel, key: keys.get(String(item._id))!, status: "active,permanent,archived", limit: 1 } })) as { memories: unknown[] }
            if (found.memories.length) verified.add(String(item._id))
        }
    }
    row.verified = verified.size
    if (verified.size !== rows.length) {
        const missing = rows.length - verified.size - oversized
        row.error = [
            oversized ? `${oversized} memória(s) passam do limite de texto do Engramind (memory.text_max) e não foram importadas: aumente o limite no Opex ou encurte o texto` : null,
            missing ? `${missing} memória(s) não conferiram no Engramind` : null,
        ]
            .filter(Boolean)
            .join("; ")
            .concat(": nada foi apagado desta campanha.")
        engramindLog.warn({ campaignId: row.campaignId, missing: rows.length - verified.size }, "[engramind] memórias da campanha não conferiram: cópias mantidas")
        return row
    }
    const deleted = await col.deleteMany({ _id: { $in: rows.map((item) => item._id) } })
    row.deleted = deleted.deletedCount
    row.source = rows.length - deleted.deletedCount
    await auditEngramind(actorId, "migracao", AcaoAuditoria.EXCLUIR, { passo: "mover-campanha", campanha: row.campaignId, importadas: row.imported, conferidas: row.verified, apagadas: row.deleted })
    return row
}

/** Backup + mover + conferir + apagar, campanha a campanha. */
export async function moveCampaignMemories(actorId: string): Promise<CampaignMoveRowDto[]> {
    await backupCollection(actorId)
    const campaigns = await MaddoxCampaignModel.find({}).select({ name: 1, status: 1 }).lean<{ _id: Types.ObjectId; name: string; status: string }[]>()
    const results: CampaignMoveRowDto[] = []
    for (const campaign of campaigns) {
        try {
            results.push(await moveCampaign(campaign, actorId))
        } catch (error) {
            results.push({ campaignId: String(campaign._id), name: campaign.name, source: await (await collection()).countDocuments({ campaignId: campaign._id }), imported: 0, verified: 0, deleted: 0, error: messageOf(error) })
        }
    }
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { campaignMove: { at: new Date(), results } } }, { upsert: true })
    await publishEngramind({ type: "migration.updated" })
    return results
}

/** Situação por campanha: o que ainda está no banco do dndicas e o resultado da última execução. */
export async function campaignMoveRows(): Promise<CampaignMoveRowDto[]> {
    await dbConnect()
    const [campaigns, totals, state] = await Promise.all([
        MaddoxCampaignModel.find({}).select({ name: 1 }).lean<{ _id: Types.ObjectId; name: string }[]>(),
        (await collection()).aggregate<{ _id: Types.ObjectId; count: number }>([{ $group: { _id: "$campaignId", count: { $sum: 1 } } }]).toArray(),
        EngramindState.findById(ENGRAMIND_STATE_ID).select({ campaignMove: 1 }).lean(),
    ])
    const remaining = new Map(totals.map((item) => [String(item._id), item.count]))
    const last = new Map((state?.campaignMove?.results ?? []).map((item) => [item.campaignId, item]))
    return campaigns.map((campaign) => {
        const id = String(campaign._id)
        const previous = last.get(id)
        return { campaignId: id, name: campaign.name, source: remaining.get(id) ?? 0, imported: previous?.imported ?? 0, verified: previous?.verified ?? 0, deleted: previous?.deleted ?? 0, error: previous?.error ?? null }
    })
}
