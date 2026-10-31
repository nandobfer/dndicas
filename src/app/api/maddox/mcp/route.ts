import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { createMaddoxMcpServer } from "@/features/maddox/server/maddox-mcp"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * MCP do Maddox (Streamable HTTP, sem sessão): ferramentas do narrador para o OpenCode. Sem login: cada chamada é
 * autorizada pelo token de turno assinado da geração em andamento (ver `master-turn-token.ts`).
 */
async function handle(request: Request) {
    const server = createMaddoxMcpServer()
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    return transport.handleRequest(request)
}

export const GET = handle
export const POST = handle
export const DELETE = handle
