import { engramindCodeOf, type EngramindClient } from "@engramind/client/server"
import { Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import { decryptSecret, isEncryptedSecret } from "@/lib/crypto/secretBox"
import { MaddoxCampaignMemberModel, MaddoxNpcModel, type MaddoxMemoryChannelRef } from "@/features/maddox/models"
import { planMemoryRewind, firstWrittenAt, type MemoryRevisionLike, type MemoryRewindAction, type MemoryRewindTarget } from "@/features/maddox/rewind-plan"
import { campaignChannels, opexCharacterChannel, opexNpcChannel } from "../constants"
import type { RemoteCampaignMemory } from "../campaign-memory-format"
import { clientFor, engramindAgentClient, engramindConnection } from "./client"
import { opexCharacterClient } from "./opex-characters"
import { PendingWrite, type IPendingWrite } from "./pending-writes"
import { engramindLog, messageOf } from "./shared"

/**
 * Memórias na volta a um turno das Campanhas Maddox (DND-44) — SOMENTE servidor.
 *
 * Cada gravação do jogo leva `turno:<n>` e `gravado:<ms>` (relógio do dndicas). Para levar as memórias ao estado de um
 * retrato (`asOf` = `takenAt` do retrato), cada memória candidata tem o histórico lido e volta à revisão de conteúdo que
 * valia naquele instante: `revert` para o texto, título, categoria e tags, e `archive`/`restore` para a situação. A que
 * ainda não existia é arquivada (ou excluída, se nasceu de uma ação feita depois da volta). O histórico do Engramind
 * nunca é reescrito: ir para frente dentro da volta pendente ou retomar o turno de origem é a mesma operação com outro
 * `asOf`.
 *
 * Canais: Jogadores e Mestre da campanha (token do Maddox), o individual de cada Personagem Opex e o de cada NPC Opex
 * (token de cada um). Memórias antigas, sem `turno:` nem `gravado:`, nunca são afetadas.
 */

export const MEMORY_REWIND_UNAVAILABLE = "A rede de memórias está indisponível. Nada mudou na mesa; tente de novo em instantes."

/** A rede não respondeu (ou recusou) no meio da volta: a operação responde 409 e pode ser repetida. */
export class MemoryRewindUnavailableError extends Error {
    constructor(readonly cause: unknown) {
        super(MEMORY_REWIND_UNAVAILABLE)
    }
}

export interface RewindChannel {
    ref: MaddoxMemoryChannelRef
    channels: string[]
    client: EngramindClient
}

export interface MemoryRewindItem {
    id: string
    ref: MaddoxMemoryChannelRef
    action: MemoryRewindAction
}

const PAGE = 200
const MAX_PAGES = 25

const refKey = (ref: MaddoxMemoryChannelRef) => (ref.kind === "campaign" ? "campaign" : ref.kind === "opex-member" ? `member:${ref.memberId}` : `npc:${ref.npcId}`)

/**
 * Canais e clientes da campanha. `null` = a integração não está configurada (não há memórias para voltar). Sem o token do
 * Maddox, lança `MemoryRewindUnavailableError`. `npcTokenBoxes` traz os tokens cifrados dos NPCs Opex (os da mesa e os do
 * retrato de origem: um NPC que surgiu depois do turno de destino some da mesa, mas o canal dele também volta).
 */
export async function resolveRewindChannels(campaignId: string, npcTokenBoxes: ReadonlyMap<string, unknown>): Promise<RewindChannel[] | null> {
    const connection = await engramindConnection().catch((error: unknown) => {
        throw new MemoryRewindUnavailableError(error)
    })
    if (!connection) return null
    await dbConnect()
    const maddox = await engramindAgentClient("maddox").catch((error: unknown) => {
        throw new MemoryRewindUnavailableError(error)
    })
    if (!maddox) throw new MemoryRewindUnavailableError(new Error("Token do agente dndicas/maddox indisponível"))
    const result: RewindChannel[] = [{ ref: { kind: "campaign" }, channels: campaignChannels(campaignId), client: maddox }]
    const members = await MaddoxCampaignMemberModel.find({ campaignId: new Types.ObjectId(campaignId), kind: "opex" }).select("_id").lean<{ _id: Types.ObjectId }[]>()
    for (const member of members) {
        const client = await opexCharacterClient(String(member._id))
        if (client) result.push({ ref: { kind: "opex-member", memberId: String(member._id) }, channels: [opexCharacterChannel(campaignId, String(member._id))], client })
    }
    for (const [npcId, box] of npcTokenBoxes) {
        if (!isEncryptedSecret(box)) continue
        try {
            result.push({ ref: { kind: "opex-npc", npcId }, channels: [opexNpcChannel(campaignId, npcId)], client: clientFor(connection.baseUrl, decryptSecret(box)) })
        } catch (error) {
            engramindLog.warn({ npcId, err: messageOf(error) }, "[engramind] token do NPC Opex ilegível na volta a um turno")
        }
    }
    return result
}

/** Tokens cifrados dos NPCs Opex da campanha no banco agora. */
export async function npcTokenBoxesOf(campaignId: string): Promise<Map<string, unknown>> {
    await dbConnect()
    const npcs = await MaddoxNpcModel.find({ campaignId: new Types.ObjectId(campaignId), "opex.engramind.tokenBox": { $ne: null } }).select("+opex.engramind.tokenBox").lean<{ _id: Types.ObjectId; opex?: { engramind?: { tokenBox?: unknown } | null } | null }[]>()
    return new Map(npcs.map((npc) => [String(npc._id), npc.opex?.engramind?.tokenBox]))
}

async function listChannel(client: EngramindClient, channels: string[]): Promise<RemoteCampaignMemory[]> {
    const all: RemoteCampaignMemory[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
        const result: { memories: RemoteCampaignMemory[]; next_cursor: string | null } = await client.call("GET", "/v1/memories", { query: { channels: channels.join(","), status: "active,permanent,archived", limit: PAGE, ...(cursor ? { cursor } : {}) } })
        all.push(...result.memories)
        cursor = result.next_cursor
        if (!cursor) break
    }
    return all
}

async function historyOf(client: EngramindClient, id: string): Promise<MemoryRevisionLike[]> {
    const all: MemoryRevisionLike[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
        const result: { revisions: MemoryRevisionLike[]; next_cursor?: string | null } = await client.call("GET", `/v1/memories/${encodeURIComponent(id)}/history`, { query: { limit: PAGE, ...(cursor ? { cursor } : {}) } })
        all.push(...result.revisions)
        cursor = result.next_cursor ?? null
        if (!cursor) break
    }
    return all
}

const writtenAfter = (memory: RemoteCampaignMemory, asOf: number) => {
    const stamp = Number((memory.tags ?? []).find((tag) => tag.startsWith("gravado:"))?.slice("gravado:".length))
    return Number.isFinite(stamp) && stamp > asOf
}

/**
 * Lê o que precisa mudar para as memórias ficarem como em `asOf` (sem gravar nada). Candidatas: as gravadas depois de
 * `asOf` e as já tocadas pela volta pendente (`knownIds`: revertidas ou arquivadas antes, com tags antigas).
 */
export async function planMemoryRewinds(channels: readonly RewindChannel[], target: MemoryRewindTarget, knownIds: ReadonlySet<string>): Promise<MemoryRewindItem[]> {
    const items: MemoryRewindItem[] = []
    for (const channel of channels) {
        const found: MemoryRewindItem[] = []
        try {
            const memories = await listChannel(channel.client, channel.channels)
            for (const memory of memories) {
                if (!writtenAfter(memory, Math.min(target.asOf, target.keepAfter ?? Number.POSITIVE_INFINITY)) && !knownIds.has(memory.id)) continue
                const revisions = await historyOf(channel.client, memory.id)
                found.push({ id: memory.id, ref: channel.ref, action: planMemoryRewind(memory, revisions, target) })
            }
        } catch (error) {
            if (isLostAgentChannel(channel, error)) {
                engramindLog.warn({ ref: channel.ref, err: messageOf(error) }, "[engramind] canal Opex sem acesso na volta a um turno: ignorado")
                continue
            }
            throw new MemoryRewindUnavailableError(error)
        }
        items.push(...found)
    }
    return items
}

/**
 * Canal de um Personagem ou NPC Opex cujo token foi revogado (desfeito, morto ou removido) ou cujo canal sumiu: as
 * memórias dele não são alcançáveis e ficam como estão. Nos canais da campanha, a mesma falha é rede indisponível.
 */
function isLostAgentChannel(channel: RewindChannel, error: unknown): boolean {
    if (channel.ref.kind === "campaign") return false
    const code = engramindCodeOf(error)
    return code === "AUTH_INVALID" || code === "CHANNEL_NOT_SUBSCRIBED" || code === "CHANNEL_NOT_FOUND" || code === "SCOPE_REQUIRED"
}

const ignoreNotFound = (error: unknown) => {
    if (engramindCodeOf(error) !== "MEMORY_NOT_FOUND") throw error
}

/** Aplica o plano (revert, archive, restore, delete). Repetir é seguro: o plano é refeito a partir do estado atual. */
export async function applyMemoryRewinds(channels: readonly RewindChannel[], items: readonly MemoryRewindItem[]): Promise<number> {
    const clients = new Map(channels.map((channel) => [refKey(channel.ref), channel.client]))
    let changed = 0
    try {
        for (const item of items) {
            const client = clients.get(refKey(item.ref))
            if (!client || item.action.kind === "keep") continue
            if (item.action.kind === "delete") {
                await client.memories.delete(item.id).catch(ignoreNotFound)
            } else {
                if (item.action.revertTo !== null) await client.call("POST", `/v1/memories/${encodeURIComponent(item.id)}/revert`, { body: { version: item.action.revertTo } })
                if (item.action.status === "archive") await client.memories.archive(item.id)
                if (item.action.status === "restore") await client.memories.restore(item.id)
            }
            changed++
        }
    } catch (error) {
        throw new MemoryRewindUnavailableError(error)
    }
    return changed
}

/**
 * Perda definitiva: exclui as memórias tocadas pela volta que nasceram no trecho descartado (gravadas depois de `after`,
 * o retrato do turno em que a mesa ficou, e até `upTo`, o retrato de origem). As nascidas depois da volta (ações da nova
 * linha do tempo) ficam. Devolve as que não puderam ser excluídas agora (vão para a fila de reparo).
 */
export async function purgeDiscardedMemories(channels: readonly RewindChannel[], known: readonly { id: string; ref: MaddoxMemoryChannelRef }[], window: { after: number; upTo: number }): Promise<{ deleted: number; failed: { id: string; ref: MaddoxMemoryChannelRef; error: string }[] }> {
    const clients = new Map(channels.map((channel) => [refKey(channel.ref), channel.client]))
    const failed: { id: string; ref: MaddoxMemoryChannelRef; error: string }[] = []
    let deleted = 0
    for (const item of known) {
        const client = clients.get(refKey(item.ref))
        if (!client) {
            failed.push({ ...item, error: "Canal da memória indisponível" })
            continue
        }
        try {
            const revisions = await historyOf(client, item.id)
            const born = firstWrittenAt(revisions)
            if (born > window.after && born <= window.upTo) {
                await client.memories.delete(item.id)
                deleted++
            }
        } catch (error) {
            if (engramindCodeOf(error) === "MEMORY_NOT_FOUND") continue
            failed.push({ ...item, error: messageOf(error).slice(0, 500) })
        }
    }
    return { deleted, failed }
}

/**
 * Exclusão pendente da fila de reparo: exclui a memória se ela nasceu no trecho descartado. `true` = resolvida (excluída,
 * fora do trecho ou já inexistente). Lança com a rede fora (a entrada fica para o próximo ciclo).
 */
export async function purgeMemoryNow(campaignId: string, ref: MaddoxMemoryChannelRef, memoryId: string, tokenBox: unknown, window: { after: number; upTo: number }): Promise<boolean> {
    const channels = await resolveRewindChannels(campaignId, ref.kind === "opex-npc" ? new Map([[ref.npcId, tokenBox]]) : new Map())
    if (!channels) return false
    const result = await purgeDiscardedMemories(channels, [{ id: memoryId, ref }], window)
    if (result.failed.length) throw new Error(result.failed[0]!.error)
    return true
}

// ── Fila de gravações pendentes ──────────────────────────────────────────────

/** Tira da fila as gravações da campanha feitas depois de `after` (voltariam ao serem entregues) e as devolve. */
export async function stashPendingWrites(campaignId: string, after: Date): Promise<IPendingWrite[]> {
    await dbConnect()
    const rows = await PendingWrite.find({ campaignId, updatedAt: { $gt: after } }).lean<IPendingWrite[]>()
    if (rows.length) await PendingWrite.deleteMany({ _id: { $in: rows.map((row) => row._id) } })
    return rows
}

/** Devolve à fila as gravações guardadas (retomada do turno de origem). */
export async function restorePendingWrites(rows: readonly Record<string, unknown>[]): Promise<void> {
    if (!rows.length) return
    await dbConnect()
    await PendingWrite.bulkWrite(rows.map((row) => ({ replaceOne: { filter: { _id: row._id as string }, replacement: row as unknown as IPendingWrite, upsert: true } })))
}
