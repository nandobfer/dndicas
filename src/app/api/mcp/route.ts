import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { createDndicasMcpServer } from "@/features/mcp/server/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function handleMcpRequest(request: Request) {
    const server = createDndicasMcpServer()
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    })

    await server.connect(transport)
    return transport.handleRequest(request)
}

export async function GET(request: Request) {
    return handleMcpRequest(request)
}

export async function POST(request: Request) {
    return handleMcpRequest(request)
}

export async function DELETE(request: Request) {
    return handleMcpRequest(request)
}
