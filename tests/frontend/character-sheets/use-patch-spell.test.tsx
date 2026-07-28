import * as React from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { beforeEach, describe, expect, it, vi } from "vitest"

import * as characterSheetsApi from "@/features/character-sheets/api/character-sheets-api"
import { sheetsKeys, usePatchSpell } from "@/features/character-sheets/api/character-sheets-queries"
import type { CharacterSpell } from "@/features/character-sheets/types/character-sheet.types"

vi.mock("@/features/character-sheets/api/character-sheets-api", async () => {
    const actual = await vi.importActual<typeof import("@/features/character-sheets/api/character-sheets-api")>("@/features/character-sheets/api/character-sheets-api")
    return {
        ...actual,
        patchSpell: vi.fn(),
    }
})

const patchSpellMock = vi.mocked(characterSheetsApi.patchSpell)

function buildSpell(overrides: Partial<CharacterSpell> = {}): CharacterSpell {
    return {
        _id: "spell-1",
        sheetId: "sheet-1",
        catalogSpellId: null,
        name: "<p>Mísseis Mágicos</p>",
        circle: 1,
        school: "Evocação",
        image: null,
        prepared: false,
        components: [],
        castingTime: "1 ação",
        range: "36 m",
        concentration: false,
        ritual: false,
        material: false,
        notes: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    }
}

function setup(spells: CharacterSpell[] = [buildSpell()]) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    })
    queryClient.setQueryData(sheetsKeys.spells("sheet-1"), spells)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    return {
        queryClient,
        ...renderHook(() => usePatchSpell("sheet-1"), { wrapper }),
    }
}

describe("usePatchSpell", () => {
    beforeEach(() => {
        patchSpellMock.mockReset()
    })

    it("updates prepared optimistically and keeps the server response", async () => {
        const updated = buildSpell({ prepared: true })
        patchSpellMock.mockResolvedValue(updated)

        const { queryClient, result } = setup()

        await act(async () => {
            await result.current.mutateAsync({ spellId: "spell-1", data: { prepared: true } })
        })

        expect(patchSpellMock).toHaveBeenCalledWith("sheet-1", "spell-1", { prepared: true })
        expect(queryClient.getQueryData<CharacterSpell[]>(sheetsKeys.spells("sheet-1"))?.[0]).toMatchObject({
            _id: "spell-1",
            prepared: true,
        })
    })

    it("updates spell flags optimistically", async () => {
        patchSpellMock.mockResolvedValue(buildSpell({ concentration: true, ritual: true, material: true }))

        const { queryClient, result } = setup()

        await act(async () => {
            await result.current.mutateAsync({
                spellId: "spell-1",
                data: { concentration: true, ritual: true, material: true },
            })
        })

        expect(queryClient.getQueryData<CharacterSpell[]>(sheetsKeys.spells("sheet-1"))?.[0]).toMatchObject({
            concentration: true,
            ritual: true,
            material: true,
        })
    })

    it("rolls back optimistic changes when patching fails", async () => {
        const original = buildSpell({ prepared: false, concentration: false })
        patchSpellMock.mockRejectedValue(new Error("Falha ao salvar"))

        const { queryClient, result } = setup([original])

        await act(async () => {
            await expect(result.current.mutateAsync({ spellId: "spell-1", data: { prepared: true, concentration: true } })).rejects.toThrow("Falha ao salvar")
        })

        expect(queryClient.getQueryData<CharacterSpell[]>(sheetsKeys.spells("sheet-1"))).toEqual([original])
    })
})
