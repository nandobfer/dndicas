import { beforeEach, describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"

type SearchItem = {
    id: string
    _id: string
    name: string
    type: string
    status: "active" | "inactive"
}

const fuseInstances: Array<{ items: SearchItem[] }> = []
const fuseSearch = vi.fn((items: SearchItem[], query: string) =>
    items
        .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
        .map((item, index) => ({ item, score: index / 10 }))
)

function mockSearchDependencies() {
    vi.doMock("fuse.js", () => ({
        default: class MockFuse {
            private items: SearchItem[]

            constructor(items: SearchItem[]) {
                this.items = items
                fuseInstances.push({ items })
            }

            search(query: string) {
                return fuseSearch(this.items, query)
            }
        },
    }))

    vi.doMock("@/lib/config/entities", () => ({
        ENTITY_PROVIDERS: [
            {
                name: "Regra",
                endpoint: () => "/api/rules",
                map: (item: SearchItem) => ({ ...item, type: "Regra" }),
            },
            {
                name: "Magia",
                endpoint: () => "/api/spells/search",
                map: (item: SearchItem) => ({ ...item, type: "Magia" }),
            },
        ],
    }))
}

function mockFetch() {
    const responses: Record<string, SearchItem[]> = {
        "/api/rules": [
            { id: "rule-1", _id: "rule-1", name: "Fire Rules", type: "Regra", status: "active" },
            { id: "rule-2", _id: "rule-2", name: "Cold Rules", type: "Regra", status: "active" },
        ],
        "/api/spells/search": [
            { id: "spell-1", _id: "spell-1", name: "Fire Bolt", type: "Magia", status: "active" },
            { id: "spell-2", _id: "spell-2", name: "Fireball", type: "Magia", status: "active" },
        ],
    }

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        return {
            ok: true,
            json: async () => ({ items: responses[url] ?? [] }),
        }
    }))
}

describe("search engine cache", () => {
    beforeEach(() => {
        fuseInstances.length = 0
        fuseSearch.mockClear()
        mockSearchDependencies()
        mockFetch()
    })

    it("reuses the Fuse index and ranked results for repeated global searches with different offsets", async () => {
        const mod = await importFresh<typeof import("@/core/utils/search-engine")>("@/core/utils/search-engine")

        const firstPage = await mod.performUnifiedSearch("fire", 1, 0)
        const secondPage = await mod.performUnifiedSearch("fire", 1, 1)

        expect(firstPage.map((item) => item.id)).toEqual(["rule-1"])
        expect(secondPage.map((item) => item.id)).toEqual(["spell-1"])
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(fuseInstances).toHaveLength(1)
        expect(fuseSearch).toHaveBeenCalledTimes(1)
    })

    it("reuses the Fuse index but computes a new ranking for a different query", async () => {
        const mod = await importFresh<typeof import("@/core/utils/search-engine")>("@/core/utils/search-engine")

        await mod.performUnifiedSearch("fire", 10, 0)
        await mod.performUnifiedSearch("cold", 10, 0)

        expect(fetch).toHaveBeenCalledTimes(2)
        expect(fuseInstances).toHaveLength(1)
        expect(fuseSearch).toHaveBeenCalledTimes(2)
        expect(fuseSearch.mock.calls.map((call) => call[1])).toEqual(["fire", "cold"])
    })

    it("keeps separate cached indexes for specific entity type searches", async () => {
        const mod = await importFresh<typeof import("@/core/utils/search-engine")>("@/core/utils/search-engine")

        await mod.performUnifiedSearch("fire", 10, 0)
        const spells = await mod.performUnifiedSearch("fire", 10, 0, { specificEntityType: "Magia" })
        await mod.performUnifiedSearch("fire", 10, 1, { specificEntityType: "Magia" })

        expect(spells.map((item) => item.id)).toEqual(["spell-1", "spell-2"])
        expect(fetch).toHaveBeenCalledTimes(2)
        expect(fuseInstances).toHaveLength(2)
        expect(fuseSearch).toHaveBeenCalledTimes(2)
    })

    it("clears unified search caches when invalidated", async () => {
        const mod = await importFresh<typeof import("@/core/utils/search-engine")>("@/core/utils/search-engine")

        await mod.performUnifiedSearch("fire", 10, 0)
        mod.invalidateSearchCache()
        await mod.performUnifiedSearch("fire", 10, 0)

        expect(fetch).toHaveBeenCalledTimes(4)
        expect(fuseInstances).toHaveLength(2)
        expect(fuseSearch).toHaveBeenCalledTimes(2)
    })
})
