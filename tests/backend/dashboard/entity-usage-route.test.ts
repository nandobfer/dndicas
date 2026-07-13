import { describe, expect, it, vi } from "vitest"
import { makeRequest, readJson } from "../helpers/http"
import { importFresh } from "../helpers/module"

describe("entity usage stats route", () => {
    it("returns 400 for invalid entity types", async () => {
        vi.doMock("@/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock("@/features/character-sheets/models/character-sheet", () => ({ CharacterSheet: { countDocuments: vi.fn(), aggregate: vi.fn() } }))
        vi.doMock("@/features/character-sheets/models/character-spell", () => ({ CharacterSpell: { countDocuments: vi.fn() } }))
        vi.doMock("@/features/character-sheets/models/character-feat", () => ({ CharacterFeat: { countDocuments: vi.fn() } }))
        vi.doMock("@/features/character-sheets/models/character-item", () => ({ CharacterItem: { countDocuments: vi.fn() } }))
        vi.doMock("@/features/character-sheets/models/character-trait", () => ({ CharacterTrait: { countDocuments: vi.fn() } }))
        vi.doMock("@/features/monsters/models/user-npc", () => ({ UserNpcModel: { countDocuments: vi.fn() } }))

        const mod = await importFresh<typeof import("@/app/api/stats/entity-usage/route")>("@/app/api/stats/entity-usage/route")
        const response = await mod.GET(makeRequest("http://localhost/api/stats/entity-usage?entityType=Segredo"))
        const payload = await readJson<{ error: string }>(response)

        expect(response.status).toBe(400)
        expect(payload.error).toBe("Tipo de entidade inválido")
    })

    it("aggregates character feat usage from ficha entries and resource charges", async () => {
        const dbConnect = vi.fn().mockResolvedValue(undefined)
        const characterSheetAggregate = vi.fn().mockResolvedValue([{ count: 3 }])
        const characterFeatCount = vi.fn().mockResolvedValue(5)

        vi.doMock("@/core/database/db", () => ({ default: dbConnect }))
        vi.doMock("@/features/character-sheets/models/character-sheet", () => ({ CharacterSheet: { countDocuments: vi.fn(), aggregate: characterSheetAggregate } }))
        vi.doMock("@/features/character-sheets/models/character-spell", () => ({ CharacterSpell: { countDocuments: vi.fn() } }))
        vi.doMock("@/features/character-sheets/models/character-feat", () => ({ CharacterFeat: { countDocuments: characterFeatCount } }))
        vi.doMock("@/features/character-sheets/models/character-item", () => ({ CharacterItem: { countDocuments: vi.fn() } }))
        vi.doMock("@/features/character-sheets/models/character-trait", () => ({ CharacterTrait: { countDocuments: vi.fn() } }))
        vi.doMock("@/features/monsters/models/user-npc", () => ({ UserNpcModel: { countDocuments: vi.fn() } }))

        const mod = await importFresh<typeof import("@/app/api/stats/entity-usage/route")>("@/app/api/stats/entity-usage/route")
        const response = await mod.GET(makeRequest("http://localhost/api/stats/entity-usage?entityType=Talento"))
        const payload = await readJson<{ active: number; usage: Array<{ context: string; count: number }> }>(response)

        expect(response.status).toBe(200)
        expect(dbConnect).toHaveBeenCalled()
        expect(characterFeatCount).toHaveBeenCalledWith({ catalogFeatId: { $ne: null } })
        expect(characterSheetAggregate).toHaveBeenCalledWith([
            { $unwind: "$resourceCharges" },
            { $match: { "resourceCharges.source.entityType": "Talento" } },
            { $count: "count" },
        ])
        expect(payload).toEqual({
            active: 8,
            usage: [
                { context: "Fichas", count: 5 },
                { context: "Recursos", count: 3 },
            ],
        })
    })
})
