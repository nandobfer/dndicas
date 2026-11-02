import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { Types } from "mongoose"
import { APP_VERSION } from "@/lib/config/version"
import { dbConnect } from "@/lib/db"
import { jsonContent } from "@/features/mcp/server/mcp-response"
import { MADDOX_MCP_SERVER_NAME } from "../constants"
import { isActiveMaddoxJob } from "./game-live"
import { MADDOX_NARRATOR_TOOLS, MaddoxToolError, runMaddoxTool, type MaddoxMasterTool } from "./master-tools"
import { verifyMaddoxInterviewToken, verifyMaddoxTurnToken } from "./master-turn-token"
import { MADDOX_ALL_INTERVIEW_TOOLS, MaddoxInterviewToolError, runInterviewTool, type MaddoxInterviewTool } from "./interview-tools"
import { MADDOX_CATALOG_TOOLS, MaddoxCatalogToolError, runCatalogTool, type MaddoxCatalogTool } from "./catalog-tools"
import { MaddoxInterviewModel } from "../models"

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
        return jsonContent((await runMaddoxTool(tool, { campaignId: new Types.ObjectId(turn.campaignId), turnNumber: turn.turnNumber, jobId: turn.jobId }, input)) as Record<string, unknown>)
    } catch (error) {
        return errorContent(error instanceof MaddoxToolError ? error.message : "Falha ao executar a ferramenta.")
    }
}

/** Ferramentas da entrevista (Maddox 5): token de entrevista próprio, válido só enquanto a geração dele roda. */
async function handleInterview(tool: MaddoxInterviewTool, args: Record<string, unknown>) {
    const { [TURN_FIELD]: token, ...input } = args
    const turn = verifyMaddoxInterviewToken(typeof token === "string" ? token : null)
    if (!turn || !Types.ObjectId.isValid(turn.interviewId)) return errorContent("Token de turno inválido ou expirado: use o valor de `turno` informado nas instruções desta entrevista.")
    try {
        await dbConnect()
        return jsonContent((await runInterviewTool(tool, { interviewId: new Types.ObjectId(turn.interviewId), lockToken: turn.lockToken }, input)) as Record<string, unknown>)
    } catch (error) {
        return errorContent(error instanceof MaddoxInterviewToolError ? error.message : "Falha ao executar a ferramenta.")
    }
}

/**
 * Consulta ao catálogo (só leitura, dados públicos): aceita o token de turno do narrador OU o da entrevista, cada um
 * válido só enquanto a geração dele roda. As ferramentas que gravam continuam aceitando só o token do próprio tipo.
 */
async function handleCatalog(tool: MaddoxCatalogTool, args: Record<string, unknown>) {
    const { [TURN_FIELD]: token, ...input } = args
    const raw = typeof token === "string" ? token : null
    const turn = verifyMaddoxTurnToken(raw)
    const interview = turn ? null : verifyMaddoxInterviewToken(raw)
    let active = false
    if (turn && Types.ObjectId.isValid(turn.campaignId)) active = isActiveMaddoxJob(turn.campaignId, turn.jobId)
    else if (interview && Types.ObjectId.isValid(interview.interviewId)) {
        await dbConnect()
        active = Boolean(await MaddoxInterviewModel.exists({ _id: interview.interviewId, "generating.token": interview.lockToken }))
    } else return errorContent("Token de turno inválido ou expirado: use o valor de `turno` informado nas instruções.")
    if (!active) return errorContent("Esta resposta do Maddox já terminou: as ferramentas só funcionam durante a geração.")
    try {
        await dbConnect()
        return jsonContent((await runCatalogTool(tool, input)) as Record<string, unknown>)
    } catch (error) {
        return errorContent(error instanceof MaddoxCatalogToolError ? error.message : "Falha ao consultar o catálogo.")
    }
}

export function createMaddoxMcpServer() {
    const server = new McpServer({ name: MADDOX_MCP_SERVER_NAME, version: APP_VERSION })
    for (const tool of MADDOX_NARRATOR_TOOLS) {
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
    for (const tool of MADDOX_ALL_INTERVIEW_TOOLS) {
        server.registerTool(
            tool.name,
            {
                title: tool.name,
                description: `${tool.description} ${tool.scope === "scenario" ? "Só na entrevista de cenário do Fiel ao D&D." : "Só na entrevista de personagem."} Sempre envie \`${TURN_FIELD}\` com o token de turno das instruções da entrevista.`,
                inputSchema: { [TURN_FIELD]: z.string().describe("Token de turno informado nas instruções da entrevista"), ...tool.input.shape },
                annotations: { readOnlyHint: tool.readOnly, openWorldHint: false },
            },
            async (args: Record<string, unknown>) => handleInterview(tool, args),
        )
    }
    for (const tool of MADDOX_CATALOG_TOOLS) {
        server.registerTool(
            tool.name,
            {
                title: tool.name,
                description: `${tool.description} Sempre envie \`${TURN_FIELD}\` com o token de turno das instruções (da narração ou da entrevista).`,
                inputSchema: { [TURN_FIELD]: z.string().describe("Token de turno informado nas instruções"), ...tool.input.shape },
                annotations: { readOnlyHint: true, openWorldHint: false },
            },
            async (args: Record<string, unknown>) => handleCatalog(tool, args),
        )
    }
    return server
}
