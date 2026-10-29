import dbConnect from "@/core/database/db"
import { User } from "@/features/users/models/user"
import type { McpAuthContext } from "@/features/mcp/server/mcp-auth-service"
import { commentFeedback, createFeedback, getFeedback, getFeedbackTimeline, listFeedbacks, McpFeedbackError, updateFeedback } from "@/features/mcp/server/feedback-service"
import { commentFeedbackSchema, createFeedbackSchema, feedbackIdSchema, listFeedbacksSchema, updateFeedbackSchema } from "@/features/mcp/server/feedback-schemas"
import type { OpexServerScope } from "../scope"
import { defineTool, OpexToolError } from "./define"

/**
 * Central de feedback: as mesmas regras do servidor MCP (`feedback-service`). Leitura pública;
 * criar e comentar exigem login; alterar um feedback, ser o autor ou administrador. O fluxo agêntico
 * (plano/implementação) fica fora do agente enquanto a integração Opex estiver "Em desenvolvimento".
 */

/** Contexto de autenticação do serviço de feedback a partir do usuário revalidado do turno. */
async function authOf(scope: OpexServerScope): Promise<McpAuthContext | null> {
    if (scope.kind !== "user") return null
    await dbConnect()
    const user = await User.findById(scope.actor.id).select("username name email").lean<{ username: string; name?: string; email: string }>()
    if (!user) return null
    return { userId: scope.actor.id, username: user.username, name: user.name ?? null, email: user.email, role: scope.actor.role }
}

async function requireAuth(scope: OpexServerScope): Promise<McpAuthContext> {
    const auth = await authOf(scope)
    if (!auth) throw new OpexToolError("Faça login para criar, editar ou comentar feedbacks.")
    return auth
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run()
    } catch (error) {
        if (error instanceof McpFeedbackError) throw new OpexToolError(error.message)
        throw error
    }
}

export const feedbackTools = [
    defineTool({
        name: "list_feedbacks",
        group: "feedback",
        label: "Listar feedbacks",
        risk: "read",
        description: "Feedbacks (bugs e melhorias) da central do DnDicas, com busca e filtros de status, prioridade e tipo.",
        input: listFeedbacksSchema,
        execute: async (input) => guard(() => listFeedbacks(input)),
    }),
    defineTool({
        name: "get_feedback",
        group: "feedback",
        label: "Ler feedback",
        risk: "read",
        description: "Um feedback da central por id.",
        input: feedbackIdSchema,
        execute: async (input, context) => guard(async () => getFeedback(input, await authOf(context.scope))),
    }),
    defineTool({
        name: "get_feedback_timeline",
        group: "feedback",
        label: "Histórico do feedback",
        risk: "read",
        description: "Linha do tempo de um feedback (comentários e mudanças de status).",
        input: feedbackIdSchema,
        execute: async (input, context) => guard(async () => getFeedbackTimeline(input, await authOf(context.scope))),
    }),
    defineTool({
        name: "create_feedback",
        group: "feedback",
        label: "Criar feedback",
        risk: "write",
        minRole: "user",
        description: "Registra um bug ou uma melhoria na central de feedback em nome do usuário logado.",
        input: createFeedbackSchema,
        summarize: (input) => `Criar o feedback "${input.title}"`,
        execute: async (input, context) => guard(async () => createFeedback(input, await requireAuth(context.scope))),
    }),
    defineTool({
        name: "update_feedback",
        group: "feedback",
        label: "Editar feedback",
        risk: "write",
        minRole: "user",
        description: "Altera título, descrição, tipo, status ou prioridade de um feedback (o autor ou um administrador).",
        input: updateFeedbackSchema,
        summarize: (input) => `Editar o feedback ${input.id}`,
        execute: async (input, context) => guard(async () => updateFeedback(input, await requireAuth(context.scope))),
    }),
    defineTool({
        name: "comment_feedback",
        group: "feedback",
        label: "Comentar feedback",
        risk: "write",
        minRole: "user",
        description: "Comenta um feedback em nome do usuário logado.",
        input: commentFeedbackSchema,
        summarize: (input) => `Comentar o feedback ${input.id}`,
        execute: async (input, context) => guard(async () => commentFeedback(input, await requireAuth(context.scope))),
    }),
]
