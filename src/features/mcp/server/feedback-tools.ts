import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { McpAuthAccess } from "./mcp-auth-service"
import { McpAuthError } from "./mcp-auth-service"
import { approveFeedbackMerge, commentFeedback, createFeedback, getFeedback, getFeedbackTimeline, listFeedbacks, McpFeedbackError, requestFeedbackImplementation, requestFeedbackIteration, requestFeedbackPlan, updateFeedback } from "./feedback-service"
import { commentFeedbackSchema, createFeedbackSchema, feedbackIdSchema, listFeedbacksSchema, requestFeedbackAgentSchema, requestFeedbackIterationSchema, updateFeedbackSchema } from "./feedback-schemas"
import { errorContent, jsonContent } from "./mcp-response"

async function runTool(action: () => Promise<Record<string, unknown>>) {
    try {
        return jsonContent(await action())
    } catch (error) {
        if (error instanceof McpAuthError || error instanceof McpFeedbackError) {
            return errorContent(error.message, error.code)
        }

        if (error instanceof z.ZodError) {
            return jsonContent({
                error: "Dados inválidos.",
                code: "VALIDATION_ERROR",
                details: error.issues,
            })
        }

        console.error("MCP feedback tool error:", error)
        return errorContent("Erro interno ao executar ferramenta de feedback.", "INTERNAL_ERROR")
    }
}

export function registerFeedbackTools(server: McpServer, auth: McpAuthAccess) {
    server.registerTool(
        "list_feedbacks",
        {
            title: "Listar feedbacks públicos",
            description: "Lista feedbacks com filtros públicos, sem expor dados sensíveis como email do criador ou worktree.",
            inputSchema: listFeedbacksSchema.shape,
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async (args) => runTool(async () => await listFeedbacks(listFeedbacksSchema.parse(args))),
    )

    server.registerTool(
        "get_feedback",
        {
            title: "Consultar feedback",
            description: "Consulta detalhe público de feedback. Com token válido, retorna campos adicionais conforme permissões do usuário.",
            inputSchema: feedbackIdSchema.shape,
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async (args) => runTool(async () => ({ feedback: await getFeedback(feedbackIdSchema.parse(args), await auth.getOptionalAuthContext()) })),
    )

    server.registerTool(
        "get_feedback_timeline",
        {
            title: "Consultar timeline de feedback",
            description: "Consulta timeline pública do feedback. Com token admin, inclui eventos administrativos.",
            inputSchema: feedbackIdSchema.shape,
            annotations: { readOnlyHint: true, openWorldHint: true },
        },
        async (args) => runTool(async () => await getFeedbackTimeline(feedbackIdSchema.parse(args), await auth.getOptionalAuthContext())),
    )

    server.registerTool(
        "create_feedback",
        {
            title: "Criar feedback",
            description: "Cria um feedback em nome do usuário autenticado pelo token MCP.",
            inputSchema: createFeedbackSchema.shape,
            annotations: { readOnlyHint: false, openWorldHint: true },
        },
        async (args) => runTool(async () => ({ feedback: await createFeedback(createFeedbackSchema.parse(args), await auth.requireAuthContext()) })),
    )

    server.registerTool(
        "update_feedback",
        {
            title: "Atualizar feedback",
            description: "Atualiza feedback conforme permissões atuais: dono ou admin, com status/prioridade restritos a admin.",
            inputSchema: updateFeedbackSchema.shape,
            annotations: { readOnlyHint: false, openWorldHint: true },
        },
        async (args) => runTool(async () => ({ feedback: await updateFeedback(updateFeedbackSchema.parse(args), await auth.requireAuthContext()) })),
    )

    server.registerTool(
        "comment_feedback",
        {
            title: "Comentar feedback",
            description: "Adiciona comentário público à timeline de um feedback usando o usuário autenticado pelo token MCP.",
            inputSchema: commentFeedbackSchema.shape,
            annotations: { readOnlyHint: false, openWorldHint: true },
        },
        async (args) => runTool(async () => ({ event: await commentFeedback(commentFeedbackSchema.parse(args), await auth.requireAuthContext()) })),
    )

    server.registerTool(
        "request_feedback_plan",
        {
            title: "Solicitar plano agêntico de feedback",
            description: "Solicita planejamento agêntico para feedback. Exige token MCP de admin e apenas enfileira a execução.",
            inputSchema: requestFeedbackAgentSchema.shape,
            annotations: { readOnlyHint: false, openWorldHint: true },
        },
        async (args) => runTool(async () => ({ run: await requestFeedbackPlan(requestFeedbackAgentSchema.parse(args), await auth.requireAdminContext()) })),
    )

    server.registerTool(
        "request_feedback_implementation",
        {
            title: "Solicitar implementação agêntica",
            description: "Solicita implementação agêntica para feedback. Exige token MCP de admin e apenas enfileira a execução.",
            inputSchema: requestFeedbackAgentSchema.shape,
            annotations: { readOnlyHint: false, openWorldHint: true },
        },
        async (args) => runTool(async () => ({ run: await requestFeedbackImplementation(requestFeedbackAgentSchema.parse(args), await auth.requireAdminContext()) })),
    )

    server.registerTool(
        "request_feedback_iteration",
        {
            title: "Solicitar iteração agêntica",
            description: "Solicita ajustes agênticos para feedback. Exige token MCP de admin e mensagem obrigatória.",
            inputSchema: requestFeedbackIterationSchema.shape,
            annotations: { readOnlyHint: false, openWorldHint: true },
        },
        async (args) => runTool(async () => ({ run: await requestFeedbackIteration(requestFeedbackIterationSchema.parse(args), await auth.requireAdminContext()) })),
    )

    server.registerTool(
        "approve_feedback_merge",
        {
            title: "Aprovar merge de feedback",
            description: "Aprova feedback para merge quando houver pull request. Exige token MCP de admin.",
            inputSchema: feedbackIdSchema.shape,
            annotations: { readOnlyHint: false, openWorldHint: true },
        },
        async (args) => runTool(async () => ({ run: await approveFeedbackMerge(feedbackIdSchema.parse(args), await auth.requireAdminContext()) })),
    )
}
