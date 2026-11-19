import { describe, expect, it } from "vitest"
import { combatPrepSince, isCombatPrepStalled, prepElapsedLabel } from "@/features/maddox/combat-prep-stall"
import { MADDOX_COMBAT_PREP_STALL_NOTICE_MS } from "@/features/maddox/constants"

/** DND-75: regra única de "preparação parada" e o tempo decorrido do selo. */

const now = Date.parse("2026-11-19T03:00:00.000Z")
const ago = (ms: number) => new Date(now - ms)

describe("DND-75 — preparação parada", () => {
    it("conta do início do job em andamento e da última mudança da que está na fila; as demais não contam", () => {
        expect(combatPrepSince({ status: "running", startedAt: ago(1000), updatedAt: ago(5) })).toEqual(ago(1000))
        expect(combatPrepSince({ status: "pending", startedAt: null, updatedAt: ago(2000) })).toEqual(ago(2000))
        expect(combatPrepSince({ status: "failed", startedAt: ago(1), updatedAt: ago(1) })).toBeNull()
        expect(combatPrepSince({ status: "awaiting-player", startedAt: ago(1), updatedAt: ago(1) })).toBeNull()
        expect(combatPrepSince({ status: "running", startedAt: null })).toBeNull()
    })

    it("parada a partir do limite do aviso", () => {
        expect(isCombatPrepStalled({ status: "running", startedAt: ago(MADDOX_COMBAT_PREP_STALL_NOTICE_MS - 1) }, now)).toBe(false)
        expect(isCombatPrepStalled({ status: "running", startedAt: ago(MADDOX_COMBAT_PREP_STALL_NOTICE_MS) }, now)).toBe(true)
        expect(isCombatPrepStalled({ status: "pending", updatedAt: ago(MADDOX_COMBAT_PREP_STALL_NOTICE_MS + 1) }, now)).toBe(true)
        expect(isCombatPrepStalled({ status: "ready", updatedAt: ago(MADDOX_COMBAT_PREP_STALL_NOTICE_MS * 10) }, now)).toBe(false)
    })

    it("tempo decorrido: nada abaixo de 1 min; minutos; horas com minutos", () => {
        expect(prepElapsedLabel(ago(59_000).toISOString(), now)).toBeNull()
        expect(prepElapsedLabel(ago(12 * 60_000 + 30_000).toISOString(), now)).toBe("12 min")
        expect(prepElapsedLabel(ago(65 * 60_000).toISOString(), now)).toBe("1 h 5 min")
        expect(prepElapsedLabel(ago(120 * 60_000).toISOString(), now)).toBe("2 h")
        expect(prepElapsedLabel(null, now)).toBeNull()
        expect(prepElapsedLabel("inválido", now)).toBeNull()
    })
})
