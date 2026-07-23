import { beforeEach, describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"

describe("dice routes", () => {
    beforeEach(() => {
        vi.doMock("@/core/auth/server", () => ({
            auth: vi.fn(async () => ({ userId: null })),
        }))
    })

    it("POST /api/dice/rolls requires diceSessionId for anonymous rolls", async () => {
        const mod = await importFresh<typeof import("@/app/api/dice/rolls/route")>("@/app/api/dice/rolls/route")
        const response = await mod.POST(new Request("http://localhost/api/dice/rolls", {
            method: "POST",
            body: JSON.stringify({
                terms: [{ dice: "d20", quantity: 1 }],
                mode: "normal",
            }),
        }) as never)

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({
            success: false,
            code: "DICE_SESSION_REQUIRED",
        })
    })

    it("POST /api/dice/rolls returns the service result", async () => {
        vi.doMock("@/features/dice-roller/server/dice-roll-service", () => ({
            rollGeneralDice: vi.fn(async () => ({
                rollId: "roll-1",
                terms: [{ dice: "d20", quantity: 1, results: [12] }],
                mode: "normal",
                diceTotal: 12,
                modifier: 3,
                total: 15,
                createdAt: "2026-01-01T00:00:00.000Z",
            })),
        }))

        const mod = await importFresh<typeof import("@/app/api/dice/rolls/route")>("@/app/api/dice/rolls/route")
        const response = await mod.POST(new Request("http://localhost/api/dice/rolls", {
            method: "POST",
            body: JSON.stringify({
                terms: [{ dice: "d20", quantity: 1 }],
                mode: "normal",
                modifier: 3,
                diceSessionId: "session-123",
            }),
        }) as never)

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toMatchObject({
            success: true,
            data: {
                rollId: "roll-1",
                total: 15,
            },
        })
    })

    it("POST /api/dice/rolls resolves Owlbear target by player id without publishing a live visual event", async () => {
        const rollGeneralDice = vi.fn(async () => ({
            rollId: "roll-1",
            terms: [{ dice: "d20", quantity: 1, results: [19] }],
            mode: "advantage",
            selectedD20: { kept: 19, discarded: 4, reason: "advantage" },
            diceTotal: 19,
            modifier: 1,
            total: 20,
            createdAt: "2026-01-01T00:00:00.000Z",
        }))
        vi.doMock("@/features/dice-roller/server/dice-roll-service", () => ({
            rollGeneralDice,
        }))

        const mod = await importFresh<typeof import("@/app/api/dice/rolls/route")>("@/app/api/dice/rolls/route")
        const response = await mod.POST(new Request("http://localhost/api/dice/rolls", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-pusher-origin": "origin-1",
            },
            body: JSON.stringify({
                terms: [{ dice: "d20", quantity: 1 }],
                mode: "advantage",
                modifier: 1,
                source: "owlbear",
                playerName: "Nando",
                owlbearRoomId: "room-1",
                owlbearPlayerId: "player-nando",
            }),
        }) as never)

        expect(response.status).toBe(200)
        expect(rollGeneralDice).toHaveBeenCalledWith(
            expect.objectContaining({
                playerName: "Nando",
                owlbearRoomId: "room-1",
                owlbearPlayerId: "player-nando",
            }),
            {
                scope: "owlbear",
                targetId: "player:player-nando",
            }
        )
    })

    it("POST /api/dice/overrides creates a range override", async () => {
        const upsertDiceOverride = vi.fn(async () => ({
            id: "override-1",
            scope: "local",
            targetId: "local:session-123",
            dice: "d20",
            min: 10,
            max: 20,
            remainingUses: 1,
        }))
        vi.doMock("@/features/dice-roller/server/dice-override-service", () => ({
            upsertDiceOverride,
            listDiceOverrides: vi.fn(),
            clearDiceOverrides: vi.fn(),
        }))

        const mod = await importFresh<typeof import("@/app/api/dice/overrides/route")>("@/app/api/dice/overrides/route")
        const response = await mod.POST(new Request("http://localhost/api/dice/overrides", {
            method: "POST",
            body: JSON.stringify({
                action: "range",
                dice: "d20",
                min: 10,
                max: 20,
                diceSessionId: "session-123",
            }),
        }) as never)

        expect(response.status).toBe(200)
        expect(upsertDiceOverride).toHaveBeenCalledWith(
            { scope: "local", targetId: "local:session-123" },
            { dice: "d20", min: 10, max: 20 }
        )
    })

    it("POST /api/dice/overrides accepts d100 overrides", async () => {
        const upsertDiceOverride = vi.fn(async () => ({
            id: "override-1",
            scope: "local",
            targetId: "local:session-123",
            dice: "d100",
            exact: 88,
            remainingUses: 1,
        }))
        vi.doMock("@/features/dice-roller/server/dice-override-service", () => ({
            upsertDiceOverride,
            listDiceOverrides: vi.fn(),
            clearDiceOverrides: vi.fn(),
        }))

        const mod = await importFresh<typeof import("@/app/api/dice/overrides/route")>("@/app/api/dice/overrides/route")
        const response = await mod.POST(new Request("http://localhost/api/dice/overrides", {
            method: "POST",
            body: JSON.stringify({
                action: "exact",
                dice: "d100",
                value: 88,
                diceSessionId: "session-123",
            }),
        }) as never)

        expect(response.status).toBe(200)
        expect(upsertDiceOverride).toHaveBeenCalledWith(
            { scope: "local", targetId: "local:session-123" },
            { dice: "d100", exact: 88 }
        )
    })

    it("POST /api/dice/overrides accepts Owlbear player-id targets", async () => {
        const upsertDiceOverride = vi.fn(async () => ({
            id: "override-1",
            scope: "owlbear",
            targetId: "player:player-nando",
            dice: "d20",
            exact: 20,
            remainingUses: 1,
        }))
        vi.doMock("@/features/dice-roller/server/dice-override-service", () => ({
            upsertDiceOverride,
            listDiceOverrides: vi.fn(),
            clearDiceOverrides: vi.fn(),
        }))

        const mod = await importFresh<typeof import("@/app/api/dice/overrides/route")>("@/app/api/dice/overrides/route")
        const response = await mod.POST(new Request("http://localhost/api/dice/overrides", {
            method: "POST",
            body: JSON.stringify({
                action: "exact",
                dice: "d20",
                value: 20,
                owlbearPlayerId: "player-nando",
            }),
        }) as never)

        expect(response.status).toBe(200)
        expect(upsertDiceOverride).toHaveBeenCalledWith(
            { scope: "owlbear", targetId: "player:player-nando" },
            { dice: "d20", exact: 20 }
        )
    })
})
