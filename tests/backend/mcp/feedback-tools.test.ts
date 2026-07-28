import { describe, expect, it, vi } from "vitest"
import { registerFeedbackTools } from "@/features/mcp/server/feedback-tools"
import { McpAuthError, type McpAuthAccess } from "@/features/mcp/server/mcp-auth-service"

type ToolHandler = (args: unknown) => Promise<{ structuredContent?: Record<string, unknown> }>

function fakeServer() {
    const handlers = new Map<string, ToolHandler>()
    return {
        server: {
            registerTool: (name: string, _config: unknown, handler: ToolHandler) => handlers.set(name, handler),
        },
        handlers,
    }
}

describe("MCP feedback tools", () => {
    it("requires admin token for agentic operations", async () => {
        const { server, handlers } = fakeServer()
        const auth: McpAuthAccess = {
            getOptionalAuthContext: vi.fn().mockResolvedValue(null),
            requireAuthContext: vi.fn().mockResolvedValue({ userId: "user-1", role: "user" }),
            requireAdminContext: vi.fn().mockRejectedValue(new McpAuthError("Você não tem permissão para executar esta ação.", "MCP_FORBIDDEN")),
        }

        registerFeedbackTools(server as never, auth)

        const result = await handlers.get("request_feedback_plan")?.({ id: "feedback-1", model: "model-a" })

        expect(result?.structuredContent).toMatchObject({
            error: "Você não tem permissão para executar esta ação.",
            code: "MCP_FORBIDDEN",
        })
    })

    it("requires a token for protected user operations", async () => {
        const { server, handlers } = fakeServer()
        const auth: McpAuthAccess = {
            getOptionalAuthContext: vi.fn().mockResolvedValue(null),
            requireAuthContext: vi.fn().mockRejectedValue(new McpAuthError("Token MCP obrigatório para esta operação.", "MCP_TOKEN_REQUIRED")),
            requireAdminContext: vi.fn(),
        }

        registerFeedbackTools(server as never, auth)

        const result = await handlers.get("comment_feedback")?.({ id: "feedback-1", message: "Comentário" })

        expect(result?.structuredContent).toMatchObject({
            error: "Token MCP obrigatório para esta operação.",
            code: "MCP_TOKEN_REQUIRED",
        })
    })
})
