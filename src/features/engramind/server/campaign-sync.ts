import type { Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import { MaddoxCampaignModel } from "@/features/maddox/models"
import type { CampaignSyncDto } from "../types"
import { engramindConnection } from "./client"
import { provisionCampaignMemoryNetwork, syncCampaignChannelLifecycle } from "./campaign-channels"
import { flushPendingWrites, pendingWritesSummary } from "./campaign-memories"
import { legacyCampaignMemoryCount } from "./campaign-memory-move"
import { ENGRAMIND_STATE_ID, EngramindState } from "./models"
import { engramindLog, messageOf, publishEngramind } from "./shared"

/**
 * Rotina das campanhas (cron `engramind-campaign-memories-sync`, 15 min, e "Sincronizar agora"): a rede de
 * cada campanha (categorias e canais), o ciclo de vida dos canais (`archived` arquiva; fora disso, restaura)
 * e a entrega da fila temporária de gravações. Não há espelho: o Engramind é a única fonte das memórias.
 */

const sync = globalThis as typeof globalThis & { __engramindCampaignSync?: Promise<string> | null }

async function run(actorId: string): Promise<string> {
    await dbConnect()
    if (!(await engramindConnection())) return "Engramind não configurado"
    const startedAt = new Date()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ campaignSync: 1 }).lean()
    let channels = 0
    try {
        const campaigns = await MaddoxCampaignModel.find({}).select({ name: 1, status: 1 }).lean<{ _id: Types.ObjectId; name: string; status: string }[]>()
        for (const campaign of campaigns) {
            const input = { id: String(campaign._id), name: campaign.name, status: campaign.status }
            try {
                if (await provisionCampaignMemoryNetwork(input)) channels += 2
            } catch (error) {
                engramindLog.warn({ campaignId: input.id, err: messageOf(error) }, "[engramind] canais da campanha ainda sem configurar")
            }
            await syncCampaignChannelLifecycle(input, actorId)
        }
        const queue = await flushPendingWrites()
        const lastResult = { ...queue, channels }
        await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { campaignSync: { lastRunAt: startedAt, lastOkAt: new Date(), lastError: null, lastResult } } }, { upsert: true })
        return `${queue.delivered} entregues, ${queue.failed} recusadas, ${queue.remaining} na fila`
    } catch (error) {
        const reason = messageOf(error)
        await EngramindState.updateOne(
            { _id: ENGRAMIND_STATE_ID },
            { $set: { campaignSync: { lastRunAt: startedAt, lastOkAt: state?.campaignSync?.lastOkAt ?? null, lastError: reason, lastResult: state?.campaignSync?.lastResult ?? null } } },
            { upsert: true },
        )
        throw error
    } finally {
        await publishEngramind({ type: "sync.updated" })
    }
}

/** Uma execução por vez; quem chega junto espera a que está rodando. */
export function syncCampaignMemories(actorId = "system:cron"): Promise<string> {
    if (sync.__engramindCampaignSync) return sync.__engramindCampaignSync
    const job = run(actorId).finally(() => {
        sync.__engramindCampaignSync = null
    })
    sync.__engramindCampaignSync = job
    return job
}

export async function getCampaignSync(): Promise<CampaignSyncDto> {
    await dbConnect()
    const [state, queue, legacy, configured] = await Promise.all([EngramindState.findById(ENGRAMIND_STATE_ID).lean(), pendingWritesSummary(), legacyCampaignMemoryCount().catch(() => 0), engramindConnection()])
    const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)
    const record = state?.campaignSync
    return {
        configured: Boolean(configured),
        lastRunAt: iso(record?.lastRunAt),
        lastOkAt: iso(record?.lastOkAt),
        lastError: record?.lastError ?? null,
        lastResult: record?.lastResult && "delivered" in record.lastResult ? record.lastResult : null,
        ...queue,
        legacyCampaignMemories: legacy,
        redator: { supported: state?.channelSettings?.supported ?? null, checkedAt: iso(state?.channelSettings?.checkedAt), message: state?.channelSettings?.message ?? null },
        categoryWarnings: state?.categoryWarnings ?? [],
        running: Boolean(sync.__engramindCampaignSync),
    }
}
