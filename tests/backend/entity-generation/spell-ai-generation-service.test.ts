import { beforeEach, describe, expect, it, vi } from "vitest"
import { generateSpellCandidates, applySpellGenerationCandidate } from "../../../src/features/entity-generation/server/spell-ai-generation-service"
import { ENTITY_GENERATION_MODEL } from "../../../src/features/entity-generation/server/entity-generation-model"
import { Spell } from "../../../src/features/spells/models/spell"
import { updateSpell } from "../../../src/features/spells/api/spells-service"
import type { GeneratedSpellCandidate } from "../../../src/features/entity-generation/types/entity-generation.types"

const translatorMocks = vi.hoisted(() => ({
    configure: vi.fn(),
    translateItem: vi.fn(),
}))

vi.mock("node:fs/promises", () => ({
    default: {
        readFile: vi.fn().mockResolvedValue(JSON.stringify({
            spell: [
                {
                    name: "magic missile",
                    source: "XPHB",
                    page: 288,
                    level: 1,
                    school: "V",
                    time: [{ number: 1, unit: "action" }],
                    range: { type: "point", distance: { type: "feet", amount: 120 } },
                    components: { v: true, s: true },
                    duration: [{ type: "instant" }],
                    entries: ["You create three glowing darts of magical force."],
                },
            ],
        })),
        },
    readFile: vi.fn().mockResolvedValue(JSON.stringify({
        spell: [
            {
                name: "magic missile",
                source: "XPHB",
                page: 288,
                level: 1,
                school: "V",
                time: [{ number: 1, unit: "action" }],
                range: { type: "point", distance: { type: "feet", amount: 120 } },
                components: { v: true, s: true },
                duration: [{ type: "instant" }],
                entries: ["You create three glowing darts of magical force."],
            },
        ],
    })),
}))

vi.mock("../../../src/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))

vi.mock("../../../src/features/spells/models/spell", () => ({
    Spell: {
        findById: vi.fn(),
    },
}))

vi.mock("../../../src/features/spells/api/spells-service", () => ({
    updateSpell: vi.fn(),
}))

vi.mock("../../../scripts/seed-data/translation/genai-translator", () => ({
    GenAITranslator: class {
        configure(config: unknown) {
            translatorMocks.configure(config)
        }
        translateItem(name: string, description: string) {
            return translatorMocks.translateItem(name, description)
        }
    },
}))

const currentSpell = {
    _id: "spell-1",
    name: "Mísseis Mágicos",
    originalName: "magic missile",
    description: "<p>old</p>",
    circle: 1,
    school: "Evocação",
    component: ["Verbal"],
    image: "/old.png",
    source: "Fonte Antiga",
    status: "active",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
}

function leanResult<T>(value: T) {
    return { lean: vi.fn().mockResolvedValue(value) }
}

function candidate(overrides: Partial<GeneratedSpellCandidate> = {}): GeneratedSpellCandidate {
    return {
        candidateId: "magic missile:XPHB:288",
        matchLabel: "magic missile (Livro do Jogador pág. 288)",
        name: "Mísseis Mágicos",
        originalName: "magic missile",
        description: "<p>new</p>",
        circle: 1,
        school: "Evocação",
        component: ["Verbal", "Somático"],
        source: "Livro do Jogador pág. 288",
        status: "active",
        ...overrides,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    translatorMocks.translateItem.mockResolvedValue({ name: "Mísseis Mágicos", description: "<p>new</p>" })
    vi.mocked(Spell.findById).mockReturnValue(leanResult(currentSpell) as never)
    vi.mocked(updateSpell).mockResolvedValue({ ...currentSpell, description: "<p>new</p>" } as never)
})

describe("spell AI generation service", () => {
    it("finds source spells by originalName and configures the entity generation model", async () => {
        const onProgress = vi.fn()

        const result = await generateSpellCandidates("spell-1", onProgress)

        expect(translatorMocks.configure).toHaveBeenCalledWith({ model: ENTITY_GENERATION_MODEL, rpm: 0, rpd: 0 })
        expect(result.candidates[0]).toEqual(expect.objectContaining({
            originalName: "magic missile",
            circle: 1,
            school: "Evocação",
            source: "Livro do Jogador pág. 288",
            image: "/old.png",
        }))
        expect(onProgress).toHaveBeenCalledWith({ current: 1, total: 1, message: "Gerando magia magic missile" })
    })

    it("preserves the current image when applying a candidate without image", async () => {
        await applySpellGenerationCandidate("spell-1", candidate({ image: undefined }), "user-1")

        expect(updateSpell).toHaveBeenCalledWith(
            "spell-1",
            expect.objectContaining({
                description: "<p>new</p>",
                image: "/old.png",
            }),
            "user-1",
        )
    })
})
