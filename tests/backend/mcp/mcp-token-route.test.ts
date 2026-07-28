import { describe, expect, it, vi } from "vitest"
import { importFresh } from "../helpers/module"

function makeRequest(method: string) {
    return new Request("http://localhost/api/auth/profile/mcp-token", {
        method,
        headers: {
            "user-agent": "vitest",
            "x-forwarded-for": "127.0.0.1",
        },
    })
}

describe("profile MCP token route", () => {
    it("requires authentication to generate a token", async () => {
        vi.doMock("@/core/auth/helpers", () => ({
            requireAuth: vi.fn().mockRejectedValue(new Error("UNAUTHORIZED")),
        }))
        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/features/users/models/user", () => ({ User: { findOne: vi.fn() } }))
        vi.doMock("@/features/users/api/audit-service", () => ({ logCreate: vi.fn(), logDelete: vi.fn() }))

        const mod = await importFresh<typeof import("@/app/api/auth/profile/mcp-token/route")>("@/app/api/auth/profile/mcp-token/route")
        const response = await mod.POST(makeRequest("POST") as never)

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual({ error: "Não autorizado" })
    })

    it("generates a token once and stores only its hash", async () => {
        const save = vi.fn().mockResolvedValue(undefined)
        const user: {
            _id: string
            save: ReturnType<typeof vi.fn>
            mcpTokenHash?: string
            mcpTokenPrefix?: string
            mcpTokenSuffix?: string
            mcpTokenCreatedAt?: Date
            mcpTokenLastUsedAt?: Date
        } = {
            _id: "user-1",
            save,
        }
        const findOne = vi.fn().mockResolvedValue(user)
        const logCreate = vi.fn()

        vi.doMock("@/core/auth/helpers", () => ({
            requireAuth: vi.fn().mockResolvedValue("user-1"),
        }))
        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/features/users/models/user", () => ({ User: { findOne } }))
        vi.doMock("@/features/users/api/audit-service", () => ({ logCreate, logDelete: vi.fn() }))

        const mod = await importFresh<typeof import("@/app/api/auth/profile/mcp-token/route")>("@/app/api/auth/profile/mcp-token/route")
        const response = await mod.POST(makeRequest("POST") as never)
        const payload = await response.json()

        expect(response.status).toBe(201)
        expect(payload.token).toMatch(/^dndicas_mcp_/)
        expect(payload.mcpToken).toMatchObject({ exists: true, prefix: expect.stringMatching(/^dndicas_mcp_/) })
        expect(user).toMatchObject({
            mcpTokenPrefix: payload.mcpToken.prefix,
            mcpTokenSuffix: payload.mcpToken.suffix,
        })
        expect(user.mcpTokenHash).not.toBe(payload.token)
        expect(save).toHaveBeenCalledTimes(1)
        expect(logCreate).toHaveBeenCalledWith(
            "McpToken",
            "user-1",
            "user-1",
            expect.objectContaining({ tokenPrefix: payload.mcpToken.prefix }),
            expect.objectContaining({ reason: "MCP_TOKEN_CREATE", userAgent: "vitest" }),
        )
    })

    it("revokes the current token", async () => {
        const save = vi.fn().mockResolvedValue(undefined)
        const user = {
            mcpTokenHash: "hash",
            mcpTokenPrefix: "dndicas_mcp_abcdef",
            mcpTokenSuffix: "uvwxyz",
            mcpTokenCreatedAt: new Date("2026-07-28T12:00:00.000Z"),
            save,
        }
        const findOne = vi.fn().mockResolvedValue(user)
        const logDelete = vi.fn()

        vi.doMock("@/core/auth/helpers", () => ({
            requireAuth: vi.fn().mockResolvedValue("user-1"),
        }))
        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/features/users/models/user", () => ({ User: { findOne } }))
        vi.doMock("@/features/users/api/audit-service", () => ({ logCreate: vi.fn(), logDelete }))

        const mod = await importFresh<typeof import("@/app/api/auth/profile/mcp-token/route")>("@/app/api/auth/profile/mcp-token/route")
        const response = await mod.DELETE(makeRequest("DELETE") as never)

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ mcpToken: { exists: false } })
        expect(user).toMatchObject({
            mcpTokenHash: undefined,
            mcpTokenPrefix: undefined,
            mcpTokenSuffix: undefined,
            mcpTokenCreatedAt: undefined,
            mcpTokenLastUsedAt: undefined,
        })
        expect(save).toHaveBeenCalledTimes(1)
        expect(logDelete).toHaveBeenCalledWith(
            "McpToken",
            "user-1",
            "user-1",
            expect.objectContaining({ tokenPrefix: "dndicas_mcp_abcdef" }),
            expect.objectContaining({ reason: "MCP_TOKEN_DELETE" }),
        )
    })
})
