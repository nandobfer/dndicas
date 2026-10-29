import { dbConnect } from "@/lib/db"
import { MCP_ENDPOINT_PATH } from "@/lib/public-api/paths"
import { User } from "@/features/users/models/user"

export interface McpServerOverviewDto {
    /** Caminho do servidor MCP (Streamable HTTP), relativo à URL pública do app. */
    endpoint: string
    /** Usuários com token MCP permanente ativo (gerado em /profile). */
    activeTokens: number
    /** Desses, quantos são administradores. */
    adminTokens: number
    /** Último uso de um token MCP (ISO), ou `null`. */
    lastUsedAt: string | null
}

/** Visão do servidor MCP para o card da integração "API dndicas". Nunca expõe tokens. */
export async function getMcpServerOverview(): Promise<McpServerOverviewDto> {
    await dbConnect()
    const filter = { mcpTokenHash: { $exists: true, $nin: [null, ""] }, deleted: { $ne: true } }
    const [activeTokens, adminTokens, last] = await Promise.all([
        User.countDocuments(filter),
        User.countDocuments({ ...filter, role: "admin" }),
        User.findOne({ ...filter, mcpTokenLastUsedAt: { $ne: null } })
            .sort({ mcpTokenLastUsedAt: -1 })
            .select({ mcpTokenLastUsedAt: 1 })
            .lean<{ mcpTokenLastUsedAt?: Date }>(),
    ])
    return {
        endpoint: MCP_ENDPOINT_PATH,
        activeTokens,
        adminTokens,
        lastUsedAt: last?.mcpTokenLastUsedAt ? new Date(last.mcpTokenLastUsedAt).toISOString() : null,
    }
}
