import * as React from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import * as characterSheetsApi from "@/features/character-sheets/api/character-sheets-api"
import { sheetsKeys, usePatchSheet } from "@/features/character-sheets/api/character-sheets-queries"
import type { CharacterSheetFull } from "@/features/character-sheets/types/character-sheet.types"

vi.mock("@/features/character-sheets/api/character-sheets-api", async () => {
    const actual = await vi.importActual<typeof import("@/features/character-sheets/api/character-sheets-api")>("@/features/character-sheets/api/character-sheets-api")
    return {
        ...actual,
        patchSheet: vi.fn(),
    }
})

const patchSheetMock = vi.mocked(characterSheetsApi.patchSheet)

function buildSheet(overrides: Partial<CharacterSheetFull> = {}): CharacterSheetFull {
    return {
        _id: "sheet-1",
        slug: "kael",
        userId: "user-1",
        username: "kael",
        name: "Kael",
        class: "Guerreiro",
        classRef: "class-1",
        subclass: "",
        subclassRef: null,
        level: 2,
        experience: "0",
        race: "Humano",
        raceRef: null,
        origin: "Soldado",
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
        hpMax: 20,
        hpCurrent: 18,
        hpTemp: 0,
        hitDiceTotal: "d10",
        hitDiceUsed: 0,
        deathSavesSuccess: 0,
        deathSavesFailure: 0,
        armorClassOverride: null,
        armorClassBonus: 0,
        initiativeOverride: null,
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
        items: [],
        spells: [],
        traits: [],
        feats: [],
        attacks: [],
        ...overrides,
    }
}

describe("usePatchSheet", () => {
    beforeEach(() => {
        patchSheetMock.mockReset()
    })

    it("keeps the by-slug cache in sync after patching the photo", async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        })
        const sheet = buildSheet()
        const generatedPhoto = "/api/upload?key=ai%2Fgenerated%2Fclerk-1%2F1700000000000.png"

        queryClient.setQueryData(sheetsKeys.detail(sheet._id), sheet)
        queryClient.setQueryData(sheetsKeys.bySlug(sheet.slug), sheet)
        patchSheetMock.mockResolvedValue({ ...sheet, photo: generatedPhoto })

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        )

        const { result } = renderHook(() => usePatchSheet(sheet._id, sheet.slug), { wrapper })

        await act(async () => {
            await result.current.mutateAsync({ photo: generatedPhoto })
        })

        expect(patchSheetMock).toHaveBeenCalledWith(sheet._id, { photo: generatedPhoto })
        expect(queryClient.getQueryData<CharacterSheetFull>(sheetsKeys.detail(sheet._id))).toMatchObject({
            photo: generatedPhoto,
            items: [],
            spells: [],
        })
        expect(queryClient.getQueryData<CharacterSheetFull>(sheetsKeys.bySlug(sheet.slug))).toMatchObject({
            photo: generatedPhoto,
            items: [],
            spells: [],
        })
    })
})
