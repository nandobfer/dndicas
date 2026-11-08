import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryServer } from "mongodb-memory-server"
import { channelDisplayHint, channelDisplayName, channelNameParts } from "@engramind/client/react"
import { CAMPAIGN_CHANNEL_PREFIX, campaignChannel, campaignChannels } from "@/features/engramind/constants"
import { campaignChannelLabels } from "@/features/engramind/network/channel-labels"
import { clearDb, startDb, stopDb } from "./helpers"

vi.mock("@/lib/db", async (importOriginal) => (await import("./helpers")).libDbMock(importOriginal))

const { dbConnect } = await import("@/lib/db")
const { listCampaignChannelNames } = await import("@/features/engramind/server/channel-labels")
const { MaddoxCampaignModel } = await import("@/features/maddox/models")

const ID = "6650f1a2b3c4d5e6f7a8b9c0"
const OTHER = "6650f1a2b3c4d5e6f7a8b9c1"

describe("rótulos dos canais das campanhas (DND-29)", () => {
    const labels = campaignChannelLabels([{ id: ID, name: "  Águas de Prata " }])

    it("campanha conhecida: nome e visibilidade no lugar do id, com o prefixo da campanha", () => {
        const [players, master] = campaignChannels(ID)
        expect(labels.get(players!)).toEqual({ title: "Águas de Prata · Jogadores", hint: 'Memórias da campanha "Águas de Prata" (jogadores)', prefix: CAMPAIGN_CHANNEL_PREFIX })
        expect(labels.get(master!)).toEqual({ title: "Águas de Prata · Mestre", hint: 'Memórias da campanha "Águas de Prata" (mestre)', prefix: CAMPAIGN_CHANNEL_PREFIX })
        expect(channelDisplayName(players!, labels)).toBe("dndicas/maddox/campanhas/Águas de Prata · Jogadores")
        expect(channelNameParts(master!, labels)).toEqual({ prefix: "dndicas/maddox/campanhas/", title: "Águas de Prata · Mestre", hint: 'Memórias da campanha "Águas de Prata" (mestre)' })
        expect(channelDisplayName(players!, labels)).not.toContain(ID)
    })

    it("a dica mantém o slug real, com o id", () => {
        const slug = campaignChannel(ID, "players")
        expect(channelDisplayHint(slug, labels)).toBe(`Memórias da campanha "Águas de Prata" (jogadores) · ${slug}`)
    })

    it("campanha desconhecida ou sem nome: sem rótulo, o slug como está", () => {
        const withEmpty = campaignChannelLabels([{ id: OTHER, name: "   " }, { id: "", name: "Sem id" }])
        expect(withEmpty.size).toBe(0)
        const unknown = campaignChannel(OTHER, "players")
        expect(labels.get(unknown)).toBeUndefined()
        expect(channelDisplayName(unknown, labels)).toBe(unknown)
        expect(channelNameParts(unknown, labels)).toEqual({ prefix: `${CAMPAIGN_CHANNEL_PREFIX}${OTHER}/`, title: "jogadores", hint: null })
    })

    it("canais que não são de campanha ficam inalterados", () => {
        for (const slug of ["dndicas/opex/global", "dndicas/maddox", `${CAMPAIGN_CHANNEL_PREFIX}${ID}/outro`]) {
            expect(labels.has(slug)).toBe(false)
            expect(channelDisplayName(slug, labels)).toBe(slug)
        }
    })
})

describe("listCampaignChannelNames", () => {
    let mongo: MongoMemoryServer | undefined

    beforeAll(async () => {
        mongo = await startDb("engramind_channel_labels_test")
    }, 180_000)
    afterAll(async () => stopDb(mongo), 30_000)
    beforeEach(async () => clearDb())

    it("só id e nome de todas as campanhas, inclusive as arquivadas", async () => {
        const active = await MaddoxCampaignModel.create({ name: "Brumas", ownerId: "u1", rigor: "narrativo" })
        const archived = await MaddoxCampaignModel.create({ name: "Águas de Prata", ownerId: "u2", rigor: "narrativo", status: "archived" })
        const names = await listCampaignChannelNames()
        expect(names).toHaveLength(2)
        expect(names).toEqual(expect.arrayContaining([{ id: String(active._id), name: "Brumas" }, { id: String(archived._id), name: "Águas de Prata" }]))
        for (const item of names) expect(Object.keys(item).sort()).toEqual(["id", "name"])
    })

    it("falha no banco: lista vazia, sem lançar", async () => {
        vi.mocked(dbConnect).mockRejectedValueOnce(new Error("banco fora"))
        await expect(listCampaignChannelNames()).resolves.toEqual([])
    })
})
