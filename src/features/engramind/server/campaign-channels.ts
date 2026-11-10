import { engramindCodeOf, type EngramindClient } from "@engramind/client/server"
import { dbConnect } from "@/lib/db"
import { MaddoxCampaignModel } from "@/features/maddox/models"
import { CAMPAIGN_CATEGORY_LIST, CAMPAIGN_VISIBILITY_NAMES, campaignChannels } from "../constants"
import { ensureCategories, listCategoryKeys } from "./categories"
import { engramindAppClient } from "./client"
import { ensureSubscription, tidyChannel } from "./bootstrap"
import { ENGRAMIND_STATE_ID, EngramindState } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog, messageOf } from "./shared"

/**
 * Rede de uma campanha no Engramind: as categorias das campanhas e os canais
 * `dndicas/maddox/campanhas/<id>/jogadores` e `…/mestre`, criados por assinatura exata `search` do
 * `dndicas/maddox` (o token de app não tem `create_channel`). Nasce na criação da campanha (e a gravação
 * e o cron refazem o que faltar). Campanha `archived` → canais arquivados; saiu de `archived` →
 * restaurados. Tudo em melhor esforço: uma falha é logada e nunca bloqueia o jogo.
 *
 * Redator: o dndicas pede `redator.rewrite_text = false` nos canais das campanhas. Hoje o Engramind só
 * aceita configuração por canal com token admin (`403 SCOPE_REQUIRED`): a tentativa fica registrada como
 * "não suportado" (aviso na aba Sincronização) e é refeita a cada 24 h.
 */

const provisioned = globalThis as typeof globalThis & { __engramindCampaignNets?: Set<string> }
const done = () => (provisioned.__engramindCampaignNets ??= new Set())
const SETTINGS_RECHECK_MS = 24 * 60 * 60_000

export const REDATOR_NOT_SUPPORTED_MESSAGE =
    "O Redator do Engramind pode reescrever o texto das memórias das campanhas: o Engramind ainda não deixa o token de app desligar a reescrita por canal (redator.rewrite_text). A reescrita chega ao jogo pela regra \"vale a última gravação\"."

const VISIBILITY_NAMES = [CAMPAIGN_VISIBILITY_NAMES.players, CAMPAIGN_VISIBILITY_NAMES.master] as const

/** Tenta desligar a reescrita do Redator nos canais (só quando o Engramind já aceita para o token de app). */
async function applyRedatorSettings(client: EngramindClient, channels: readonly string[]): Promise<void> {
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ channelSettings: 1 }).lean()
    const current = state?.channelSettings
    if (current?.supported === false && current.checkedAt && Date.now() - new Date(current.checkedAt).getTime() < SETTINGS_RECHECK_MS) return
    try {
        for (const channel of channels) await client.call("PUT", `/v1/channels/${encodeURIComponent(channel)}/settings`, { body: { "redator.rewrite_text": false } })
        await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { channelSettings: { supported: true, checkedAt: new Date(), message: null } } }, { upsert: true })
    } catch (error) {
        const code = engramindCodeOf(error)
        const unsupported = code === "SCOPE_REQUIRED" || code === "FOREIGN_APP" || code === "ROUTE_NOT_FOUND"
        await EngramindState.updateOne(
            { _id: ENGRAMIND_STATE_ID },
            { $set: { channelSettings: { supported: unsupported ? false : (current?.supported ?? null), checkedAt: new Date(), message: unsupported ? REDATOR_NOT_SUPPORTED_MESSAGE : messageOf(error) } } },
            { upsert: true },
        )
        if (!unsupported) engramindLog.warn({ err: messageOf(error) }, "[engramind] configuração do Redator nos canais da campanha falhou")
    }
}

export interface CampaignNetworkInput {
    id: string
    name: string
    status: string
}

/** Garante categorias e canais de uma campanha (idempotente; cache por processo). Lança em falha. */
export async function provisionCampaignMemoryNetwork(campaign: CampaignNetworkInput, options: { force?: boolean } = {}): Promise<boolean> {
    if (!options.force && done().has(campaign.id)) return true
    const client = await engramindAppClient()
    if (!client) return false
    const keys = await listCategoryKeys(client)
    if (keys && CAMPAIGN_CATEGORY_LIST.some((def) => !keys.includes(def.key))) await ensureCategories(CAMPAIGN_CATEGORY_LIST, client)
    const channels = campaignChannels(campaign.id)
    for (const [index, channel] of channels.entries()) {
        const { channelCreated } = await ensureSubscription(client, "maddox", channel, "search")
        if (campaign.status !== "archived") await tidyChannel(client, channel, `${campaign.name} · ${VISIBILITY_NAMES[index]}`, `Memórias da campanha "${campaign.name}" (${VISIBILITY_NAMES[index]!.toLowerCase()}).`, channelCreated)
        else if (channelCreated) await client.call("PATCH", `/v1/channels/${encodeURIComponent(channel)}`, { body: { name: `${campaign.name} · ${VISIBILITY_NAMES[index]}` } }).catch(() => undefined)
    }
    await applyRedatorSettings(client, channels)
    if (campaign.status === "archived") await setCampaignChannelsArchived(client, campaign.id, true)
    done().add(campaign.id)
    return true
}

/** Igual a `provisionCampaignMemoryNetwork`, sem lançar (criação da campanha e gravação das memórias). */
export function provisionCampaignMemoryNetworkSafely(campaign: CampaignNetworkInput): Promise<boolean> {
    return provisionCampaignMemoryNetwork(campaign).catch((error: unknown) => {
        engramindLog.warn({ campaignId: campaign.id, err: messageOf(error) }, "[engramind] canais da campanha não criados: o cron tenta de novo")
        return false
    })
}

async function setCampaignChannelsArchived(client: EngramindClient, campaignId: string, archived: boolean): Promise<number> {
    let changed = 0
    for (const channel of campaignChannels(campaignId)) {
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
 * Campanha `archived` arquiva os dois canais; fora de `archived`, restaura. Melhor esforço, auditado;
 * nunca lança.
 */
export async function syncCampaignChannelLifecycle(campaign: CampaignNetworkInput, actorId = "system:engramind"): Promise<void> {
    try {
        const client = await engramindAppClient()
        if (!client) return
        const archived = campaign.status === "archived"
        const changed = await setCampaignChannelsArchived(client, campaign.id, archived)
        if (changed) await auditEngramind(actorId, archived ? "archive_channel" : "restore_channel", AcaoAuditoria.ATUALIZAR, { campanha: campaign.id, canais: campaignChannels(campaign.id) })
        // Canais individuais dos Personagens Opex (DND-26) acompanham a campanha.
        const { setOpexChannelsArchived } = await import("./opex-characters")
        const opexChanged = await setOpexChannelsArchived(client, campaign.id, archived)
        if (opexChanged) await auditEngramind(actorId, archived ? "archive_channel" : "restore_channel", AcaoAuditoria.ATUALIZAR, { campanha: campaign.id, personagensOpex: opexChanged })
        // Canais individuais dos NPCs Opex ativos (DND-27) também.
        const { setOpexNpcChannelsArchived } = await import("./opex-npcs")
        const npcChanged = await setOpexNpcChannelsArchived(client, campaign.id, archived)
        if (npcChanged) await auditEngramind(actorId, archived ? "archive_channel" : "restore_channel", AcaoAuditoria.ATUALIZAR, { campanha: campaign.id, npcsOpex: npcChanged })
    } catch (error) {
        engramindLog.warn({ campaignId: campaign.id, err: messageOf(error) }, "[engramind] canais da campanha não arquivados/restaurados")
    }
}

/** Bootstrap e cron: rede de todas as campanhas (força a conferência). */
export async function provisionAllCampaignNetworks(actorId: string): Promise<{ total: number; ok: number; failed: number }> {
    await dbConnect()
    const campaigns = await MaddoxCampaignModel.find({}).select({ name: 1, status: 1 }).lean<{ _id: unknown; name: string; status: string }[]>()
    let ok = 0
    for (const campaign of campaigns) {
        try {
            if (await provisionCampaignMemoryNetwork({ id: String(campaign._id), name: campaign.name, status: campaign.status }, { force: true })) ok++
        } catch (error) {
            engramindLog.warn({ campaignId: String(campaign._id), err: messageOf(error), actorId }, "[engramind] rede da campanha não configurada")
        }
    }
    return { total: campaigns.length, ok, failed: campaigns.length - ok }
}

/** Testes: esquece as campanhas já configuradas neste processo. */
export function resetCampaignNetworksForTests(): void {
    provisioned.__engramindCampaignNets = new Set()
}
