import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import { hashMcpToken, MCP_TOKEN_PREFIX } from "./mcp-token-service"

const MCP_TOKEN_TOUCH_INTERVAL_MS = 15 * 60 * 1000

export type McpAuthContext = {
    userId: string
    username: string
    name: string | null
    email: string
    role: "admin" | "user"
}

export class McpAuthError extends Error {
    constructor(message: string, readonly code: "MCP_TOKEN_REQUIRED" | "MCP_TOKEN_INVALID" | "MCP_FORBIDDEN") {
        super(message)
    }
}

function extractBearerToken(headers: Headers): string | null {
    const authorization = headers.get("authorization")
    if (!authorization) return null

    const match = authorization.match(/^Bearer\s+(.+)$/i)
    return match?.[1]?.trim() || null
}

function shouldTouchLastUsed(lastUsedAt?: Date) {
    if (!lastUsedAt) return true
    return Date.now() - lastUsedAt.getTime() > MCP_TOKEN_TOUCH_INTERVAL_MS
}

export async function resolveMcpAuthContext(headers: Headers): Promise<McpAuthContext | null> {
    const token = extractBearerToken(headers)
    if (!token) return null
    if (!token.startsWith(MCP_TOKEN_PREFIX)) {
        throw new McpAuthError("Token MCP inválido ou revogado.", "MCP_TOKEN_INVALID")
    }

    await dbConnect()

    const tokenHash = hashMcpToken(token)
    const user = await User.findOne({
        mcpTokenHash: tokenHash,
        deleted: { $ne: true },
        status: "active",
    }).select("+mcpTokenHash")

    if (!user) {
        throw new McpAuthError("Token MCP inválido ou revogado.", "MCP_TOKEN_INVALID")
    }

    if (shouldTouchLastUsed(user.mcpTokenLastUsedAt)) {
        user.mcpTokenLastUsedAt = new Date()
        await user.save()
    }

    return {
        userId: user._id.toString(),
        username: user.username,
        name: user.name || null,
        email: user.email,
        role: user.role,
    }
}

export function createMcpAuthAccess(headers: Headers) {
    let contextPromise: Promise<McpAuthContext | null> | null = null

    async function getOptionalAuthContext() {
        contextPromise ??= resolveMcpAuthContext(headers)
        return contextPromise
    }

    async function requireAuthContext() {
        const context = await getOptionalAuthContext()
        if (!context) {
            throw new McpAuthError("Token MCP obrigatório para esta operação.", "MCP_TOKEN_REQUIRED")
        }
        return context
    }

    async function requireAdminContext() {
        const context = await requireAuthContext()
        if (context.role !== "admin") {
            throw new McpAuthError("Você não tem permissão para executar esta ação.", "MCP_FORBIDDEN")
        }
        return context
    }

    return {
        getOptionalAuthContext,
        requireAuthContext,
        requireAdminContext,
    }
}

export type McpAuthAccess = ReturnType<typeof createMcpAuthAccess>
