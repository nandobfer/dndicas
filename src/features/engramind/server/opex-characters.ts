import { engramindCodeOf, type EngramindClient } from "@engramind/client/server"
import { dbConnect } from "@/lib/db"
import { decryptSecret, encryptSecret, isEncryptedSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox"
import { MaddoxCampaignMemberModel, MaddoxCampaignModel } from "@/features/maddox/models"
import { AGENT_TOKEN_SCOPES, CAMPAIGN_VISIBILITY_NAMES, ENGRAMIND_APP, OPEX_CHARACTER_GLOBAL_CHANNEL, campaignChannel, opexCharacterAgentSlug, opexCharacterChannel } from "../constants"
import { clientFor, engramindAgentClient, engramindAppClient, engramindConnection } from "./client"
import { ensureAgentSubscription, tidyChannel } from "./bootstrap"
import { provisionCampaignMemoryNetworkSafely } from "./campaign-channels"
import { PendingWrite, pendingWriteId } from "./pending-writes"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf } from "./shared"

/**
 * Memórias dos Personagens Opex no Engramind (DND-26) — SOMENTE servidor.
 *
 * Cada Personagem Opex tem um agente próprio (`dndicas/personagem-opex-<memberId>`), criado pelo token de app, com 3
 * assinaturas exatas: o canal global `dndicas/personagem-opex` (`inject`), o canal Jogadores da campanha (`search`; NUNCA
 * o do Mestre) e o canal individual `dndicas/personagem-opex/<campaignId>/<memberId>` (`inject`, que nasce nessa
 * assinatura). O token do agente fica cifrado no membro (`opex.engramind.tokenBox`, `select: false`).
 *
 * O canal individual guarda os pensamentos do Opex (sentimentos, planos, motivações, opiniões, relações): só
 * administradores o leem em `/memorias`. Remover o Opex arquiva o canal, desativa o agente e revoga o token; arquivar a
 * campanha arquiva os canais individuais e restaurá-la os restaura. Tudo em melhor esforço: uma falha é logada e nunca
 * trava o jogo (o Opex joga sem memórias).
 */

const CONTEXT_TIMEOUT_MS = 5_000

const fullSlug = (memberId: string) => `${ENGRAMIND_APP}/${opexCharacterAgentSlug(memberId)}`
export const opexCharacterChannels = (campaignId: string, memberId: string) => [OPEX_CHARACTER_GLOBAL_CHANNEL, campaignChannel(campaignId, "players"), opexCharacterChannel(campaignId, memberId)]

export interface OpexMemberRef {
    campaignId: string
    memberId: string
    characterName: string
}

export interface OpexMemoryInput {
    title: string
    text: string
}

async function ensureAgent(client: EngramindClient, memberId: string, name: string): Promise<void> {
    const description = "Personagem Opex de uma Campanha Maddox (controlado por IA)."
    try {
        const agent = await client.agents.create({ app: ENGRAMIND_APP, slug: opexCharacterAgentSlug(memberId), name, description })
        if (agent.disabled_at) await client.agents.update(fullSlug(memberId), { disabled: false })
    } catch (error) {
        if (engramindCodeOf(error) !== "SLUG_ALREADY_EXISTS") throw error
        await client.agents.update(fullSlug(memberId), { name, disabled: false })
    }
}

/**
 * Cria (ou confere) o agente, as 3 assinaturas e o token do Personagem Opex. Idempotente: com token gravado, só
 * confere as assinaturas. Nunca lança: a falha fica em `opex.engramind.error` e o cron/uma nova chamada refaz.
 */
export async function provisionOpexCharacterAgent(ref: OpexMemberRef, actorId = "system:engramind"): Promise<boolean> {
    try {
        await dbConnect()
        const client = await engramindAppClient()
        if (!client) return false
        const campaign = await MaddoxCampaignModel.findById(ref.campaignId).select("name status").lean<{ _id: unknown; name: string; status: string }>()
        if (!campaign) return false
        await provisionCampaignMemoryNetworkSafely({ id: ref.campaignId, name: campaign.name, status: campaign.status })
        const name = `${ref.characterName || "Personagem Opex"} · ${campaign.name}`.slice(0, 120)
        await ensureAgent(client, ref.memberId, name)
        const slug = fullSlug(ref.memberId)
        const channel = opexCharacterChannel(ref.campaignId, ref.memberId)
        await ensureAgentSubscription(client, slug, OPEX_CHARACTER_GLOBAL_CHANNEL, "inject")
        await ensureAgentSubscription(client, slug, campaignChannel(ref.campaignId, "players"), "search")
        const { channelCreated } = await ensureAgentSubscription(client, slug, channel, "inject")
        await tidyChannel(client, channel, `${name} · pensamentos`, `Memórias individuais do Personagem Opex na campanha "${campaign.name}" (${CAMPAIGN_VISIBILITY_NAMES.players.toLowerCase()} não leem).`, channelCreated)
        if (campaign.status === "archived") await client.channels.archive(channel).catch(() => undefined)

        const member = await MaddoxCampaignMemberModel.findById(ref.memberId).select("+opex.engramind.tokenBox").lean<{ opex?: { engramind?: { tokenId?: string | null; tokenBox?: unknown } | null } | null }>()
        const stored = member?.opex?.engramind
        if (stored?.tokenId && isEncryptedSecret(stored.tokenBox)) {
            await MaddoxCampaignMemberModel.updateOne({ _id: ref.memberId }, { $set: { "opex.engramind.agentSlug": slug, "opex.engramind.channel": channel, "opex.engramind.error": null } })
            return true
        }
        if (!isSecretBoxConfigured()) throw new Error("INTEGRATIONS_ENCRYPTION_KEY ausente: o token do Personagem Opex não pode ser gravado")
        const issued = await client.tokens.issue({ kind: "agent", agent: slug, scopes: [...AGENT_TOKEN_SCOPES], label: `dndicas personagem opex ${ref.memberId}` })
        if (!issued.secret) throw new Error(`O Engramind não devolveu o segredo do token de ${slug}`)
        await MaddoxCampaignMemberModel.updateOne(
            { _id: ref.memberId },
            { $set: { "opex.engramind": { agentSlug: slug, channel, tokenId: issued.token.id, tokenBox: encryptSecret(issued.secret), provisionedAt: new Date(), error: null } } },
        )
        await auditEngramind(actorId, "issue_token", AcaoAuditoria.CRIAR, { agente: slug, token: issued.token.id, canais: opexCharacterChannels(ref.campaignId, ref.memberId) })
        return true
    } catch (error) {
        engramindLog.warn({ memberId: ref.memberId, err: messageOf(error) }, "[engramind] agente do Personagem Opex não configurado")
        await MaddoxCampaignMemberModel.updateOne({ _id: ref.memberId }, { $set: { "opex.engramind.error": messageOf(error).slice(0, 500) } }).catch(() => undefined)
        return false
    }
}

/** Cliente com o token do próprio Personagem Opex (ou `null` sem token gravado). */
export async function opexCharacterClient(memberId: string): Promise<EngramindClient | null> {
    const connection = await engramindConnection().catch(() => null)
    if (!connection) return null
    await dbConnect()
    const member = await MaddoxCampaignMemberModel.findById(memberId).select("+opex.engramind.tokenBox").lean<{ opex?: { engramind?: { tokenBox?: unknown } | null } | null }>()
    const box = member?.opex?.engramind?.tokenBox
    if (!isEncryptedSecret(box)) return null
    try {
        return clientFor(connection.baseUrl, decryptSecret(box))
    } catch (error) {
        engramindLog.warn({ memberId, err: messageOf(error) }, "[engramind] token do Personagem Opex ilegível")
        return null
    }
}

/**
 * Bloco de memórias do Personagem Opex para o prompt: o contexto dos 3 canais (global, Jogadores, individual) pedido com
 * o token dele. Sem token ou com a rede fora, tenta provisionar uma vez e segue sem memórias. Nunca lança.
 */
export async function opexCharacterMemoryBlock(ref: OpexMemberRef): Promise<string> {
    try {
        let client = await opexCharacterClient(ref.memberId)
        if (!client && (await engramindConnection().catch(() => null))) {
            await provisionOpexCharacterAgent(ref)
            client = await opexCharacterClient(ref.memberId)
        }
        if (!client) return ""
        const view = await client.context({ channels: opexCharacterChannels(ref.campaignId, ref.memberId) }, { timeoutMs: CONTEXT_TIMEOUT_MS })
        return typeof view?.content === "string" ? view.content.trim() : ""
    } catch (error) {
        engramindLog.warn({ memberId: ref.memberId, err: messageOf(error) }, "[engramind] Personagem Opex sem memórias neste turno")
        return ""
    }
}

const keyOf = (title: string) =>
    `opex:${title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)}`

/**
 * Grava as memórias que o Opex decidiu guardar no canal individual, pela chave do título (`opex:<título>`, `upsert`: o
 * mesmo assunto é atualizado, nunca duplicado). Com a rede fora ou o token recusado, vai para a fila
 * `engramind_pending_writes` (entregue pelo cron com o token do Opex). Nunca lança.
 */
export async function saveOpexCharacterMemories(ref: OpexMemberRef, memories: readonly OpexMemoryInput[]): Promise<{ saved: number; pending: number }> {
    let saved = 0
    let pending = 0
    if (!memories.length || !(await engramindConnection().catch(() => null))) return { saved, pending }
    const channel = opexCharacterChannel(ref.campaignId, ref.memberId)
    const client = await opexCharacterClient(ref.memberId)
    for (const memory of memories) {
        const key = keyOf(memory.title)
        if (key === "opex:") continue
        const body = { channel, key, upsert: true, title: memory.title.slice(0, 120), text: memory.text, tags: ["personagem-opex"], origin: { source: "maddox", label: ref.characterName || "Personagem Opex" } }
        try {
            if (!client) throw new Error("Token do Personagem Opex indisponível")
            await client.call("POST", "/v1/memories", { body })
            saved++
        } catch (error) {
            const id = pendingWriteId(ref.campaignId, `${ref.memberId}:${key}`)
            await PendingWrite.updateOne(
                { _id: id },
                { $set: { campaignId: ref.campaignId, key, channel, body, agentMemberId: ref.memberId, lastError: messageOf(error).slice(0, 500), failed: false }, $setOnInsert: { attempts: 0 } },
                { upsert: true },
            ).catch((queueError: unknown) => engramindLog.warn({ memberId: ref.memberId, err: messageOf(queueError) }, "[engramind] memória do Personagem Opex perdida"))
            pending++
        }
    }
    return { saved, pending }
}

/** Opex removido: arquiva o canal individual, desativa o agente e revoga o token. Nunca lança. */
export async function retireOpexCharacterAgent(ref: Pick<OpexMemberRef, "campaignId" | "memberId">, actorId = "system:engramind"): Promise<void> {
    try {
        const client = await engramindAppClient()
        if (!client) return
        const member = await MaddoxCampaignMemberModel.findById(ref.memberId).select("opex.engramind").lean<{ opex?: { engramind?: { tokenId?: string | null } | null } | null }>()
        const channel = opexCharacterChannel(ref.campaignId, ref.memberId)
        await client.channels.archive(channel).catch((error: unknown) => {
            if (engramindCodeOf(error) !== "CHANNEL_NOT_FOUND") throw error
        })
        await client.agents.update(fullSlug(ref.memberId), { disabled: true }).catch((error: unknown) => {
            if (engramindCodeOf(error) !== "AGENT_NOT_FOUND") throw error
        })
        const tokenId = member?.opex?.engramind?.tokenId
        if (tokenId) await client.tokens.revoke(tokenId).catch((error: unknown) => engramindLog.warn({ memberId: ref.memberId, err: messageOf(error) }, "[engramind] token do Personagem Opex não revogado"))
        await MaddoxCampaignMemberModel.updateOne({ _id: ref.memberId }, { $set: { "opex.engramind.tokenId": null, "opex.engramind.tokenBox": null } })
        await auditEngramind(actorId, "archive_channel", AcaoAuditoria.ATUALIZAR, { agente: fullSlug(ref.memberId), canal: channel, token: tokenId ?? null })
    } catch (error) {
        engramindLog.warn({ memberId: ref.memberId, err: messageOf(error) }, "[engramind] agente do Personagem Opex não aposentado")
    }
}

/** Canais individuais dos Opex ativos acompanham a campanha arquivada/restaurada. Devolve quantos mudaram. */
export async function setOpexChannelsArchived(client: EngramindClient, campaignId: string, archived: boolean): Promise<number> {
    const members = await MaddoxCampaignMemberModel.find({ campaignId, kind: "opex", status: "joined" }).select("_id").lean<{ _id: unknown }[]>()
    let changed = 0
    for (const member of members) {
        const channel = opexCharacterChannel(campaignId, String(member._id))
        try {
            const current = await client.channels.get(channel)
            if (Boolean(current.archived_at) === archived) continue
            if (archived) await client.channels.archive(channel)
            else await client.channels.restore(channel)
            changed++
        } catch (error) {
            if (engramindCodeOf(error) === "CHANNEL_NOT_FOUND") continue
            throw error
        }
    }
    return changed
}

// ── Memórias globais (configuração do Agente Maddox, só administradores) ─────

export interface OpexGlobalMemory {
    id: string
    title: string
    text: string
    updatedAt: string | null
}

export class OpexGlobalMemoriesUnavailableError extends Error {
    constructor() {
        super("A rede de memórias (integração Engramind) não está disponível: as memórias globais do Personagem Opex não podem ser lidas nem gravadas agora.")
        this.name = "OpexGlobalMemoriesUnavailableError"
    }
}

async function globalClient(): Promise<EngramindClient> {
    const client = await engramindAgentClient("personagem-opex")
    if (!client) throw new OpexGlobalMemoriesUnavailableError()
    return client
}

interface RemoteMemory {
    id: string
    title?: string | null
    text?: string | null
    updated_at?: string | null
}

const globalView = (memory: RemoteMemory): OpexGlobalMemory => ({ id: memory.id, title: memory.title ?? "", text: memory.text ?? "", updatedAt: memory.updated_at ?? null })

export async function listOpexGlobalMemories(): Promise<OpexGlobalMemory[]> {
    const client = await globalClient()
    const all: OpexGlobalMemory[] = []
    let cursor: string | null = null
    for (let page = 0; page < 20; page++) {
        const result = (await client.call("GET", "/v1/memories", { query: { channels: OPEX_CHARACTER_GLOBAL_CHANNEL, limit: 100, ...(cursor ? { cursor } : {}) } })) as { memories: RemoteMemory[]; next_cursor: string | null }
        all.push(...result.memories.map(globalView))
        cursor = result.next_cursor
        if (!cursor) break
    }
    return all
}

export async function createOpexGlobalMemory(input: OpexMemoryInput, actorId: string): Promise<OpexGlobalMemory> {
    const client = await globalClient()
    const written = (await client.call("POST", "/v1/memories", { body: { channel: OPEX_CHARACTER_GLOBAL_CHANNEL, title: input.title, text: input.text, origin: { source: "dndicas", label: "Configuração do Agente Maddox" } } })) as { memory?: RemoteMemory; id?: string }
    const memory = written.memory ?? (written as RemoteMemory)
    await auditEngramind(actorId, "create_memory", AcaoAuditoria.CRIAR, { canal: OPEX_CHARACTER_GLOBAL_CHANNEL, memoria: memory.id ?? null, titulo: input.title })
    return globalView({ ...memory, title: memory.title ?? input.title, text: memory.text ?? input.text })
}

export async function updateOpexGlobalMemory(memoryId: string, input: OpexMemoryInput, actorId: string): Promise<OpexGlobalMemory> {
    const client = await globalClient()
    const written = (await client.call("PATCH", `/v1/memories/${encodeURIComponent(memoryId)}`, { body: { title: input.title, text: input.text } })) as { memory?: RemoteMemory }
    const memory = written.memory ?? (written as RemoteMemory)
    await auditEngramind(actorId, "update_memory", AcaoAuditoria.ATUALIZAR, { canal: OPEX_CHARACTER_GLOBAL_CHANNEL, memoria: memoryId, titulo: input.title })
    return globalView({ ...memory, id: memory.id ?? memoryId, title: memory.title ?? input.title, text: memory.text ?? input.text })
}

export async function deleteOpexGlobalMemory(memoryId: string, actorId: string): Promise<void> {
    const client = await globalClient()
    await client.memories.delete(memoryId)
    await auditEngramind(actorId, "delete_memory", AcaoAuditoria.EXCLUIR, { canal: OPEX_CHARACTER_GLOBAL_CHANNEL, memoria: memoryId })
}
