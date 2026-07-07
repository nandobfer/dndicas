import { beforeEach, describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"

type SearchFixture = Record<string, unknown>

const dbConnect = vi.fn()
const modelFind = vi.hoisted(() => ({
    rules: vi.fn(),
    traits: vi.fn(),
    feats: vi.fn(),
    spells: vi.fn(),
    classes: vi.fn(),
    backgrounds: vi.fn(),
    races: vi.fn(),
    items: vi.fn(),
    monsters: vi.fn(),
}))

function mockFind(items: SearchFixture[]) {
    return vi.fn(() => ({
        select: vi.fn(() => ({
            lean: vi.fn().mockResolvedValue(items),
        })),
    }))
}

function setupModelMocks(fixtures: Partial<Record<keyof typeof modelFind, SearchFixture[]>> = {}) {
    modelFind.rules.mockImplementation(mockFind(fixtures.rules ?? []))
    modelFind.traits.mockImplementation(mockFind(fixtures.traits ?? []))
    modelFind.feats.mockImplementation(mockFind(fixtures.feats ?? []))
    modelFind.spells.mockImplementation(mockFind(fixtures.spells ?? []))
    modelFind.classes.mockImplementation(mockFind(fixtures.classes ?? []))
    modelFind.backgrounds.mockImplementation(mockFind(fixtures.backgrounds ?? []))
    modelFind.races.mockImplementation(mockFind(fixtures.races ?? []))
    modelFind.items.mockImplementation(mockFind(fixtures.items ?? []))
    modelFind.monsters.mockImplementation(mockFind(fixtures.monsters ?? []))
}

vi.mock("@/core/database/db", () => ({ default: dbConnect }))
vi.mock("@/core/database/models/reference", () => ({ Reference: { find: modelFind.rules } }))
vi.mock("@/features/traits/database/trait", () => ({ Trait: { find: modelFind.traits } }))
vi.mock("@/features/feats/models/feat", () => ({ Feat: { find: modelFind.feats } }))
vi.mock("@/features/spells/models/spell", () => ({ Spell: { find: modelFind.spells } }))
vi.mock("@/features/classes/models/character-class", () => ({ CharacterClass: { find: modelFind.classes } }))
vi.mock("@/features/backgrounds/models/background", () => ({ BackgroundModel: { find: modelFind.backgrounds } }))
vi.mock("@/features/races/models/race", () => ({ RaceModel: { find: modelFind.races } }))
vi.mock("@/features/items/database/item", () => ({ ItemModel: { find: modelFind.items } }))
vi.mock("@/features/monsters/models/monster", () => ({ MonsterModel: { find: modelFind.monsters } }))

describe("searchUnifiedEntities", () => {
    beforeEach(() => {
        vi.resetModules()
        dbConnect.mockReset().mockResolvedValue(undefined)
        Object.values(modelFind).forEach((mock) => mock.mockReset())
        setupModelMocks()
    })

    it("returns no results for an empty global query", async () => {
        const { searchUnifiedEntities } = await importFresh<typeof import("@/features/search/api/unified-search-service")>("@/features/search/api/unified-search-service")

        const results = await searchUnifiedEntities({ query: "", limit: 10, offset: 0 })

        expect(results).toEqual([])
        expect(dbConnect).not.toHaveBeenCalled()
    })

    it("returns the first page when an empty query has a specific entity type", async () => {
        setupModelMocks({
            races: Array.from({ length: 12 }, (_, index) => ({
                _id: `race-${index + 1}`,
                name: `Raça ${index + 1}`,
                status: "active",
            })),
        })
        const { searchUnifiedEntities } = await importFresh<typeof import("@/features/search/api/unified-search-service")>("@/features/search/api/unified-search-service")

        const results = await searchUnifiedEntities({ query: "", limit: 10, offset: 0, specificEntityType: "Raça" })

        expect(results).toHaveLength(10)
        expect(results.map((item) => item.id)).toEqual([
            "race-1",
            "race-2",
            "race-3",
            "race-4",
            "race-5",
            "race-6",
            "race-7",
            "race-8",
            "race-9",
            "race-10",
        ])
    })

    it("filters empty subclass queries by parent class before paginating", async () => {
        setupModelMocks({
            classes: [
                {
                    _id: "class-1",
                    name: "Classe 1",
                    status: "active",
                    subclasses: [
                        { _id: "sub-1", name: "Subclasse A" },
                        { _id: "sub-2", name: "Subclasse B" },
                    ],
                },
                {
                    _id: "class-2",
                    name: "Classe 2",
                    status: "active",
                    subclasses: [{ _id: "sub-3", name: "Subclasse C" }],
                },
            ],
        })
        const { searchUnifiedEntities } = await importFresh<typeof import("@/features/search/api/unified-search-service")>("@/features/search/api/unified-search-service")

        const results = await searchUnifiedEntities({
            query: "",
            limit: 10,
            offset: 0,
            specificEntityType: "Subclasse",
            parentClassId: "class-1",
        })

        expect(results.map((item) => item.name)).toEqual(["Subclasse A", "Subclasse B"])
    })

    it("treats parentClassId as a subclass scope for empty queries even without an explicit type", async () => {
        setupModelMocks({
            races: [{ _id: "race-1", name: "Raça 1", status: "active" }],
            classes: [
                {
                    _id: "class-1",
                    name: "Classe 1",
                    status: "active",
                    subclasses: [{ _id: "sub-1", name: "Subclasse A" }],
                },
            ],
        })
        const { searchUnifiedEntities } = await importFresh<typeof import("@/features/search/api/unified-search-service")>("@/features/search/api/unified-search-service")

        const results = await searchUnifiedEntities({ query: "", limit: 10, offset: 0, parentClassId: "class-1" })

        expect(results.map((item) => item.type)).toEqual(["Subclasse"])
        expect(results.map((item) => item.name)).toEqual(["Subclasse A"])
    })
})
