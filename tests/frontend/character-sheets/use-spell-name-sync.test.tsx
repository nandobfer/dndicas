import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchSpell } from "@/features/spells/api/spells-api"
import { useSpellNameSync } from "@/features/character-sheets/components/hooks/use-spell-name-sync"

vi.mock("@/features/spells/api/spells-api", () => ({
    fetchSpell: vi.fn(),
}))

const fetchSpellMock = vi.mocked(fetchSpell)

const calc = {
    spellAttackBonus: { value: 6 },
}

const spellMentionHtml = '<p><span data-type="mention" data-id="spell-1" data-entity-type="Magia" data-label="Raio de Fogo" class="mention">Raio de Fogo</span></p>'

describe("useSpellNameSync", () => {
    beforeEach(() => {
        fetchSpellMock.mockResolvedValue({
            _id: "spell-1",
            name: "Raio de Fogo",
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

    it("cria apenas um ataque automático quando a sincronização do mesmo truque dispara em paralelo", async () => {
        const onAddAttack = vi.fn()

        const { result } = renderHook(() => useSpellNameSync({
            calc,
            level: 5,
            attacks: [],
            onPatch: vi.fn(),
            onAddAttack,
            onPatchAttack: vi.fn(),
            onRemoveAttack: vi.fn(),
        }))

        await act(async () => {
            await Promise.all([
                result.current.syncCantripAttack(spellMentionHtml, "spell-1"),
                result.current.syncCantripAttack(spellMentionHtml, "spell-1"),
            ])
        })

        expect(onAddAttack).toHaveBeenCalledTimes(1)
        expect(onAddAttack).toHaveBeenCalledWith(expect.objectContaining({
            name: spellMentionHtml,
            attackBonus: "+6",
            notes: "auto:spell:spell-1",
        }))
    })
})
