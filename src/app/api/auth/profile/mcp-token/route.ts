import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/core/database/db"
import { requireAuth } from "@/core/auth/helpers"
import { User } from "@/features/users/models/user"
import { logCreate, logDelete } from "@/features/users/api/audit-service"
import { generateMcpToken, getMcpTokenDisplay, hashMcpToken, serializeMcpTokenState } from "@/features/mcp/server/mcp-token-service"

function getRequestMetadata(request: NextRequest) {
    return {
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
    }
}

export async function POST(request: NextRequest) {
    try {
        const userId = await requireAuth()
        await dbConnect()

        const user = await User.findOne({ _id: userId, deleted: { $ne: true }, status: "active" })
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

        const token = generateMcpToken()
        const display = getMcpTokenDisplay(token)
        const createdAt = new Date()

        user.mcpTokenHash = hashMcpToken(token)
        user.mcpTokenPrefix = display.prefix
        user.mcpTokenSuffix = display.suffix
        user.mcpTokenCreatedAt = createdAt
        user.mcpTokenLastUsedAt = undefined
        await user.save()

        await logCreate("McpToken", userId, userId, {
            tokenPrefix: display.prefix,
            tokenSuffix: display.suffix,
            createdAt: createdAt.toISOString(),
        }, {
            ...getRequestMetadata(request),
            reason: "MCP_TOKEN_CREATE",
        })

        return NextResponse.json({
            token,
            mcpToken: serializeMcpTokenState(user),
        }, { status: 201 })
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido"
        const status = message === "UNAUTHORIZED" ? 401 : 500
        return NextResponse.json({ error: status === 401 ? "Não autorizado" : "Erro ao gerar token MCP" }, { status })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const userId = await requireAuth()
        await dbConnect()

        const user = await User.findOne({ _id: userId, deleted: { $ne: true }, status: "active" })
        if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

        const previousToken = serializeMcpTokenState(user)

        user.mcpTokenHash = undefined
        user.mcpTokenPrefix = undefined
        user.mcpTokenSuffix = undefined
        user.mcpTokenCreatedAt = undefined
        user.mcpTokenLastUsedAt = undefined
        await user.save()

        await logDelete("McpToken", userId, userId, previousToken.exists ? {
            tokenPrefix: previousToken.prefix,
            tokenSuffix: previousToken.suffix,
            createdAt: previousToken.createdAt,
        } : {}, {
            ...getRequestMetadata(request),
            reason: "MCP_TOKEN_DELETE",
        })

        return NextResponse.json({ mcpToken: { exists: false } })
    } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido"
        const status = message === "UNAUTHORIZED" ? 401 : 500
        return NextResponse.json({ error: status === 401 ? "Não autorizado" : "Erro ao excluir token MCP" }, { status })
    }
}
