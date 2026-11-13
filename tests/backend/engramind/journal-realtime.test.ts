import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { Types } from "mongoose"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { clearDb, startDb, stopDb } from "./helpers"

/**
 * Aviso do Diário em tempo real (`maddox.campaign.changed`): ids sintéticos de Personagem Opex (`opex:<memberId>`) não
 * viram canal. O Pusher recusa o nome e derrubaria o lote inteiro, e o jogador humano também deixaria de receber.
 */

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))
const publishToChannels = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/pusher/channels", () => ({ publishToChannels }))

const { notifyJournalChanged } = await import("@/features/engramind/server/campaign-memories")
const { notifyCampaignChanged } = await import("@/features/maddox/server/campaign-realtime")
const { MaddoxCampaignMemberModel } = await import("@/features/maddox/models")

vi.setConfig({ testTimeout: 20_000 })

let mongo: MongoMemoryServer | undefined
beforeAll(async () => {
    mongo = await startDb("engramind_journal_realtime_test")
}, 180_000)
afterAll(async () => stopDb(mongo), 30_000)
beforeEach(async () => {
    await clearDb()
    publishToChannels.mockClear()
})

describe("aviso do Diário sem canais de Personagem Opex", () => {
    it("notifyCampaignChanged ignora ids opex:", async () => {
        await notifyCampaignChanged("c1", ["u1", "opex:abc", "u1", ""])
        expect(publishToChannels).toHaveBeenCalledWith(["private-maddox-u-u1"], "maddox.campaign.changed", { campaignId: "c1" })
    })

    it("notifyJournalChanged avisa só os humanos da campanha", async () => {
        const campaignId = new Types.ObjectId()
        const opexId = new Types.ObjectId()
        await MaddoxCampaignMemberModel.collection.insertMany([
            { campaignId, userId: "u-human", kind: "human", status: "joined" },
            { _id: opexId, campaignId, userId: `opex:${String(opexId)}`, kind: "opex", status: "joined" },
            { campaignId, userId: "u-left", kind: "human", status: "left" },
        ])
        await notifyJournalChanged(String(campaignId))
        expect(publishToChannels).toHaveBeenCalledTimes(1)
        expect(publishToChannels).toHaveBeenCalledWith(["private-maddox-u-u-human"], "maddox.campaign.changed", { campaignId: String(campaignId) })
    })
})
