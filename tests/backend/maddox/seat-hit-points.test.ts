import { describe, expect, it } from "vitest"
import { loadHitPointsSummaries, sheetHitPointsOf } from "@/features/maddox/server/seat-hit-points"

describe("PV do card Na mesa (DND-63) — sheetHitPointsOf", () => {
    it("traz o PV atual, o máximo e o temporário da ficha", () => {
        expect(sheetHitPointsOf({ hpCurrent: 9, hpMax: 12, hpTemp: 3 })).toEqual({ current: 9, max: 12, temp: 3 })
    })

    it("PV atual ausente vale o máximo; temporário ausente vale 0", () => {
        expect(sheetHitPointsOf({ hpCurrent: null, hpMax: 12, hpTemp: null })).toEqual({ current: 12, max: 12, temp: 0 })
        expect(sheetHitPointsOf({ hpMax: 8 })).toEqual({ current: 8, max: 8, temp: 0 })
    })

    it("nunca devolve número negativo", () => {
        expect(sheetHitPointsOf({ hpCurrent: -4, hpMax: 12, hpTemp: -1 })).toEqual({ current: 0, max: 12, temp: 0 })
    })

    it("sem PV máximo (ou sem ficha) não há barra", () => {
        expect(sheetHitPointsOf({ hpCurrent: 5, hpMax: 0 })).toBeNull()
        expect(sheetHitPointsOf({ hpCurrent: 5 })).toBeNull()
        expect(sheetHitPointsOf(null)).toBeNull()
    })

    it("lista sem ids válidos não consulta o banco", async () => {
        expect((await loadHitPointsSummaries([])).size).toBe(0)
        expect((await loadHitPointsSummaries(["nao-e-um-id"])).size).toBe(0)
    })
})
