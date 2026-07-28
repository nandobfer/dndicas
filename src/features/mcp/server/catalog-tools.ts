import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { catalogEntityTypes, getCatalogEntitySchema, searchCatalogEntitiesSchema } from "./catalog-schemas"
import { getCatalogEntity, searchCatalogEntities } from "./catalog-entity-service"

function jsonContent(data: Record<string, unknown>) {
    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent: data,
    }
}

export function registerCatalogTools(server: McpServer) {
    server.registerTool(
        "list_catalog_entity_types",
        {
            title: "Listar tipos de entidades do catálogo",
            description: "Lista os tipos de entidades públicas do catálogo disponíveis para consulta no Dungeons & Dicas.",
            annotations: {
                readOnlyHint: true,
                openWorldHint: false,
            },
        },
        async () => jsonContent({ types: catalogEntityTypes }),
    )

    server.registerTool(
        "search_catalog_entities",
        {
            title: "Buscar entidades públicas do catálogo",
            description: "Busca regras, habilidades, talentos, raças, classes, subclasses, origens, magias, itens e monstros públicos.",
            inputSchema: searchCatalogEntitiesSchema.shape,
            annotations: {
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        async (args) => jsonContent(await searchCatalogEntities(searchCatalogEntitiesSchema.parse(args))),
    )

    server.registerTool(
        "get_catalog_entity",
        {
            title: "Consultar entidade pública do catálogo",
            description: "Retorna o detalhe público de uma entidade ativa do catálogo pelo tipo e ID.",
            inputSchema: getCatalogEntitySchema.shape,
            annotations: {
                readOnlyHint: true,
                openWorldHint: true,
            },
        },
        async (args) => {
            const input = getCatalogEntitySchema.parse(args)
            const entity = await getCatalogEntity(input)

            if (!entity) {
                return jsonContent({ error: "Entidade não encontrada ou indisponível publicamente." })
            }

            return jsonContent({ entity })
        },
    )
}
