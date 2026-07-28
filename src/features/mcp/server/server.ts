import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { APP_VERSION } from "@/lib/config/version"
import { registerCatalogTools } from "./catalog-tools"
import { createMcpAuthAccess } from "./mcp-auth-service"
import { registerFeedbackTools } from "./feedback-tools"

export function createDndicasMcpServer(options?: { headers?: Headers }) {
    const server = new McpServer({
        name: "dndicas",
        version: APP_VERSION,
    })

    registerCatalogTools(server)
    registerFeedbackTools(server, createMcpAuthAccess(options?.headers ?? new Headers()))

    return server
}
