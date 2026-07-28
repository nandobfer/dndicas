import { describe, expect, it, vi } from "vitest"
import { hashMcpToken } from "@/features/mcp/server/mcp-token-service"
import { importFresh } from "../helpers/module"

function headers(token?: string) {
    const headers = new Headers()
    if (token) headers.set("authorization", `Bearer ${token}`)
    return headers
}

describe("MCP auth service", () => {
    it("returns null when no bearer token is present", async () => {
        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/features/users/models/user", () => ({ User: { findOne: vi.fn() } }))

        const mod = await importFresh<typeof import("@/features/mcp/server/mcp-auth-service")>("@/features/mcp/server/mcp-auth-service")

        await expect(mod.resolveMcpAuthContext(new Headers())).resolves.toBeNull()
    })

    it("rejects tokens with an invalid prefix", async () => {
        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/features/users/models/user", () => ({ User: { findOne: vi.fn() } }))

        const mod = await importFresh<typeof import("@/features/mcp/server/mcp-auth-service")>("@/features/mcp/server/mcp-auth-service")

        await expect(mod.resolveMcpAuthContext(headers("wrong-token"))).rejects.toMatchObject({
            code: "MCP_TOKEN_INVALID",
            message: "Token MCP inválido ou revogado.",
        })
    })

    it("resolves an active user and touches last usage", async () => {
        const token = "dndicas_mcp_secret"
        const save = vi.fn().mockResolvedValue(undefined)
        const select = vi.fn().mockResolvedValue({
            _id: { toString: () => "user-1" },
            username: "hero",
            name: "Hero",
            email: "hero@example.com",
            role: "admin",
            mcpTokenLastUsedAt: new Date("2026-07-28T00:00:00.000Z"),
            save,
        })
        const findOne = vi.fn().mockReturnValue({ select })

        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/features/users/models/user", () => ({ User: { findOne } }))

        const mod = await importFresh<typeof import("@/features/mcp/server/mcp-auth-service")>("@/features/mcp/server/mcp-auth-service")
        const context = await mod.resolveMcpAuthContext(headers(token))

        expect(findOne).toHaveBeenCalledWith({
            mcpTokenHash: hashMcpToken(token),
            deleted: { $ne: true },
            status: "active",
        })
        expect(select).toHaveBeenCalledWith("+mcpTokenHash")
        expect(save).toHaveBeenCalledTimes(1)
        expect(context).toEqual({
            userId: "user-1",
            username: "hero",
            name: "Hero",
            email: "hero@example.com",
            role: "admin",
        })
    })

    it("rejects revoked or unknown tokens", async () => {
        vi.doMock("@/core/database/db", () => ({ default: vi.fn() }))
        vi.doMock("@/features/users/models/user", () => ({
            User: { findOne: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue(null) }) },
        }))

        const mod = await importFresh<typeof import("@/features/mcp/server/mcp-auth-service")>("@/features/mcp/server/mcp-auth-service")

        await expect(mod.resolveMcpAuthContext(headers("dndicas_mcp_missing"))).rejects.toMatchObject({ code: "MCP_TOKEN_INVALID" })
    })
})
