import { beforeEach, describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"

const dbConnect = vi.fn()
const searchUnifiedEntities = vi.fn()

const modelMocks = vi.hoisted(() => ({
    ruleFindOne: vi.fn(),
    traitFindOne: vi.fn(),
    featFindOne: vi.fn(),
    raceFindOne: vi.fn(),
    classFindOne: vi.fn(),
    classFind: vi.fn(),
    backgroundFindOne: vi.fn(),
    spellFindOne: vi.fn(),
    itemFindOne: vi.fn(),
    monsterFindOne: vi.fn(),
}))

function mockFindOne(result: unknown) {
    return vi.fn(() => ({
        lean: vi.fn().mockResolvedValue(result),
    }))
}

function mockClassFind(result: unknown[]) {
    return vi.fn(() => ({
        select: vi.fn(() => ({
            lean: vi.fn().mockResolvedValue(result),
        })),
    }))
}

vi.mock("@/core/database/db", () => ({ default: dbConnect }))
vi.mock("@/features/search/api/unified-search-service", () => ({ searchUnifiedEntities }))
vi.mock("@/core/database/models/reference", () => ({ Reference: { findOne: modelMocks.ruleFindOne } }))
vi.mock("@/features/traits/database/trait", () => ({ Trait: { findOne: modelMocks.traitFindOne } }))
vi.mock("@/features/feats/models/feat", () => ({ Feat: { findOne: modelMocks.featFindOne } }))
vi.mock("@/features/races/models/race", () => ({ RaceModel: { findOne: modelMocks.raceFindOne } }))
vi.mock("@/features/classes/models/character-class", () => ({ CharacterClass: { findOne: modelMocks.classFindOne, find: modelMocks.classFind } }))
vi.mock("@/features/backgrounds/models/background", () => ({ BackgroundModel: { findOne: modelMocks.backgroundFindOne } }))
vi.mock("@/features/spells/models/spell", () => ({ Spell: { findOne: modelMocks.spellFindOne } }))
vi.mock("@/features/items/database/item", () => ({ ItemModel: { findOne: modelMocks.itemFindOne } }))
vi.mock("@/features/monsters/models/monster", () => ({ MonsterModel: { findOne: modelMocks.monsterFindOne } }))

describe("catalog MCP entity service", () => {
    beforeEach(() => {
        vi.resetModules()
        dbConnect.mockReset().mockResolvedValue(undefined)
        searchUnifiedEntities.mockReset()
        Object.values(modelMocks).forEach((mock) => mock.mockReset())
        modelMocks.ruleFindOne.mockImplementation(mockFindOne(null))
        modelMocks.traitFindOne.mockImplementation(mockFindOne(null))
        modelMocks.featFindOne.mockImplementation(mockFindOne(null))
        modelMocks.raceFindOne.mockImplementation(mockFindOne(null))
        modelMocks.classFindOne.mockImplementation(mockFindOne(null))
        modelMocks.classFind.mockImplementation(mockClassFind([]))
        modelMocks.backgroundFindOne.mockImplementation(mockFindOne(null))
        modelMocks.spellFindOne.mockImplementation(mockFindOne(null))
        modelMocks.itemFindOne.mockImplementation(mockFindOne(null))
        modelMocks.monsterFindOne.mockImplementation(mockFindOne(null))
    })

    it("searches public catalog entities with normalized filters", async () => {
        searchUnifiedEntities.mockResolvedValue([
            { id: "spell-1", name: "Bola de Fogo", type: "Magia", status: "active", circle: 3, source: "Livro do Jogador" },
        ])
        const { searchCatalogEntities } = await importFresh<typeof import("@/features/mcp/server/catalog-entity-service")>("@/features/mcp/server/catalog-entity-service")

        const result = await searchCatalogEntities({ query: "fogo", types: ["Magia"], limit: 80, offset: 5, circles: [3] })

        expect(searchUnifiedEntities).toHaveBeenCalledWith({
            query: "fogo",
            limit: 50,
            offset: 5,
            specificEntityType: "Magia",
            specificEntityTypes: undefined,
            itemTypes: undefined,
            circles: [3],
            parentClassId: undefined,
        })
        expect(result).toEqual({
            items: [
                expect.objectContaining({
                    id: "spell-1",
                    name: "Bola de Fogo",
                    type: "Magia",
                    circle: 3,
                }),
            ],
            limit: 50,
            offset: 5,
        })
    })

    it("uses multiple entity types when more than one type is requested", async () => {
        searchUnifiedEntities.mockResolvedValue([])
        const { searchCatalogEntities } = await importFresh<typeof import("@/features/mcp/server/catalog-entity-service")>("@/features/mcp/server/catalog-entity-service")

        await searchCatalogEntities({ query: "anão", types: ["Raça", "Classe"], limit: 20, offset: 0 })

        expect(searchUnifiedEntities).toHaveBeenCalledWith(expect.objectContaining({
            specificEntityType: undefined,
            specificEntityTypes: ["Raça", "Classe"],
        }))
    })

    it("gets an active catalog entity by type and id", async () => {
        modelMocks.spellFindOne.mockImplementation(mockFindOne({ _id: { toString: () => "spell-1" }, name: "Bola de Fogo", status: "active", __v: 0 }))
        const { getCatalogEntity } = await importFresh<typeof import("@/features/mcp/server/catalog-entity-service")>("@/features/mcp/server/catalog-entity-service")

        const entity = await getCatalogEntity({ type: "Magia", id: "spell-1" })

        expect(dbConnect).toHaveBeenCalled()
        expect(modelMocks.spellFindOne).toHaveBeenCalledWith({ _id: "spell-1", status: "active" })
        expect(entity).toEqual({ _id: "spell-1", id: "spell-1", name: "Bola de Fogo", status: "active" })
    })

    it("returns null when an inactive or missing entity is requested", async () => {
        modelMocks.monsterFindOne.mockImplementation(mockFindOne(null))
        const { getCatalogEntity } = await importFresh<typeof import("@/features/mcp/server/catalog-entity-service")>("@/features/mcp/server/catalog-entity-service")

        await expect(getCatalogEntity({ type: "Monstro", id: "monster-1" })).resolves.toBeNull()
        expect(modelMocks.monsterFindOne).toHaveBeenCalledWith({ _id: "monster-1", status: "active" })
    })

    it("returns null for invalid object ids instead of leaking CastError", async () => {
        const castError = new Error("Cast failed")
        castError.name = "CastError"
        modelMocks.itemFindOne.mockImplementation(() => ({
            lean: vi.fn().mockRejectedValue(castError),
        }))
        const { getCatalogEntity } = await importFresh<typeof import("@/features/mcp/server/catalog-entity-service")>("@/features/mcp/server/catalog-entity-service")

        await expect(getCatalogEntity({ type: "Item", id: "invalid" })).resolves.toBeNull()
    })

    it("resolves subclasses from active classes", async () => {
        modelMocks.classFind.mockImplementation(mockClassFind([
            {
                _id: { toString: () => "class-1" },
                name: "Mago",
                source: "Livro do Jogador",
                subclasses: [
                    { _id: { toString: () => "sub-1" }, name: "Evocador", description: "Especialista em evocação", color: "purple" },
                ],
            },
        ]))
        const { getCatalogEntity } = await importFresh<typeof import("@/features/mcp/server/catalog-entity-service")>("@/features/mcp/server/catalog-entity-service")

        const entity = await getCatalogEntity({ type: "Subclasse", id: "subclass:class-1:sub-1" })

        expect(entity).toEqual(expect.objectContaining({
            id: "subclass:class-1:sub-1",
            _id: "subclass:class-1:sub-1",
            name: "Evocador",
            type: "Subclasse",
            status: "active",
            source: "Livro do Jogador",
            metadata: expect.objectContaining({ parentClassId: "class-1", parentClassName: "Mago" }),
        }))
    })
})
