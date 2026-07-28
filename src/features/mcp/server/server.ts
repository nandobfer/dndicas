import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { APP_VERSION } from "@/lib/config/version"
import { registerCatalogTools } from "./catalog-tools"

export function createDndicasMcpServer() {
    const server = new McpServer({
        name: "dndicas",
        version: APP_VERSION,
    })

    registerCatalogTools(server)

    return server
}
