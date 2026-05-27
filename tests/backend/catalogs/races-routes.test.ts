import { describe, expect, it, vi } from "vitest"

import { readJson } from "../helpers/http"
import { importFresh } from "../helpers/module"

describe("races backend routes", () => {
    it("GET /api/races searches by name and originalName only", async () => {
        const countDocuments = vi.fn().mockResolvedValue(1)
        const items = [{ _id: { toString: () => "race-1" }, name: "Elfo", originalName: "Elf", source: "PHB" }]
        const lean = vi.fn().mockResolvedValue(items)
        const limit = vi.fn(() => ({ lean }))
        const skip = vi.fn(() => ({ limit }))
        const sort = vi.fn(() => ({ skip, lean }))
        const find = vi.fn(() => ({ sort }))

        vi.doMock("@/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock("@/features/races/models/race", () => ({ RaceModel: { find, countDocuments } }))
        vi.doMock("@clerk/nextjs/server", () => ({ auth: vi.fn() }))
        vi.doMock("@/features/users/api/audit-service", () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import("@/app/api/races/route")>("@/app/api/races/route")
        const response = await mod.GET(new Request("http://localhost/api/races?page=1&limit=10&search=elf&searchField=name&status=active&sources=PHB") as never)
        const payload = await readJson(response)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            $or: [
                { name: { $regex: "elf", $options: "i" } },
                { originalName: { $regex: "elf", $options: "i" } },
            ],
            status: "active",
            source: { $in: [expect.any(RegExp)] },
        }))
        expect(JSON.stringify(find.mock.calls[0][0])).not.toContain("description")
        expect(payload.items).toMatchObject([{ id: "race-1", name: "Elfo", originalName: "Elf", source: "PHB" }])
        expect(countDocuments).toHaveBeenCalledWith(expect.objectContaining({
            $or: [
                { name: { $regex: "elf", $options: "i" } },
                { originalName: { $regex: "elf", $options: "i" } },
            ],
        }))
    })

    it("GET /api/races keeps the active-only default when no status is provided", async () => {
        const countDocuments = vi.fn().mockResolvedValue(0)
        const lean = vi.fn().mockResolvedValue([])
        const sort = vi.fn(() => ({ lean }))
        const find = vi.fn(() => ({ sort }))

        vi.doMock("@/core/database/db", () => ({ default: vi.fn().mockResolvedValue(undefined) }))
        vi.doMock("@/features/races/models/race", () => ({ RaceModel: { find, countDocuments } }))
        vi.doMock("@clerk/nextjs/server", () => ({ auth: vi.fn() }))
        vi.doMock("@/features/users/api/audit-service", () => ({ createAuditLog: vi.fn() }))

        const mod = await importFresh<typeof import("@/app/api/races/route")>("@/app/api/races/route")
        const response = await mod.GET(new Request("http://localhost/api/races?search=elf") as never)

        expect(response.status).toBe(200)
        expect(find).toHaveBeenCalledWith(expect.objectContaining({
            $or: [
                { name: { $regex: "elf", $options: "i" } },
                { originalName: { $regex: "elf", $options: "i" } },
            ],
            status: "active",
        }))
    })
})
