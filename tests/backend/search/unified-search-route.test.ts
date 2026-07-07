import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeRequest, readJson } from "../helpers/http"
import { importFresh } from "../helpers/module"

const searchUnifiedEntities = vi.fn()

describe("GET /api/search", () => {
    beforeEach(() => {
        searchUnifiedEntities.mockReset()
        vi.doMock("@/features/search/api/unified-search-service", () => ({
            searchUnifiedEntities,
        }))
    })

    it("forwards query, pagination, and filters to the unified search service", async () => {
        searchUnifiedEntities.mockResolvedValue([
            { id: "spell-1", _id: "spell-1", name: "Bola de Fogo", label: "Bola de Fogo", type: "Magia", status: "active" },
        ])

        const mod = await importFresh<typeof import("@/app/api/search/route")>("@/app/api/search/route")
        const response = await mod.GET(makeRequest("http://localhost/api/search?q=fogo&limit=10&offset=20&types=Magia,Item&itemTypes=weapon&circles=3&parentClassId=class-1"))
        const payload = await readJson<{ items: Array<{ id: string }> }>(response)

        expect(response.status).toBe(200)
        expect(payload.items).toEqual([{ id: "spell-1", _id: "spell-1", name: "Bola de Fogo", label: "Bola de Fogo", type: "Magia", status: "active" }])
        expect(searchUnifiedEntities).toHaveBeenCalledWith({
            query: "fogo",
            limit: 10,
            offset: 20,
            specificEntityType: undefined,
            specificEntityTypes: ["Magia", "Item"],
            itemTypes: ["weapon"],
            circles: [3],
            parentClassId: "class-1",
        })
    })

    it("returns 400 for invalid search parameters", async () => {
        const mod = await importFresh<typeof import("@/app/api/search/route")>("@/app/api/search/route")
        const response = await mod.GET(makeRequest("http://localhost/api/search?q=fogo&limit=999"))

        expect(response.status).toBe(400)
        expect(searchUnifiedEntities).not.toHaveBeenCalled()
    })
})
