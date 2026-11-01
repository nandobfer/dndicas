import { describe, expect, it, vi } from "vitest"
import type mongoose from "mongoose"

const created: string[] = []
const fake = (name: string) => ({ modelName: name, createIndexes: vi.fn(async () => void created.push(name)) })

vi.mock("@/features/maddox/models", () => ({
    MaddoxCampaignModel: fake("MaddoxCampaign"),
    MaddoxCampaignMemberModel: fake("MaddoxCampaignMember"),
    MaddoxCharacterModel: fake("MaddoxCharacter"),
    MaddoxNpcModel: fake("MaddoxNpc"),
    MaddoxCampaignMemoryModel: fake("MaddoxCampaignMemory"),
    MaddoxInterviewScriptModel: fake("MaddoxInterviewScript"),
    MaddoxInterviewModel: fake("MaddoxInterview"),
    MaddoxOpencodeSessionModel: fake("MaddoxOpencodeSession"),
    MaddoxCampaignMessageModel: fake("MaddoxCampaignMessage"),
    MaddoxCombatModel: fake("MaddoxCombat"),
    MaddoxCombatOptionProfileModel: fake("MaddoxCombatOptionProfile"),
}))

const { ensureMaddoxIndexes } = await import("@/lib/db/migrations/ensure-maddox-indexes")
const indexes = (model: unknown) => (model as mongoose.Model<unknown>).schema.indexes()

describe("migração ensure-maddox-indexes", () => {
    it("cria os índices de todas as coleções Maddox e pode rodar de novo", async () => {
        await ensureMaddoxIndexes()
        expect([...created].sort()).toEqual(["MaddoxCampaign", "MaddoxCampaignMember", "MaddoxCampaignMemory", "MaddoxCampaignMessage", "MaddoxCharacter", "MaddoxCombat", "MaddoxCombatOptionProfile", "MaddoxInterview", "MaddoxInterviewScript", "MaddoxNpc", "MaddoxOpencodeSession"])
        await expect(ensureMaddoxIndexes()).resolves.toBeUndefined()
    })

    it("está registrada no registry das migrações", async () => {
        const { readFile } = await import("node:fs/promises")
        const registry = await readFile("src/lib/db/migrations/registry.ts", "utf8")
        expect(registry).toContain('{ name: "ensure-maddox-indexes", run: () => ensureMaddoxIndexes() }')
    })

    it("os índices únicos que sustentam as regras existem nos schemas", async () => {
        const { MaddoxInterviewScriptModel } = await vi.importActual<typeof import("@/features/maddox/models/maddox-interview-script")>("@/features/maddox/models/maddox-interview-script")
        const { MaddoxOpencodeSessionModel } = await vi.importActual<typeof import("@/features/maddox/models/maddox-opencode-session")>("@/features/maddox/models/maddox-opencode-session")
        const { MaddoxInterviewModel } = await vi.importActual<typeof import("@/features/maddox/models/maddox-interview")>("@/features/maddox/models/maddox-interview")
        const { MaddoxCampaignMemberModel } = await vi.importActual<typeof import("@/features/maddox/models/maddox-campaign-member")>("@/features/maddox/models/maddox-campaign-member")
        expect(indexes(MaddoxInterviewScriptModel)).toContainEqual([{ kind: 1, version: 1 }, expect.objectContaining({ unique: true })])
        expect(indexes(MaddoxOpencodeSessionModel)).toContainEqual([{ campaignId: 1, purpose: 1, memberId: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { status: "active" } })])
        expect(indexes(MaddoxOpencodeSessionModel)).toContainEqual([{ sessionId: 1 }, expect.objectContaining({ unique: true })])
        expect(indexes(MaddoxInterviewModel)).toContainEqual([{ campaignId: 1, kind: 1, memberId: 1 }, expect.objectContaining({ unique: true })])
        expect(indexes(MaddoxCampaignMemberModel)).toContainEqual([{ campaignId: 1, userId: 1 }, expect.objectContaining({ unique: true })])
        const { MaddoxCampaignMessageModel } = await vi.importActual<typeof import("@/features/maddox/models/maddox-campaign-message")>("@/features/maddox/models/maddox-campaign-message")
        expect(indexes(MaddoxCampaignMessageModel)).toContainEqual([{ campaignId: 1, turnNumber: 1, memberId: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { turnAction: true } })])
        // Maddox 6: no máximo um combate ativo por campanha.
        const { MaddoxCombatModel } = await vi.importActual<typeof import("@/features/maddox/models/maddox-combat")>("@/features/maddox/models/maddox-combat")
        expect(indexes(MaddoxCombatModel)).toContainEqual([{ campaignId: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { status: "active" } })])
        // Maddox 7: uma janela de reação pendente por personagem; o cache do classificador por entidade e texto.
        const { MaddoxCampaignMessageModel: Messages } = await vi.importActual<typeof import("@/features/maddox/models/maddox-campaign-message")>("@/features/maddox/models/maddox-campaign-message")
        expect(indexes(Messages)).toContainEqual([{ campaignId: 1, memberId: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { kind: "combat-reaction", "combatReaction.status": "pending" } })])
        const { MaddoxCombatOptionProfileModel } = await vi.importActual<typeof import("@/features/maddox/models/maddox-combat-option-profile")>("@/features/maddox/models/maddox-combat-option-profile")
        expect(indexes(MaddoxCombatOptionProfileModel)).toContainEqual([{ entityType: 1, entityId: 1, textHash: 1 }, expect.objectContaining({ unique: true })])
    })
})
