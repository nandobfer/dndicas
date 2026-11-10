import { engramindCodeOf, type EngramindClient } from "@engramind/client/server"
import { Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import { decryptSecret, encryptSecret, isEncryptedSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox"
import { MaddoxCampaignModel, MaddoxNpcModel } from "@/features/maddox/models"
import { AGENT_TOKEN_SCOPES, ENGRAMIND_APP, OPEX_NPC_GLOBAL_CHANNEL, opexNpcAgentSlug, opexNpcChannel } from "../constants"
import { clientFor, engramindAppClient, engramindConnection } from "./client"
import { ensureAgentSubscription, tidyChannel } from "./bootstrap"
import { globalMemoriesFor, type OpexGlobalMemory, type OpexGlobalMemoryInput } from "./global-memories"
import { PendingWrite, pendingWriteId } from "./pending-writes"
import { rewindTags } from "../campaign-memory-format"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf } from "./shared"

/**
 * Memórias dos NPCs Opex no Engramind (DND-27) — SOMENTE servidor.
 *
 * Cada NPC Opex tem um agente próprio (`dndicas/npc-opex-<npcId>`), criado pelo token de app, com só 2 assinaturas
 * exatas `inject`: o canal global `dndicas/npc-opex` e o individual `dndicas/npc-opex/<campaignId>/<npcId>` (que nasce
 * nessa assinatura). NUNCA assina os canais Jogadores ou Mestre da campanha: o Maddox manda o contexto da cena em cada
 * consulta. O token do agente fica cifrado no NPC (`opex.engramind.tokenBox`, `select: false`).
 *
 * Desfazer (ou a morte) arquiva o canal, desativa o agente e revoga o token; uma nova promoção restaura o canal (as
 * memórias voltam) e emite outro token. Arquivar a campanha arquiva os canais dos NPCs Opex ativos e restaurá-la os
 * restaura. Tudo em melhor esforço: uma falha é logada e nunca trava o jogo (o NPC decide sem memórias).
 */

const CONTEXT_TIMEOUT_MS = 5_000

const fullSlug = (npcId: string) => `${ENGRAMIND_APP}/${opexNpcAgentSlug(npcId)}`
export const opexNpcChannels = (campaignId: string, npcId: string) => [OPEX_NPC_GLOBAL_CHANNEL, opexNpcChannel(campaignId, npcId)]

export interface OpexNpcRef {
    campaignId: string
    npcId: string
    npcName: string
}

export interface OpexNpcMemoryInput {
    title: string
    text: string
}

/** Memória inicial: chaves fixas, atualizadas a cada promoção. */
export const OPEX_NPC_INITIAL_KEYS = { description: "npc-inicial:descricao", secrets: "npc-inicial:segredos" } as const

type StoredNpc = { status?: string; opex?: { active?: boolean; engramind?: { tokenId?: string | null; tokenBox?: unknown } | null } | null }

async function ensureAgent(client: EngramindClient, npcId: string, name: string): Promise<void> {
    const description = "NPC Opex de uma Campanha Maddox (decide as falas e ações do NPC)."
    try {
        const agent = await client.agents.create({ app: ENGRAMIND_APP, slug: opexNpcAgentSlug(npcId), name, description })
        if (agent.disabled_at) await client.agents.update(fullSlug(npcId), { disabled: false })
    } catch (error) {
        if (engramindCodeOf(error) !== "SLUG_ALREADY_EXISTS") throw error
        await client.agents.update(fullSlug(npcId), { name, disabled: false })
    }
}

/**
 * Cria (ou confere) o agente, as 2 assinaturas e o token do NPC Opex; restaura o canal individual se estava arquivado.
 * Idempotente: com token gravado, só confere. Nunca lança: a falha fica em `opex.engramind.error`.
 */
export async function provisionOpexNpcAgent(ref: OpexNpcRef, actorId = "system:engramind"): Promise<boolean> {
    try {
        await dbConnect()
        const client = await engramindAppClient()
        if (!client) return false
        const campaign = await MaddoxCampaignModel.findById(ref.campaignId).select("name status").lean<{ _id: unknown; name: string; status: string }>()
        if (!campaign) return false
        const name = `${ref.npcName || "NPC Opex"} · ${campaign.name}`.slice(0, 120)
        await ensureAgent(client, ref.npcId, name)
        const slug = fullSlug(ref.npcId)
        const channel = opexNpcChannel(ref.campaignId, ref.npcId)
        await ensureAgentSubscription(client, slug, OPEX_NPC_GLOBAL_CHANNEL, "inject")
        const { channelCreated } = await ensureAgentSubscription(client, slug, channel, "inject")
        await tidyChannel(client, channel, `${name} · NPC Opex`, `Memórias individuais do NPC Opex na campanha "${campaign.name}" (os jogadores não leem).`, channelCreated)
        if (campaign.status === "archived") await client.channels.archive(channel).catch(() => undefined)

        const npc = await MaddoxNpcModel.findById(ref.npcId).select("+opex.engramind.tokenBox").lean<StoredNpc>()
        const stored = npc?.opex?.engramind
        if (stored?.tokenId && isEncryptedSecret(stored.tokenBox)) {
            await MaddoxNpcModel.updateOne({ _id: ref.npcId }, { $set: { "opex.engramind.agentSlug": slug, "opex.engramind.channel": channel, "opex.engramind.error": null } })
            return true
        }
        if (!isSecretBoxConfigured()) throw new Error("INTEGRATIONS_ENCRYPTION_KEY ausente: o token do NPC Opex não pode ser gravado")
        const issued = await client.tokens.issue({ kind: "agent", agent: slug, scopes: [...AGENT_TOKEN_SCOPES], label: `dndicas npc opex ${ref.npcId}` })
        if (!issued.secret) throw new Error(`O Engramind não devolveu o segredo do token de ${slug}`)
        await MaddoxNpcModel.updateOne(
            { _id: ref.npcId },
            { $set: { "opex.engramind": { agentSlug: slug, channel, tokenId: issued.token.id, tokenBox: encryptSecret(issued.secret), provisionedAt: new Date(), error: null } } },
        )
        await auditEngramind(actorId, "issue_token", AcaoAuditoria.CRIAR, { agente: slug, token: issued.token.id, canais: opexNpcChannels(ref.campaignId, ref.npcId) })
        return true
    } catch (error) {
        engramindLog.warn({ npcId: ref.npcId, err: messageOf(error) }, "[engramind] agente do NPC Opex não configurado")
        await MaddoxNpcModel.updateOne({ _id: ref.npcId, opex: { $ne: null } }, { $set: { "opex.engramind.error": messageOf(error).slice(0, 500) } }).catch(() => undefined)
        return false
    }
}

/** Cliente com o token do próprio NPC Opex (ou `null` sem token gravado). */
export async function opexNpcClient(npcId: string): Promise<EngramindClient | null> {
    const connection = await engramindConnection().catch(() => null)
    if (!connection) return null
    await dbConnect()
    const npc = await MaddoxNpcModel.findById(npcId).select("+opex.engramind.tokenBox").lean<StoredNpc>()
    const box = npc?.opex?.engramind?.tokenBox
    if (!isEncryptedSecret(box)) return null
    try {
        return clientFor(connection.baseUrl, decryptSecret(box))
    } catch (error) {
        engramindLog.warn({ npcId, err: messageOf(error) }, "[engramind] token do NPC Opex ilegível")
        return null
    }
}

/**
 * Bloco de memórias do NPC Opex para o prompt: o contexto dos 2 canais (global e individual) pedido com o token dele.
 * Sem token, tenta provisionar uma vez ("criado na próxima consulta"); com a rede fora, devolve "". Nunca lança.
 */
export async function opexNpcMemoryBlock(ref: OpexNpcRef): Promise<string> {
    try {
        let client = await opexNpcClient(ref.npcId)
        if (!client && (await engramindConnection().catch(() => null))) {
            await provisionOpexNpcAgent(ref)
            client = await opexNpcClient(ref.npcId)
        }
        if (!client) return ""
        const view = await client.context({ channels: opexNpcChannels(ref.campaignId, ref.npcId) }, { timeoutMs: CONTEXT_TIMEOUT_MS })
        return typeof view?.content === "string" ? view.content.trim() : ""
    } catch (error) {
        engramindLog.warn({ npcId: ref.npcId, err: messageOf(error) }, "[engramind] NPC Opex sem memórias nesta consulta")
        return ""
    }
}

export const opexNpcMemoryKey = (title: string) =>
    `opex:${title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)}`

interface KeyedMemory {
    key: string
    title: string
    text: string
}

/** Grava (upsert pela chave) no canal individual; sem token ou com a rede fora, vai para a fila com `agentNpcId`. */
async function writeKeyed(ref: OpexNpcRef, memories: readonly KeyedMemory[], label: string, turnNumber: number | null): Promise<{ saved: number; pending: number }> {
    let saved = 0
    let pending = 0
    if (!memories.length || !(await engramindConnection().catch(() => null))) return { saved, pending }
    const channel = opexNpcChannel(ref.campaignId, ref.npcId)
    const client = await opexNpcClient(ref.npcId)
    const { textMaxOf } = await import("./campaign-memories")
    const max = client ? await textMaxOf(client, channel).catch(() => null) : null
    for (const memory of memories) {
        const body = { channel, key: memory.key, upsert: true, title: memory.title.slice(0, 120), text: max && memory.text.length > max ? memory.text.slice(0, max).trimEnd() : memory.text, tags: ["npc-opex", ...rewindTags(turnNumber)], origin: { source: "maddox", label } }
        try {
            if (!client) throw new Error("Token do NPC Opex indisponível")
            await client.call("POST", "/v1/memories", { body })
            saved++
        } catch (error) {
            const id = pendingWriteId(ref.campaignId, `npc:${ref.npcId}:${memory.key}`)
            await PendingWrite.updateOne(
                { _id: id },
                { $set: { campaignId: ref.campaignId, key: memory.key, channel, body, agentNpcId: ref.npcId, agentMemberId: null, lastError: messageOf(error).slice(0, 500), failed: false }, $setOnInsert: { attempts: 0 } },
                { upsert: true },
            ).catch((queueError: unknown) => engramindLog.warn({ npcId: ref.npcId, err: messageOf(queueError) }, "[engramind] memória do NPC Opex perdida"))
            pending++
        }
    }
    return { saved, pending }
}

/**
 * Memórias que o agente do NPC (ou o Maddox, fora de cena) decidiu guardar: chave do título (`opex:<título>`, upsert),
 * então o mesmo assunto atualiza em vez de duplicar. Nunca lança.
 */
export async function saveOpexNpcMemories(ref: OpexNpcRef, memories: readonly OpexNpcMemoryInput[], label = ref.npcName || "NPC Opex", turnNumber: number | null = null): Promise<{ saved: number; pending: number }> {
    const keyed = memories.map((memory) => ({ key: opexNpcMemoryKey(memory.title), title: memory.title, text: memory.text })).filter((memory) => memory.key !== "opex:" && memory.text.trim())
    return writeKeyed(ref, keyed, label, turnNumber)
}

/** Memória inicial na promoção: a descrição pública ("Quem eu sou") e as notas do mestre ("Meus segredos"), se houver. */
export async function seedOpexNpcInitialMemories(ref: OpexNpcRef, input: { publicDescription: string; masterNotes: string }, turnNumber: number | null = null): Promise<{ saved: number; pending: number }> {
    const memories: KeyedMemory[] = []
    if (input.publicDescription.trim()) memories.push({ key: OPEX_NPC_INITIAL_KEYS.description, title: "Quem eu sou", text: input.publicDescription.trim() })
    if (input.masterNotes.trim()) memories.push({ key: OPEX_NPC_INITIAL_KEYS.secrets, title: "Meus segredos", text: input.masterNotes.trim() })
    return writeKeyed(ref, memories, "Promoção a NPC Opex", turnNumber)
}

/** NPC desfeito (ou morto): arquiva o canal individual, desativa o agente e revoga o token. Nunca lança. */
export async function retireOpexNpcAgent(ref: Pick<OpexNpcRef, "campaignId" | "npcId">, actorId = "system:engramind"): Promise<void> {
    try {
        const client = await engramindAppClient()
        if (!client) return
        const npc = await MaddoxNpcModel.findById(ref.npcId).select("opex.engramind").lean<StoredNpc>()
        const channel = opexNpcChannel(ref.campaignId, ref.npcId)
        await client.channels.archive(channel).catch((error: unknown) => {
            if (engramindCodeOf(error) !== "CHANNEL_NOT_FOUND") throw error
        })
        await client.agents.update(fullSlug(ref.npcId), { disabled: true }).catch((error: unknown) => {
            if (engramindCodeOf(error) !== "AGENT_NOT_FOUND") throw error
        })
        const tokenId = npc?.opex?.engramind?.tokenId
        if (tokenId) await client.tokens.revoke(tokenId).catch((error: unknown) => engramindLog.warn({ npcId: ref.npcId, err: messageOf(error) }, "[engramind] token do NPC Opex não revogado"))
        await MaddoxNpcModel.updateOne({ _id: ref.npcId, "opex.engramind": { $ne: null } }, { $set: { "opex.engramind.tokenId": null, "opex.engramind.tokenBox": null } })
        await auditEngramind(actorId, "archive_channel", AcaoAuditoria.ATUALIZAR, { agente: fullSlug(ref.npcId), canal: channel, token: tokenId ?? null })
    } catch (error) {
        engramindLog.warn({ npcId: ref.npcId, err: messageOf(error) }, "[engramind] agente do NPC Opex não aposentado")
    }
}

/** Canais individuais dos NPCs Opex ativos acompanham a campanha arquivada/restaurada. Devolve quantos mudaram. */
export async function setOpexNpcChannelsArchived(client: EngramindClient, campaignId: string, archived: boolean): Promise<number> {
    if (!Types.ObjectId.isValid(campaignId)) return 0
    const npcs = await MaddoxNpcModel.find({ campaignId: new Types.ObjectId(campaignId), "opex.active": true }).select("_id").lean<{ _id: unknown }[]>()
    let changed = 0
    for (const npc of npcs) {
        const channel = opexNpcChannel(campaignId, String(npc._id))
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

/**
 * Entrega da fila: cliente do NPC ainda Opex (provisiona se faltar o token); `null` = o NPC deixou de ser Opex e a entrada
 * é descartada. Ainda sem token depois de provisionar = erro (a entrada fica para o próximo ciclo).
 */
export async function opexNpcWriterFor(campaignId: string, npcId: string): Promise<EngramindClient | null> {
    if (!Types.ObjectId.isValid(npcId)) return null
    await dbConnect()
    const npc = await MaddoxNpcModel.findById(npcId).select("name opex.active").lean<{ name: string; opex?: { active?: boolean } | null }>()
    if (!npc?.opex?.active) return null
    const own = await opexNpcClient(npcId)
    if (own) return own
    await provisionOpexNpcAgent({ campaignId, npcId, npcName: npc.name })
    const provisioned = await opexNpcClient(npcId)
    if (!provisioned) throw new Error("Token do NPC Opex indisponível")
    return provisioned
}

// ── Memórias globais (configuração do Agente Maddox, só administradores) ─────

const globalMemories = globalMemoriesFor(
    "npc-opex",
    OPEX_NPC_GLOBAL_CHANNEL,
    "A rede de memórias (integração Engramind) não está disponível: as memórias globais dos NPCs Opex não podem ser lidas nem gravadas agora.",
)

export const listOpexNpcGlobalMemories = (): Promise<OpexGlobalMemory[]> => globalMemories.list()
export const createOpexNpcGlobalMemory = (input: OpexGlobalMemoryInput, actorId: string): Promise<OpexGlobalMemory> => globalMemories.create(input, actorId)
export const updateOpexNpcGlobalMemory = (memoryId: string, input: OpexGlobalMemoryInput, actorId: string): Promise<OpexGlobalMemory> => globalMemories.update(memoryId, input, actorId)
export const deleteOpexNpcGlobalMemory = (memoryId: string, actorId: string): Promise<void> => globalMemories.remove(memoryId, actorId)
