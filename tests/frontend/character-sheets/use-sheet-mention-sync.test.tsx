/** @vitest-environment happy-dom */
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CharacterSheet, PatchSheetBody } from "@/features/character-sheets/types/character-sheet.types"

/**
 * Ligação do hook de sincronização com a regra do PV do nível 1 (DND-64): abrir a ficha com dano gravado pela campanha
 * não pode mandar `hpCurrent` no patch.
 */

vi.mock("@/features/classes/api/classes-api", () => ({
    fetchClass: vi.fn(async () => ({ _id: "class-1", name: "Guerreiro", hitDice: "d10", savingThrows: [], armorProficiencies: [], weaponProficiencies: [], subclasses: [], traits: [], spellcasting: false })),
}))
vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({ useItems: () => ({ data: [] }) }))

import { useSheetMentionSync } from "@/features/character-sheets/hooks/use-sheet-mention-sync"

const baseSheet: CharacterSheet = {
    _id: "sheet-1",
    slug: "kael",
    userId: "user-1",
    username: "kael",
    name: "Kael",
    class: `<p><span data-type="mention" data-id="class-1" data-entity-type="Classe" data-label="Guerreiro">Guerreiro</span></p>`,
    classRef: null,
    subclass: "",
    subclassRef: null,
    level: 1,
    experience: 0,
    race: "",
    raceRef: null,
    origin: "",
    originRef: null,
    inspiration: false,
    multiclassNotes: "",
    photo: null,
    age: "",
    height: "",
    weight: "",
    eyes: "",
    skin: "",
    hair: "",
    appearance: "",
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 11,
    charisma: 8,
    proficiencyBonusOverride: null,
    savingThrows: {
        strength: false,
        dexterity: false,
        constitution: false,
        intelligence: false,
        wisdom: false,
        charisma: false,
    },
    skills: {
        Acrobacia: { proficient: false, expertise: false },
        Arcanismo: { proficient: false, expertise: false },
        Atletismo: { proficient: false, expertise: false },
        Atuação: { proficient: false, expertise: false },
        Enganação: { proficient: false, expertise: false },
        Furtividade: { proficient: false, expertise: false },
        História: { proficient: false, expertise: false },
        Intimidação: { proficient: false, expertise: false },
        Intuição: { proficient: false, expertise: false },
        Investigação: { proficient: false, expertise: false },
        "Lidar com Animais": { proficient: false, expertise: false },
        Medicina: { proficient: false, expertise: false },
        Natureza: { proficient: false, expertise: false },
        Percepção: { proficient: false, expertise: false },
        Persuasão: { proficient: false, expertise: false },
        Prestidigitação: { proficient: false, expertise: false },
        Religião: { proficient: false, expertise: false },
        Sobrevivência: { proficient: false, expertise: false },
    },
    movementSpeed: "9m",
    hpMax: 12,
    hpCurrent: 12,
    hpTemp: 0,
    hitDiceTotal: "d10",
    hitDiceUsed: 0,
    deathSavesSuccess: 0,
    deathSavesFailure: 0,
    exhaustion: 0,
    armorClassOverride: null,
    armorClassBonus: null,
    unarmoredDefense: { enabled: false, base: 10, attributes: [] },
    initiativeOverride: null,
    initiativeProficiency: false,
    passivePerceptionOverride: null,
    spellcastingAttribute: null,
    spellSaveDCOverride: null,
    spellAttackBonusOverride: null,
    spellSlots: {},
    resourceCharges: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    personalityTraits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    history: "",
    notes: "",
    notePages: [],
    classFeatures: "",
    speciesTraits: "",
    featuresNotes: "",
    size: "Médio",
    armorTraining: { light: true, medium: true, heavy: true, shields: true },
    weaponProficiencies: "",
    toolProficiencies: "",
    computedArmorClass: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
}

function runSync(overrides: Partial<CharacterSheet>) {
    const sheet = { ...baseSheet, ...overrides }
    const patchFields = vi.fn<(fields: Partial<PatchSheetBody>) => void>()
    const watch = (() => undefined) as never
    renderHook(() => useSheetMentionSync({ sheet, form: { watch, patchFields } }))
    return patchFields
}

beforeEach(() => vi.clearAllMocks())

describe("useSheetMentionSync — PV do nível 1 (DND-64)", () => {
    it("ficha de nível 1 com dano (5/12): a sincronização ao abrir não manda hpCurrent", async () => {
        const patchFields = runSync({ hpMax: 12, hpCurrent: 5 })
        await waitFor(() => expect(patchFields).toHaveBeenCalled())
        const patch = patchFields.mock.calls.at(-1)![0]
        expect(patch).toMatchObject({ classRef: "class-1" })
        expect(patch).not.toHaveProperty("hpCurrent")
        expect(patch).not.toHaveProperty("hpMax")
    })

    it("com dano e máximo desatualizado (5/30): recalcula só o máximo, o PV atual fica", async () => {
        const patchFields = runSync({ hpMax: 30, hpCurrent: 5 })
        await waitFor(() => expect(patchFields).toHaveBeenCalled())
        const patch = patchFields.mock.calls.at(-1)![0]
        expect(patch).toMatchObject({ hpMax: 12 })
        expect(patch).not.toHaveProperty("hpCurrent")
    })

    it("ficha nova (PV atual nulo) recebe o máximo", async () => {
        const patchFields = runSync({ hpMax: null as never, hpCurrent: null })
        await waitFor(() => expect(patchFields).toHaveBeenCalled())
        expect(patchFields.mock.calls.at(-1)![0]).toMatchObject({ hpMax: 12, hpCurrent: 12 })
    })
})
