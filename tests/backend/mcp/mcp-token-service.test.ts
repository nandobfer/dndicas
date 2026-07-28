import { describe, expect, it } from "vitest"
import { generateMcpToken, getMcpTokenDisplay, hashMcpToken, MCP_TOKEN_PREFIX, serializeMcpTokenState } from "@/features/mcp/server/mcp-token-service"

describe("MCP token service", () => {
    it("generates tokens with the DnDicas MCP prefix", () => {
        const token = generateMcpToken()

        expect(token).toMatch(/^dndicas_mcp_[A-Za-z0-9_-]+$/)
        expect(token.length).toBeGreaterThan(MCP_TOKEN_PREFIX.length + 20)
    })

    it("hashes tokens without returning the secret", () => {
        const token = "dndicas_mcp_secret"

        expect(hashMcpToken(token)).toBe(hashMcpToken(token))
        expect(hashMcpToken(token)).not.toBe(token)
    })

    it("serializes an empty token state", () => {
        expect(serializeMcpTokenState(null)).toEqual({ exists: false })
        expect(serializeMcpTokenState({})).toEqual({ exists: false })
    })

    it("serializes only masked token metadata", () => {
        const token = "dndicas_mcp_abcdefghijklmnopqrstuvwxyz"
        const display = getMcpTokenDisplay(token)
        const createdAt = new Date("2026-07-28T12:00:00.000Z")

        expect(serializeMcpTokenState({
            mcpTokenPrefix: display.prefix,
            mcpTokenSuffix: display.suffix,
            mcpTokenCreatedAt: createdAt,
        })).toEqual({
            exists: true,
            prefix: "dndicas_mcp_abcdef",
            suffix: "uvwxyz",
            createdAt: "2026-07-28T12:00:00.000Z",
            lastUsedAt: null,
        })
    })
})
