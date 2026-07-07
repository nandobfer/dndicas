import { afterEach, describe, expect, it, vi } from "vitest"
import { makeRequest, readJson } from "./helpers/http"
import { importFresh } from "./helpers/module"

describe("owlbear session backend", () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it("createOwlbearSession stores only the token hash and revokes previous active sessions in the same context", async () => {
        const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
        const create = vi.fn().mockResolvedValue({
            _id: "session-1",
            userId: "user-1",
            roomId: "room-1",
            owlbearPlayerId: "player-1",
            owlbearRole: "PLAYER",
            expiresAt: new Date("2026-04-20T10:15:00.000Z"),
            revokedAt: null,
            lastUsedAt: new Date("2026-04-20T10:00:00.000Z"),
        })

        vi.doMock("@/core/database/db", () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }))
        vi.doMock("node:crypto", () => ({
            default: {
                randomBytes: vi.fn(() => ({
                    toString: vi.fn(() => "plain-token"),
                })),
                createHash: vi.fn(() => ({
                    update: vi.fn().mockReturnThis(),
                    digest: vi.fn(() => "hashed-token"),
                })),
            },
        }))
        vi.doMock("@/features/owlbear/models/owlbear-session", () => ({
            OwlbearSession: {
                updateMany,
                create,
            },
        }))

        const mod = await importFresh<typeof import("@/features/owlbear/server/session-service")>("@/features/owlbear/server/session-service")
        const result = await mod.createOwlbearSession({
            userId: "user-1",
            roomId: "room-1",
            owlbearPlayerId: "player-1",
            owlbearRole: "PLAYER",
            ttlMs: 15 * 60 * 1000,
        })

        expect(updateMany).toHaveBeenCalledTimes(1)
        expect(create).toHaveBeenCalledWith(expect.objectContaining({
            tokenHash: "hashed-token",
            userId: "user-1",
            roomId: "room-1",
            owlbearPlayerId: "player-1",
            owlbearRole: "PLAYER",
        }))
        expect(create.mock.calls[0][0]).not.toHaveProperty("token", "plain-token")
        expect(result.token).toBe("plain-token")
        expect(result.session.userId).toBe("user-1")
    })

    it("createOwlbearSession uses a long default TTL for authenticated users", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

        const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
        const create = vi.fn(async (input: Record<string, unknown>) => ({
            _id: "session-1",
            ...input,
            revokedAt: null,
        }))

        vi.doMock("@/core/database/db", () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }))
        vi.doMock("node:crypto", () => ({
            default: {
                randomBytes: vi.fn(() => ({
                    toString: vi.fn(() => "plain-token"),
                })),
                createHash: vi.fn(() => ({
                    update: vi.fn().mockReturnThis(),
                    digest: vi.fn(() => "hashed-token"),
                })),
            },
        }))
        vi.doMock("@/features/owlbear/models/owlbear-session", () => ({
            OwlbearSession: {
                updateMany,
                create,
            },
        }))

        const mod = await importFresh<typeof import("@/features/owlbear/server/session-service")>("@/features/owlbear/server/session-service")
        await mod.createOwlbearSession({
            userId: "user-1",
            roomId: "room-1",
            owlbearPlayerId: "player-1",
            owlbearRole: "PLAYER",
        })

        const createdSession = create.mock.calls[0][0] as { expiresAt: Date }
        expect(createdSession.expiresAt.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    })

    it("createOwlbearSession uses a shorter default TTL for anonymous GMs", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

        const updateMany = vi.fn().mockResolvedValue({ acknowledged: true })
        const create = vi.fn(async (input: Record<string, unknown>) => ({
            _id: "session-1",
            ...input,
            revokedAt: null,
        }))

        vi.doMock("@/core/database/db", () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }))
        vi.doMock("node:crypto", () => ({
            default: {
                randomBytes: vi.fn(() => ({
                    toString: vi.fn(() => "plain-token"),
                })),
                createHash: vi.fn(() => ({
                    update: vi.fn().mockReturnThis(),
                    digest: vi.fn(() => "hashed-token"),
                })),
            },
        }))
        vi.doMock("@/features/owlbear/models/owlbear-session", () => ({
            OwlbearSession: {
                updateMany,
                create,
            },
        }))

        const mod = await importFresh<typeof import("@/features/owlbear/server/session-service")>("@/features/owlbear/server/session-service")
        await mod.createOwlbearSession({
            userId: "owlbear-gm:room-1:gm-player-1",
            roomId: "room-1",
            owlbearPlayerId: "gm-player-1",
            owlbearRole: "GM",
        })

        const createdSession = create.mock.calls[0][0] as { expiresAt: Date }
        expect(createdSession.expiresAt.toISOString()).toBe("2026-01-02T00:00:00.000Z")
    })

    it("touchOwlbearSession extends the session expiration window", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))

        const updateOne = vi.fn().mockResolvedValue({ acknowledged: true })
        const lean = vi.fn().mockResolvedValue({ userId: "user-1" })
        const findOne = vi.fn(() => ({ lean }))

        vi.doMock("@/core/database/db", () => ({
            default: vi.fn().mockResolvedValue(undefined),
        }))
        vi.doMock("@/features/owlbear/models/owlbear-session", () => ({
            OwlbearSession: {
                findOne,
                updateOne,
            },
        }))

        const mod = await importFresh<typeof import("@/features/owlbear/server/session-service")>("@/features/owlbear/server/session-service")
        await mod.touchOwlbearSession("session-1", "2025-12-31T23:58:00.000Z")

        expect(updateOne).toHaveBeenCalledWith(
            { _id: "session-1", revokedAt: null },
            expect.objectContaining({
                $set: expect.objectContaining({
                    expiresAt: new Date("2026-04-01T00:00:00.000Z"),
                    lastUsedAt: new Date("2026-01-01T00:00:00.000Z"),
                }),
            })
        )
    })

    it("POST /api/owlbear/session rejects anonymous players", async () => {
        vi.doMock("@clerk/nextjs/server", () => ({
            auth: vi.fn().mockResolvedValue({ userId: null }),
        }))
        vi.doMock("@/features/owlbear/server/session-service", () => ({
            createOwlbearSession: vi.fn(),
        }))

        const mod = await importFresh<typeof import("@/app/api/owlbear/session/route")>("@/app/api/owlbear/session/route")
        const response = await mod.POST(makeRequest("http://localhost/api/owlbear/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                roomId: "room-1",
                owlbearPlayerId: "player-1",
                owlbearRole: "PLAYER",
            }),
        }))

        expect(response.status).toBe(401)
    })

    it("POST /api/owlbear/session accepts anonymous GMs using a synthetic Owlbear session user", async () => {
        const createOwlbearSession = vi.fn().mockResolvedValue({
            token: "gm-token",
            expiresAt: "2026-04-20T10:15:00.000Z",
        })

        vi.doMock("@clerk/nextjs/server", () => ({
            auth: vi.fn().mockResolvedValue({ userId: null }),
        }))
        vi.doMock("@/features/owlbear/server/session-service", () => ({
            createOwlbearSession,
            buildAnonymousGmSessionUserId: vi.fn(({ roomId, owlbearPlayerId }: { roomId: string; owlbearPlayerId: string }) =>
                `owlbear-gm:${roomId}:${owlbearPlayerId}`
            ),
        }))

        const mod = await importFresh<typeof import("@/app/api/owlbear/session/route")>("@/app/api/owlbear/session/route")
        const response = await mod.POST(makeRequest("http://localhost/api/owlbear/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                roomId: "room-1",
                owlbearPlayerId: "gm-player-1",
                owlbearRole: "GM",
            }),
        }))

        expect(response.status).toBe(201)
        expect(createOwlbearSession).toHaveBeenCalledWith(expect.objectContaining({
            userId: "owlbear-gm:room-1:gm-player-1",
            roomId: "room-1",
            owlbearPlayerId: "gm-player-1",
            owlbearRole: "GM",
        }))
    })

    it("GET /api/owlbear/character-sheets rejects missing bearer token", async () => {
        vi.doMock("@/features/owlbear/server/session-service", () => ({
            getOwlbearSessionByToken: vi.fn(),
            toOwlbearAuthContext: vi.fn(),
            touchOwlbearSession: vi.fn(),
        }))
        vi.doMock("@/features/character-sheets/api/character-sheets-service", () => ({
            getAllUserSheets: vi.fn(),
            createBlankSheet: vi.fn(),
            getSheetById: vi.fn(),
            patchSheetWithAccess: vi.fn(),
            applyLongRestWithAccess: vi.fn(),
            getItems: vi.fn(),
            createItem: vi.fn(),
            updateItem: vi.fn(),
            deleteItem: vi.fn(),
            getSpells: vi.fn(),
            createSpell: vi.fn(),
            updateSpell: vi.fn(),
            deleteSpell: vi.fn(),
            getTraits: vi.fn(),
            createTrait: vi.fn(),
            deleteTrait: vi.fn(),
            getFeats: vi.fn(),
            createFeat: vi.fn(),
            deleteFeat: vi.fn(),
            getAttacks: vi.fn(),
            createAttack: vi.fn(),
            updateAttack: vi.fn(),
            deleteAttack: vi.fn(),
        }))

        const mod = await importFresh<typeof import("@/app/api/owlbear/character-sheets/route")>("@/app/api/owlbear/character-sheets/route")
        const response = await mod.GET(makeRequest("http://localhost/api/owlbear/character-sheets"))
        const payload = await readJson<{
            error: string
        }>(response)

        expect(response.status).toBe(401)
        expect(payload.error).toMatch(/Sessão Owlbear/i)
    })

    it("GET /api/owlbear/character-sheets uses the authenticated Owlbear session user", async () => {
        const getAllUserSheets = vi.fn().mockResolvedValue({
            sheets: [],
            total: 0,
            page: 1,
            totalPages: 1,
            hasNextPage: false,
        })

        vi.doMock("@/features/owlbear/server/session-service", () => ({
            getOwlbearSessionByToken: vi.fn().mockResolvedValue({
                id: "session-1",
                userId: "user-1",
                roomId: "room-1",
                owlbearPlayerId: "player-1",
                owlbearRole: "PLAYER",
                expiresAt: "2026-04-20T10:15:00.000Z",
                revokedAt: null,
                lastUsedAt: "2026-04-20T10:00:00.000Z",
            }),
            toOwlbearAuthContext: vi.fn((session) => ({
                sessionId: session.id,
                userId: session.userId,
                roomId: session.roomId,
                owlbearPlayerId: session.owlbearPlayerId,
                owlbearRole: session.owlbearRole,
            })),
            touchOwlbearSession: vi.fn(),
        }))
        vi.doMock("@/features/character-sheets/api/character-sheets-service", () => ({
            getAllUserSheets,
            createBlankSheet: vi.fn(),
            getSheetById: vi.fn(),
            patchSheetWithAccess: vi.fn(),
            applyLongRestWithAccess: vi.fn(),
            getItems: vi.fn(),
            createItem: vi.fn(),
            updateItem: vi.fn(),
            deleteItem: vi.fn(),
            getSpells: vi.fn(),
            createSpell: vi.fn(),
            updateSpell: vi.fn(),
            deleteSpell: vi.fn(),
            getTraits: vi.fn(),
            createTrait: vi.fn(),
            deleteTrait: vi.fn(),
            getFeats: vi.fn(),
            createFeat: vi.fn(),
            deleteFeat: vi.fn(),
            getAttacks: vi.fn(),
            createAttack: vi.fn(),
            updateAttack: vi.fn(),
            deleteAttack: vi.fn(),
        }))

        const mod = await importFresh<typeof import("@/app/api/owlbear/character-sheets/route")>("@/app/api/owlbear/character-sheets/route")
        const response = await mod.GET(makeRequest("http://localhost/api/owlbear/character-sheets?page=1", {
            headers: { Authorization: "Bearer plain-token" },
        }))

        expect(response.status).toBe(200)
        expect(getAllUserSheets).toHaveBeenCalledWith("user-1", undefined, 1, 12)
    })
})
