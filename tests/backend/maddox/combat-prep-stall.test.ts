import { describe, expect, it } from "vitest"
import { combatPrepSince, isCombatPrepStalled, prepElapsedLabel, serverClockOffset, stalledCombatPreps } from "@/features/maddox/combat-prep-stall"
import { MADDOX_COMBAT_DOWNED_CHECK_TIMEOUT_MS, MADDOX_COMBAT_PREP_CONFLICT_RETRIES, MADDOX_COMBAT_PREP_HARD_LIMIT_MS, MADDOX_COMBAT_PREP_STALL_NOTICE_MS, MADDOX_COMBAT_PREP_TIMEOUT_MS } from "@/features/maddox/constants"

/** DND-75: regra única de "preparação parada", o aviso calculado na tela e o tempo decorrido do selo. */

const now = Date.parse("2026-11-19T03:00:00.000Z")
const ago = (ms: number) => new Date(now - ms)

describe("DND-75 — preparação parada", () => {
    it("só a preparação em andamento conta, desde o início do job; a que espera na fila nunca", () => {
        expect(combatPrepSince({ status: "running", startedAt: ago(1000) })).toEqual(ago(1000))
        expect(combatPrepSince({ status: "pending", startedAt: null })).toBeNull()
        expect(combatPrepSince({ status: "failed", startedAt: ago(1) })).toBeNull()
        expect(combatPrepSince({ status: "awaiting-player", startedAt: ago(1) })).toBeNull()
        expect(combatPrepSince({ status: "running", startedAt: null })).toBeNull()
    })

    it("parada a partir do limite do aviso; fila longa (pending) não é alarme", () => {
        expect(isCombatPrepStalled({ status: "running", startedAt: ago(MADDOX_COMBAT_PREP_STALL_NOTICE_MS - 1) }, now)).toBe(false)
        expect(isCombatPrepStalled({ status: "running", startedAt: ago(MADDOX_COMBAT_PREP_STALL_NOTICE_MS) }, now)).toBe(true)
        expect(isCombatPrepStalled({ status: "pending", startedAt: ago(MADDOX_COMBAT_PREP_STALL_NOTICE_MS * 10) }, now)).toBe(false)
    })

    it("a tela tira o aviso da ordem com o próprio relógio: só 'Preparando…' além do limite e com id", () => {
        const order = [
            { name: "Lizwan", prep: { status: "preparing" as const, prepId: "p1", since: ago(MADDOX_COMBAT_PREP_STALL_NOTICE_MS + 1).toISOString() } },
            { name: "Ravel", prep: { status: "waiting" as const, prepId: "p2" } },
            { name: "Nala", prep: { status: "preparing" as const, prepId: "p3", since: ago(60_000).toISOString() } },
            { name: "Goblin" },
        ]
        expect(stalledCombatPreps(order, now)).toEqual([{ prepId: "p1", characterName: "Lizwan", since: ago(MADDOX_COMBAT_PREP_STALL_NOTICE_MS + 1).toISOString() }])
        // O mesmo instantâneo, minutos depois, já mostra a outra (sem nova leitura da mesa).
        expect(stalledCombatPreps(order, now + MADDOX_COMBAT_PREP_STALL_NOTICE_MS).map((item) => item.prepId)).toEqual(["p1", "p3"])
    })

    it("o teto do vigia cabe todas as gerações do laço (uma por conflito de ficha) e a conferência de 0 PV", () => {
        expect(MADDOX_COMBAT_PREP_HARD_LIMIT_MS).toBeGreaterThan(MADDOX_COMBAT_DOWNED_CHECK_TIMEOUT_MS + MADDOX_COMBAT_PREP_TIMEOUT_MS * (1 + MADDOX_COMBAT_PREP_CONFLICT_RETRIES))
    })

    it("tempo decorrido: nada abaixo de 1 min; minutos; horas com minutos", () => {
        expect(prepElapsedLabel(ago(59_000).toISOString(), now)).toBeNull()
        expect(prepElapsedLabel(ago(12 * 60_000 + 30_000).toISOString(), now)).toBe("12 min")
        expect(prepElapsedLabel(ago(65 * 60_000).toISOString(), now)).toBe("1 h 5 min")
        expect(prepElapsedLabel(ago(120 * 60_000).toISOString(), now)).toBe("2 h")
        expect(prepElapsedLabel(null, now)).toBeNull()
        expect(prepElapsedLabel("inválido", now)).toBeNull()
    })

    it("diferença entre o relógio do servidor e o da tela; sem horário válido, zero", () => {
        expect(serverClockOffset(new Date(now + 120_000).toISOString(), now)).toBe(120_000)
        expect(serverClockOffset(new Date(now - 60_000).toISOString(), now)).toBe(-60_000)
        expect(serverClockOffset(undefined, now)).toBe(0)
        expect(serverClockOffset("inválido", now)).toBe(0)
    })
})
