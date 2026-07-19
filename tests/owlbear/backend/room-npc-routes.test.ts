/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it, vi } from "vitest"
import { makeJsonRequest, readJson } from "../../backend/helpers/http"
import { importFresh } from "../../backend/helpers/module"

const sessionMock = vi.hoisted(() => ({
    value: {
        sessionId: "session-1",
        userId: "user-1",
        roomId: "room-1",
        owlbearPlayerId: "player-1",
        owlbearRole: "GM" as "GM" | "PLAYER",
    },
}))

class TestOwlbearHttpError extends Error {
    status: number
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

vi.mock("@/features/owlbear/server/auth", () => ({
    OwlbearHttpError: TestOwlbearHttpError,
    requireOwlbearSession: vi.fn(() => Promise.resolve(sessionMock.value)),
    owlbearErrorResponse: (error: unknown) => {
        if (error instanceof TestOwlbearHttpError) {
            return Response.json({ error: error.message }, { status: error.status })
        }
        return Response.json({ error: "Erro interno do servidor" }, { status: 500 })
    },
}))

function mockDb() {
    vi.doMock("@/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
}

function mockSessionService() {
    vi.doMock("@/features/owlbear/server/session-service", () => ({
        isAnonymousGmSessionUserId: (userId: string) => userId.startsWith("owlbear-gm:"),
    }))
}

describe("Owlbear room NPC routes", () => {
    it("blocks PLAYER sessions", async () => {
        sessionMock.value = { ...sessionMock.value, owlbearRole: "PLAYER" }
        mockDb()
        mockSessionService()

        const mod = await importFresh<typeof import("@/app/api/owlbear/rooms/[roomId]/npcs/route")>("@/app/api/owlbear/rooms/[roomId]/npcs/route")
        const response = await mod.GET(new Request("http://localhost/api/owlbear/rooms/room-1/npcs") as any, { params: Promise.resolve({ roomId: "room-1" }) })

        expect(response.status).toBe(403)
    })

    it("blocks sessions from another room", async () => {
        sessionMock.value = { ...sessionMock.value, owlbearRole: "GM", roomId: "other-room" }
        mockDb()
        mockSessionService()

        const mod = await importFresh<typeof import("@/app/api/owlbear/rooms/[roomId]/npcs/route")>("@/app/api/owlbear/rooms/[roomId]/npcs/route")
        const response = await mod.GET(new Request("http://localhost/api/owlbear/rooms/room-1/npcs") as any, { params: Promise.resolve({ roomId: "room-1" }) })

        expect(response.status).toBe(403)
    })

    it("blocks anonymous GM sessions", async () => {
        sessionMock.value = { ...sessionMock.value, owlbearRole: "GM", roomId: "room-1", userId: "owlbear-gm:room-1:player-1" }
        mockDb()
        mockSessionService()

        const mod = await importFresh<typeof import("@/app/api/owlbear/rooms/[roomId]/npcs/route")>("@/app/api/owlbear/rooms/[roomId]/npcs/route")
        const response = await mod.GET(new Request("http://localhost/api/owlbear/rooms/room-1/npcs") as any, { params: Promise.resolve({ roomId: "room-1" }) })

        expect(response.status).toBe(401)
    })

    it("creates a room link and clamps hpCurrent to hpMax", async () => {
        sessionMock.value = { ...sessionMock.value, owlbearRole: "GM", roomId: "room-1", userId: "user-1" }
        const source = { _id: "monster-1", name: "Lobo", savingThrows: {}, skills: {} }
        const created = {
            _id: "room-npc-1",
            roomId: "room-1",
            sourceKind: "monster",
            sourceId: "monster-1",
            hpCurrent: 10,
            hpMax: 10,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
        const create = vi.fn().mockResolvedValue(created)

        mockDb()
        mockSessionService()
        vi.doMock("@/features/monsters/models/monster", () => ({ MonsterModel: { findById: vi.fn().mockResolvedValue(source), find: vi.fn() } }))
        vi.doMock("@/features/monsters/models/user-npc", () => ({ UserNpcModel: { findOne: vi.fn(), find: vi.fn(), create: vi.fn() } }))
        vi.doMock("@/features/owlbear/models/owlbear-room-npc", () => ({ OwlbearRoomNpc: { create } }))

        const mod = await importFresh<typeof import("@/app/api/owlbear/rooms/[roomId]/npcs/route")>("@/app/api/owlbear/rooms/[roomId]/npcs/route")
        const response = await mod.POST(makeJsonRequest("http://localhost/api/owlbear/rooms/room-1/npcs", {
            method: "POST",
            body: JSON.stringify({ sourceKind: "monster", sourceId: "monster-1", hpCurrent: 99, hpMax: 10 }),
        }) as any, { params: Promise.resolve({ roomId: "room-1" }) })
        const payload = await readJson<{ hpCurrent: number; hpMax: number; source: { name: string } }>(response)

        expect(response.status).toBe(201)
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ hpCurrent: 10, hpMax: 10 }))
        expect(payload.hpCurrent).toBe(10)
        expect(payload.source.name).toBe("Lobo")
    })

    it("lists user NPCs using the authenticated Owlbear session user", async () => {
        sessionMock.value = { ...sessionMock.value, owlbearRole: "GM", roomId: "room-1", userId: "user-1" }
        const sort = vi.fn().mockResolvedValue([
            { _id: "npc-1", name: "Bandido", savingThrows: {}, skills: {}, toObject: () => ({ _id: "npc-1", name: "Bandido", savingThrows: {}, skills: {} }) },
        ])
        const find = vi.fn().mockReturnValue({ sort })

        mockDb()
        mockSessionService()
        vi.doMock("@/features/monsters/models/monster", () => ({ MonsterModel: { findById: vi.fn(), find: vi.fn() } }))
        vi.doMock("@/features/monsters/models/user-npc", () => ({ UserNpcModel: { find, findOne: vi.fn(), create: vi.fn() } }))
        vi.doMock("@/features/owlbear/models/owlbear-room-npc", () => ({ OwlbearRoomNpc: { create: vi.fn() } }))

        const mod = await importFresh<typeof import("@/app/api/owlbear/rooms/[roomId]/npcs/user-npcs/route")>("@/app/api/owlbear/rooms/[roomId]/npcs/user-npcs/route")
        const response = await mod.GET(new Request("http://localhost/api/owlbear/rooms/room-1/npcs/user-npcs?status=active&limit=12") as any, { params: Promise.resolve({ roomId: "room-1" }) })
        const payload = await readJson<{ items: Array<{ _id: string; name: string }>; total: number }>(response)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith({ userId: "user-1", status: "active" })
        expect(sort).toHaveBeenCalledWith({ name: 1 })
        expect(payload.items).toEqual([expect.objectContaining({ _id: "npc-1", name: "Bandido" })])
        expect(payload.total).toBe(1)
    })

    it("patches HP with server-side clamping", async () => {
        sessionMock.value = { ...sessionMock.value, owlbearRole: "GM", roomId: "room-1", userId: "user-1" }
        const current = {
            _id: "room-npc-1",
            roomId: "room-1",
            sourceKind: "monster",
            sourceId: "monster-1",
            hpCurrent: 8,
            hpMax: 12,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            save: vi.fn().mockResolvedValue(undefined),
        }

        mockDb()
        mockSessionService()
        vi.doMock("@/features/monsters/models/monster", () => ({ MonsterModel: { findById: vi.fn().mockResolvedValue({ _id: "monster-1", name: "Lobo" }), find: vi.fn() } }))
        vi.doMock("@/features/monsters/models/user-npc", () => ({ UserNpcModel: { findOne: vi.fn(), find: vi.fn(), create: vi.fn() } }))
        vi.doMock("@/features/owlbear/models/owlbear-room-npc", () => ({ OwlbearRoomNpc: { findOne: vi.fn().mockResolvedValue(current) } }))

        const mod = await importFresh<typeof import("@/app/api/owlbear/rooms/[roomId]/npcs/[npcId]/route")>("@/app/api/owlbear/rooms/[roomId]/npcs/[npcId]/route")
        const response = await mod.PATCH(makeJsonRequest("http://localhost/api/owlbear/rooms/room-1/npcs/room-npc-1", {
            method: "PATCH",
            body: JSON.stringify({ hpCurrent: 99 }),
        }) as any, { params: Promise.resolve({ roomId: "room-1", npcId: "room-npc-1" }) })
        const payload = await readJson<{ hpCurrent: number; hpMax: number }>(response)

        expect(response.status).toBe(200)
        expect(current.save).toHaveBeenCalled()
        expect(payload.hpCurrent).toBe(12)
        expect(payload.hpMax).toBe(12)
    })

    it("deletes only the room link", async () => {
        sessionMock.value = { ...sessionMock.value, owlbearRole: "GM", roomId: "room-1", userId: "user-1" }
        const findOneAndDelete = vi.fn().mockResolvedValue({ _id: "room-npc-1" })

        mockDb()
        mockSessionService()
        vi.doMock("@/features/monsters/models/monster", () => ({ MonsterModel: { findById: vi.fn(), find: vi.fn() } }))
        vi.doMock("@/features/monsters/models/user-npc", () => ({ UserNpcModel: { findOne: vi.fn(), find: vi.fn(), create: vi.fn() } }))
        vi.doMock("@/features/owlbear/models/owlbear-room-npc", () => ({ OwlbearRoomNpc: { findOneAndDelete } }))

        const mod = await importFresh<typeof import("@/app/api/owlbear/rooms/[roomId]/npcs/[npcId]/route")>("@/app/api/owlbear/rooms/[roomId]/npcs/[npcId]/route")
        const response = await mod.DELETE(new Request("http://localhost/api/owlbear/rooms/room-1/npcs/room-npc-1") as any, { params: Promise.resolve({ roomId: "room-1", npcId: "room-npc-1" }) })

        expect(response.status).toBe(200)
        expect(findOneAndDelete).toHaveBeenCalledWith({ _id: "room-npc-1", roomId: "room-1", userId: "user-1" })
    })
})
