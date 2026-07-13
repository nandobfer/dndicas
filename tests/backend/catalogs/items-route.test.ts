import { describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"
import { makeRequest, readJson } from "../helpers/http"

describe("items backend route", () => {
    it("GET /api/items uses alphabetical base ordering", async () => {
        const items = [{ _id: "item-1", name: "Amuleto", status: "active" }]
        const sort = vi.fn().mockResolvedValue(items)
        const find = vi.fn(() => ({ sort }))
        const applyFuzzySearch = vi.fn((values) => values)

        vi.doMock("@/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock("@/features/items/database/item", () => ({ ItemModel: { find } }))
        vi.doMock("@/features/items/api/validation", () => ({ createItemSchema: { safeParse: vi.fn() } }))
        vi.doMock("@/features/users/api/audit-service", () => ({ createAuditLog: vi.fn() }))
        vi.doMock("@/core/auth/server", () => ({ auth: vi.fn() }))
        vi.doMock("@/core/utils/search-engine", () => ({ applyFuzzySearch }))

        const mod = await importFresh<typeof import("@/app/api/items/route")>("@/app/api/items/route")
        const response = await mod.GET(makeRequest("http://localhost/api/items"))
        const payload = await readJson<{ items: Array<{ name: string }> }>(response)

        expect(response.status).toBe(200)
        expect(sort).toHaveBeenCalledWith({ name: 1 })
        expect(applyFuzzySearch).not.toHaveBeenCalled()
        expect(payload.items).toEqual(items)
    })
})
