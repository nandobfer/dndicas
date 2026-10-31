import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { Types } from "mongoose"
import { APP_VERSION } from "@/lib/config/version"
import { dbConnect } from "@/lib/db"
import { jsonContent } from "@/features/mcp/server/mcp-response"
import { MADDOX_MCP_SERVER_NAME } from "../constants"
import { isActiveMaddoxJob } from "./game-live"
import { MADDOX_MASTER_TOOLS, MaddoxToolError, runMaddoxTool, type MaddoxMasterTool } from "./master-tools"
import { verifyMaddoxTurnToken } from "./master-turn-token"

/**
 * Servidor MCP do Maddox (Maddox 4): as mesmas ferramentas de persistência do narrador, para o OpenCode (que não
 * recebe as ferramentas do app pela AI SDK). Separado do MCP público (`/api/mcp`). Cada chamada traz o token de turno
 * (`turno`), que define a campanha e só vale enquanto a geração dele está rodando.
 */

const TURN_FIELD = "turno"

const errorContent = (message: string) => ({ ...jsonContent({ error: message }), isError: true })

async function handle(tool: MaddoxMasterTool, args: Record<string, unknown>) {
    const { [TURN_FIELD]: token, ...input } = args
    const turn = verifyMaddoxTurnToken(typeof token === "string" ? token : null)
    if (!turn || !Types.ObjectId.isValid(turn.campaignId)) return errorContent("Token de turno inválido ou expirado: use o valor de `turno` informado nas instruções desta narração.")
    if (!isActiveMaddoxJob(turn.campaignId, turn.jobId)) return errorContent("Esta narração já terminou: as ferramentas do Maddox só funcionam durante a geração.")
    try {
        await dbConnect()
        return jsonContent((await runMaddoxTool(tool, { campaignId: new Types.ObjectId(turn.campaignId), turnNumber: turn.turnNumber }, input)) as Record<string, unknown>)
    } catch (error) {
        return errorContent(error instanceof MaddoxToolError ? error.message : "Falha ao executar a ferramenta.")
    }
}

export function createMaddoxMcpServer() {
    const server = new McpServer({ name: MADDOX_MCP_SERVER_NAME, version: APP_VERSION })
    for (const tool of MADDOX_MASTER_TOOLS) {
        server.registerTool(
            tool.name,
            {
                title: tool.name,
                description: `${tool.description} Sempre envie \`${TURN_FIELD}\` com o token de turno das instruções.`,
                inputSchema: { [TURN_FIELD]: z.string().describe("Token de turno informado nas instruções da narração"), ...tool.input.shape },
                annotations: { readOnlyHint: tool.readOnly, openWorldHint: false },
            },
            async (args: Record<string, unknown>) => handle(tool, args),
        )
    }
    return server
}
