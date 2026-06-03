import { describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"

describe("spells service", () => {
    it("listSpells uses alphabetical base ordering before optional fuzzy search", async () => {
        const lean = vi.fn().mockResolvedValue([
            { _id: "spell-1", name: "Abrigo", status: "active", component: [] },
        ])
        const sort = vi.fn(() => ({ lean }))
        const find = vi.fn(() => ({ sort }))

        vi.doMock("@/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock("@/features/spells/models/spell", () => ({ Spell: { find } }))
        vi.doMock("@/features/users/api/audit-service", () => ({
            logCreate: vi.fn(),
            logUpdate: vi.fn(),
            logDelete: vi.fn(),
        }))
        vi.doMock("@/core/utils/search-engine", () => ({ applyFuzzySearch: vi.fn((items) => items) }))

        const mod = await importFresh<typeof import("@/features/spells/api/spells-service")>("@/features/spells/api/spells-service")
        await mod.listSpells({}, 1, 10, true)

        expect(sort).toHaveBeenCalledWith({ name: 1 })
    })
})
