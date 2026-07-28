import crypto from "node:crypto"
import type { IUser } from "@/features/users/models/user"

export const MCP_TOKEN_PREFIX = "dndicas_mcp_"

export type McpTokenState =
    | { exists: false }
    | {
          exists: true
          prefix: string
          suffix: string
          createdAt: string
          lastUsedAt: string | null
      }

type UserWithMcpTokenState = Pick<IUser, "mcpTokenPrefix" | "mcpTokenSuffix" | "mcpTokenCreatedAt" | "mcpTokenLastUsedAt">

function serializeDate(value: Date | string | undefined): string | null {
    if (!value) return null
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function generateMcpToken(): string {
    return `${MCP_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`
}

export function hashMcpToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex")
}

export function getMcpTokenDisplay(token: string) {
    return {
        prefix: token.slice(0, MCP_TOKEN_PREFIX.length + 6),
        suffix: token.slice(-6),
    }
}

export function serializeMcpTokenState(user: UserWithMcpTokenState | null | undefined): McpTokenState {
    if (!user?.mcpTokenPrefix || !user.mcpTokenSuffix || !user.mcpTokenCreatedAt) {
        return { exists: false }
    }

    return {
        exists: true,
        prefix: user.mcpTokenPrefix,
        suffix: user.mcpTokenSuffix,
        createdAt: serializeDate(user.mcpTokenCreatedAt) ?? new Date(0).toISOString(),
        lastUsedAt: serializeDate(user.mcpTokenLastUsedAt),
    }
}
