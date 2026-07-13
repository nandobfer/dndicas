import * as React from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import * as characterSheetsApi from "@/features/character-sheets/api/character-sheets-api"
import { sheetsKeys, useDeleteSheet } from "@/features/character-sheets/api/character-sheets-queries"
import type { CharacterSheet, SheetsListResponse } from "@/features/character-sheets/types/character-sheet.types"

vi.mock("@/features/character-sheets/api/character-sheets-api", async () => {
    const actual = await vi.importActual<typeof import("@/features/character-sheets/api/character-sheets-api")>("@/features/character-sheets/api/character-sheets-api")
    return {
        ...actual,
        deleteSheet: vi.fn(),
    }
})

const deleteSheetMock = vi.mocked(characterSheetsApi.deleteSheet)

function buildSheet(overrides: Partial<CharacterSheet> = {}): CharacterSheet {
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
        armorClassBonus: null,
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
        ...overrides,
    }
}

function buildInfiniteResponse(sheets: CharacterSheet[]): { pages: SheetsListResponse[]; pageParams: number[] } {
    return {
        pages: [
            {
                sheets,
                total: sheets.length,
                page: 1,
                totalPages: 1,
                hasNextPage: false,
            },
        ],
        pageParams: [1],
    }
}

describe("useDeleteSheet", () => {
    beforeEach(() => {
        deleteSheetMock.mockReset()
    })

    it("removes the deleted sheet from infinite list caches used by my sheets", async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        })
        const deletedSheet = buildSheet()
        const remainingSheet = buildSheet({
            _id: "sheet-2",
            slug: "mira",
            name: "Mira",
            username: "mira",
        })

        queryClient.setQueryData(
            sheetsKeys.infinite({ search: undefined, limit: 12 }),
            buildInfiniteResponse([deletedSheet, remainingSheet])
        )
        queryClient.setQueryData(sheetsKeys.detail(deletedSheet._id), deletedSheet)
        deleteSheetMock.mockResolvedValue({ success: true })

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        )

        const { result } = renderHook(() => useDeleteSheet(), { wrapper })

        await act(async () => {
            await result.current.mutateAsync(deletedSheet._id)
        })

        await waitFor(() => {
            const cachedList = queryClient.getQueryData<{ pages: SheetsListResponse[] }>(
                sheetsKeys.infinite({ search: undefined, limit: 12 })
            )

            expect(cachedList?.pages[0].sheets).toEqual([remainingSheet])
            expect(cachedList?.pages[0].total).toBe(1)
        })

        expect(deleteSheetMock).toHaveBeenCalledWith(deletedSheet._id)
        expect(queryClient.getQueryData(sheetsKeys.detail(deletedSheet._id))).toBeUndefined()
    })
})
