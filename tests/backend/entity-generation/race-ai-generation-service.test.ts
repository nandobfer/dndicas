import { beforeEach, describe, expect, it, vi } from "vitest"
import { applyRaceGenerationCandidate } from "../../../src/features/entity-generation/server/race-ai-generation-service"
import { RaceModel } from "../../../src/features/races/models/race"
import { Trait } from "../../../src/features/traits/database/trait"
import { Spell } from "../../../src/features/spells/models/spell"
import { createSpell } from "../../../src/features/spells/api/spells-service"
import { logUpdate } from "../../../src/features/users/api/audit-service"
import type { GeneratedRaceCandidate } from "../../../src/features/entity-generation/types/entity-generation.types"

vi.mock("../../../src/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))

vi.mock("../../../src/features/races/models/race", () => ({
    RaceModel: {
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
    },
}))

vi.mock("../../../src/features/traits/database/trait", () => ({
    Trait: {
        findOneAndUpdate: vi.fn(),
        create: vi.fn(),
    },
}))

vi.mock("../../../src/features/spells/models/spell", () => ({
    Spell: {
        findOne: vi.fn(),
    },
}))

vi.mock("../../../src/features/spells/api/spells-service", () => ({
    createSpell: vi.fn(),
}))

vi.mock("../../../src/features/users/api/audit-service", () => ({
    logUpdate: vi.fn().mockResolvedValue(null),
}))

vi.mock("../../../scripts/seed-data/translation/genai-translator", () => ({
    GenAITranslator: class {
        configure() {}
        translateItem(name: string, description: string) {
            return Promise.resolve({ name, description })
        }
    },
}))

const previousRace = {
    _id: "race-1",
    name: "Vampiro",
    originalName: "Vampire",
    description: "<p>old</p>",
    source: "Old Source",
    status: "active",
    size: "Médio",
    speed: "9 metros",
    traits: [],
    spells: [],
    variations: [],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
}

function leanResult<T>(value: T) {
    return { lean: vi.fn().mockResolvedValue(value) }
}

function candidate(overrides: Partial<GeneratedRaceCandidate> = {}): GeneratedRaceCandidate {
    return {
        candidateId: "Vampire:PSX:1",
        matchLabel: "Vampire (Plane Shift: Ixalan pág. 1)",
        name: "Vampiro",
        originalName: "Vampire",
        description: "<p>new</p>",
        image: "https://example.com/vampire.png",
        source: "Plane Shift: Ixalan pág. 1",
        status: "active",
        size: "Médio",
        speed: "9 metros",
        traits: [{ name: "Idade", originalName: "Age", description: "<p>new age</p>", level: 1 }],
        spells: [{ _raw: true, name: "Luzes Dançantes", originalName: "dancing lights", level: 1, circle: 0 }],
        variations: [],
        ...overrides,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(RaceModel.findById).mockReturnValue(leanResult(previousRace) as never)
    vi.mocked(RaceModel.findByIdAndUpdate).mockImplementation((_id, update) => leanResult({ ...previousRace, ...(update as object), updatedAt: new Date("2024-01-03") }) as never)
    vi.mocked(Trait.findOneAndUpdate).mockResolvedValue({ _id: "trait-age", name: "Idade (Vampiro)" } as never)
    vi.mocked(Trait.create).mockResolvedValue({ _id: "trait-created", name: "Novo (Vampiro)" } as never)
    vi.mocked(Spell.findOne).mockReturnValue(leanResult({ _id: "spell-light", name: "Luzes Dançantes", circle: 0 }) as never)
    vi.mocked(createSpell).mockResolvedValue({ _id: "spell-created", name: "Magia Nova", circle: 1 } as never)
})

describe("applyRaceGenerationCandidate", () => {
    it("updates race fields and refreshes existing race-specific traits", async () => {
        const result = await applyRaceGenerationCandidate("race-1", candidate(), "user-1")

        expect(Trait.findOneAndUpdate).toHaveBeenCalledWith(
            { name: /^Idade \(Vampiro\)$/i },
            expect.objectContaining({ name: "Idade (Vampiro)", description: "<p>new age</p>", originalName: "Age" }),
            { new: true },
        )
        expect(RaceModel.findByIdAndUpdate).toHaveBeenCalledWith(
            "race-1",
            expect.objectContaining({
                name: "Vampiro",
                description: "<p>new</p>",
                source: "Plane Shift: Ixalan pág. 1",
                image: "https://example.com/vampire.png",
                traits: [
                    expect.objectContaining({
                        name: "Habilidade sem Nome",
                        description: '<span data-type="mention" data-id="trait-age" data-entity-type="Habilidade" class="mention">Idade (Vampiro)</span>',
                    }),
                ],
            }),
            { new: true, runValidators: true },
        )
        expect(result._id).toBe("race-1")
        expect(logUpdate).toHaveBeenCalled()
    })

    it("creates missing traits with the race suffix", async () => {
        vi.mocked(Trait.findOneAndUpdate).mockResolvedValueOnce(null as never)

        await applyRaceGenerationCandidate("race-1", candidate(), "user-1")

        expect(Trait.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Idade (Vampiro)", source: "Plane Shift: Ixalan pág. 1" }))
    })

    it("reuses existing spells by originalName without updating them", async () => {
        await applyRaceGenerationCandidate("race-1", candidate(), "user-1")

        expect(Spell.findOne).toHaveBeenCalledWith({ originalName: /^dancing lights$/i })
        expect(createSpell).not.toHaveBeenCalled()
    })

    it("creates a minimal warning spell when the spell is absent and has no source input", async () => {
        vi.mocked(Spell.findOne).mockReturnValue(leanResult(null) as never)

        await applyRaceGenerationCandidate(
            "race-1",
            candidate({ spells: [{ _raw: true, name: "Magia Perdida", originalName: "lost spell", level: 3, circle: 1, requiresManualReview: true }] }),
            "user-1",
        )

        expect(createSpell).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Magia Perdida",
                originalName: "lost spell",
                description: expect.stringContaining("Cadastro incompleto"),
                source: expect.stringContaining("Geração IA: Vampiro"),
            }),
            "user-1",
        )
    })
})
