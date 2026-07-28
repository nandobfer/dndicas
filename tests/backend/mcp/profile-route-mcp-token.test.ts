import { describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"

describe("profile route MCP token metadata", () => {
    it("returns an empty MCP token state when the user has no token", async () => {
        vi.doMock("@/core/auth/helpers", () => ({ requireAuth: vi.fn().mockResolvedValue("user-1") }))
        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/features/users/models/user", () => ({
            User: {
                findOne: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue({
                        _id: { toString: () => "user-1" },
                        name: "Hero",
                        username: "hero",
                        email: "hero@example.com",
                        role: "user",
                    }),
                }),
            },
        }))

        const mod = await importFresh<typeof import("@/app/api/auth/profile/route")>("@/app/api/auth/profile/route")
        const response = await mod.GET()

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toMatchObject({
            id: "user-1",
            mcpToken: { exists: false },
        })
    })

    it("returns only masked MCP token metadata", async () => {
        vi.doMock("@/core/auth/helpers", () => ({ requireAuth: vi.fn().mockResolvedValue("user-1") }))
        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/features/users/models/user", () => ({
            User: {
                findOne: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue({
                        _id: { toString: () => "user-1" },
                        name: "Hero",
                        username: "hero",
                        email: "hero@example.com",
                        role: "admin",
                        mcpTokenPrefix: "dndicas_mcp_abcdef",
                        mcpTokenSuffix: "uvwxyz",
                        mcpTokenCreatedAt: new Date("2026-07-28T12:00:00.000Z"),
                        mcpTokenHash: "should-not-leak",
                    }),
                }),
            },
        }))

        const mod = await importFresh<typeof import("@/app/api/auth/profile/route")>("@/app/api/auth/profile/route")
        const response = await mod.GET()
        const payload = await response.json()

        expect(payload.mcpToken).toEqual({
            exists: true,
            prefix: "dndicas_mcp_abcdef",
            suffix: "uvwxyz",
            createdAt: "2026-07-28T12:00:00.000Z",
            lastUsedAt: null,
        })
        expect(JSON.stringify(payload)).not.toContain("should-not-leak")
    })
})
