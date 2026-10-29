/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAttackNameSync } from "@/features/character-sheets/components/hooks/use-attack-name-sync"
import { fetchSpell } from "@/features/spells/api/spells-api"

vi.mock("@/features/spells/api/spells-api", () => ({
    fetchSpell: vi.fn(),
}))

vi.mock("@/features/items/api/items-api", () => ({
    fetchItemById: vi.fn(),
}))

const fetchSpellMock = vi.mocked(fetchSpell)
const spellMentionHtml = '<p><span data-type="mention" data-id="spell-1" data-entity-type="Magia" data-label="Raio Místico" class="mention">Raio Místico</span></p>'
const calc = {
    spellAttackBonus: { value: 6 },
    profBonus: { value: 3 },
    attrMods: {
        strength: { value: 1 },
        dexterity: { value: 2 },
    },
}

describe("useAttackNameSync", () => {
    beforeEach(() => {
        fetchSpellMock.mockReset()
        fetchSpellMock.mockResolvedValue({
            _id: "spell-1",
            name: "Raio Místico",
            source: "Livro do Jogador",
            status: "active",
            circle: 0,
            school: "Evocação",
            castingTime: "Ação",
            range: "36 m",
            component: [],
            duration: "Instantânea",
            description: "",
            baseDice: { quantidade: 1, tipo: "d10" },
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        })
    })

    it("preserva os campos editáveis quando a menção do ataque não muda", async () => {
        const onPatch = vi.fn()
        const { result } = renderHook(() => useAttackNameSync({
            calc,
            level: 5,
            onPatch,
        }))

        await act(async () => {
            await result.current.handleAttackNameChange("attack-1", spellMentionHtml, spellMentionHtml)
        })

        expect(fetchSpellMock).not.toHaveBeenCalled()
        expect(onPatch).toHaveBeenCalledTimes(1)
        expect(onPatch).toHaveBeenCalledWith("attack-1", { name: spellMentionHtml })
    })

    it("aplica o autofill quando uma nova menção é vinculada", async () => {
        const onPatch = vi.fn()
        const { result } = renderHook(() => useAttackNameSync({
            calc,
            level: 5,
            onPatch,
        }))

        await act(async () => {
            await result.current.handleAttackNameChange("attack-1", "", spellMentionHtml)
        })

        expect(fetchSpellMock).toHaveBeenCalledWith("spell-1")
        expect(onPatch).toHaveBeenLastCalledWith("attack-1", expect.objectContaining({
            attackBonus: "+6",
        }))
    })
})
