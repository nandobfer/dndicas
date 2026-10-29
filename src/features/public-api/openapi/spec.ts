import { BASE_PATH } from "@/lib/base-path"
import { MCP_ENDPOINT_PATH } from "@/lib/public-api/paths"
import { APP_VERSION } from "@/lib/config/version"

/**
 * Especificação OpenAPI 3.1 da API dndicas: as rotas públicas de leitura do catálogo (sem login),
 * a busca unificada, o health check e o servidor MCP. É a documentação gerenciada da integração
 * "API dndicas" (Integrações) e alimenta o explorador e o Swagger UI (`/api/docs`).
 *
 * REGRA: rota pública de leitura nova (ou parâmetro novo de uma documentada) entra aqui no mesmo
 * commit. Rotas autenticadas por sessão (fichas, administração, integrações) ficam de fora.
 */

type JsonObject = Record<string, unknown>

const jsonContent = (schema: JsonObject) => ({ "application/json": { schema } })

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

const queryParam = (name: string, description: string, schema: JsonObject = { type: "string" }) => ({
    name,
    in: "query",
    required: false,
    description,
    schema,
})

const PAGE = queryParam("page", "Página (1 em diante)", { type: "integer", minimum: 1, default: 1 })
const LIMIT = queryParam("limit", "Itens por página", { type: "integer", minimum: 1, maximum: 100, default: 10 })
const SEARCH = queryParam("search", "Texto de busca (nome, ignorando acentos)")
const SOURCES = queryParam("sources", "Fontes separadas por vírgula (ex.: LDJ2024,PHB)")
const STATUS = queryParam("status", "Situação do registro: active, inactive ou all", { type: "string", enum: ["active", "inactive", "all"] })

interface CatalogEntityDoc {
    /** Segmento da rota (`/api/<segmento>`). */
    path: string
    tag: string
    /** Nome no plural para os textos. */
    plural: string
    singular: string
    extraQuery?: JsonObject[]
    /** Possui `GET /api/<segmento>/search` (autocomplete leve). */
    hasSearchRoute?: boolean
}

const CATALOG: readonly CatalogEntityDoc[] = [
    {
        path: "spells",
        tag: "Magias",
        plural: "magias",
        singular: "magia",
        hasSearchRoute: true,
        extraQuery: [
            queryParam("circles", "Círculos separados por vírgula (0 = truque)"),
            queryParam("schools", "Escolas separadas por vírgula"),
            queryParam("saveAttributes", "Atributos de resistência separados por vírgula"),
            queryParam("diceTypes", "Tipos de dado separados por vírgula"),
        ],
    },
    { path: "classes", tag: "Classes", plural: "classes", singular: "classe", hasSearchRoute: true, extraQuery: [queryParam("hitDice", "Dado de vida (ex.: d8)")] },
    { path: "races", tag: "Raças", plural: "raças (espécies)", singular: "raça" },
    {
        path: "feats",
        tag: "Talentos",
        plural: "talentos",
        singular: "talento",
        hasSearchRoute: true,
        extraQuery: [
            queryParam("level", "Nível mínimo", { type: "integer" }),
            queryParam("levelMax", "Nível máximo", { type: "integer" }),
            queryParam("attributes", "Atributos separados por vírgula"),
            queryParam("searchField", "Campo da busca (name ou description)"),
        ],
    },
    { path: "traits", tag: "Habilidades", plural: "habilidades", singular: "habilidade", hasSearchRoute: true },
    {
        path: "items",
        tag: "Itens",
        plural: "itens",
        singular: "item",
        hasSearchRoute: true,
        extraQuery: [queryParam("type", "Tipo do item"), queryParam("rarity", "Raridade")],
    },
    {
        path: "monsters",
        tag: "Monstros",
        plural: "monstros",
        singular: "monstro",
        hasSearchRoute: true,
        extraQuery: [queryParam("type", "Tipo da criatura"), queryParam("size", "Tamanho"), queryParam("challengeRating", "Nível de desafio")],
    },
    { path: "backgrounds", tag: "Antecedentes", plural: "antecedentes", singular: "antecedente", hasSearchRoute: true },
    { path: "rules", tag: "Regras", plural: "regras", singular: "regra", extraQuery: [queryParam("searchField", "Campo da busca (name ou description)")] },
]

const NOT_FOUND = { description: "Não encontrado", content: jsonContent(ref("ApiError")) }
const SERVER_ERROR = { description: "Erro interno", content: jsonContent(ref("ApiError")) }

function catalogPaths(doc: CatalogEntityDoc): Record<string, JsonObject> {
    const base = `/api/${doc.path}`
    const paths: Record<string, JsonObject> = {
        [base]: {
            get: {
                tags: [doc.tag],
                operationId: `list_${doc.path}`,
                summary: `Lista ${doc.plural}`,
                description: `Lista paginada de ${doc.plural} do catálogo, com filtros. Pública (sem login).`,
                parameters: [PAGE, LIMIT, SEARCH, SOURCES, STATUS, ...(doc.extraQuery ?? [])],
                responses: {
                    200: { description: `Página de ${doc.plural}`, content: jsonContent(ref("PaginatedList")) },
                    500: SERVER_ERROR,
                },
            },
        },
        [`${base}/{id}`]: {
            get: {
                tags: [doc.tag],
                operationId: `get_${doc.path}`,
                summary: `Detalhe de ${doc.singular === "item" ? "um item" : `uma ${doc.singular}`}`,
                parameters: [{ name: "id", in: "path", required: true, description: "ID do registro (ObjectId)", schema: { type: "string" } }],
                responses: {
                    200: { description: "Registro completo", content: jsonContent({ type: "object", additionalProperties: true }) },
                    404: NOT_FOUND,
                    500: SERVER_ERROR,
                },
            },
        },
    }
    if (doc.hasSearchRoute) {
        paths[`${base}/search`] = {
            get: {
                tags: [doc.tag],
                operationId: `search_${doc.path}`,
                summary: `Busca rápida de ${doc.plural}`,
                description: "Autocomplete leve (nome, id e campos essenciais).",
                parameters: [queryParam("q", "Texto de busca"), queryParam("limit", "Máximo de resultados", { type: "integer", default: 10 })],
                responses: { 200: { description: "Resultados", content: jsonContent({ type: "array", items: { type: "object", additionalProperties: true } }) } },
            },
        }
    }
    return paths
}

/** Especificação OpenAPI 3.1 da API dndicas (JSON). */
export function buildPublicApiSpec(): JsonObject {
    const paths: Record<string, JsonObject> = {
        "/api/core/health": {
            get: {
                tags: ["Sistema"],
                operationId: "health",
                summary: "Health check",
                description: "Confere a aplicação e a conexão com o banco de dados.",
                responses: {
                    200: {
                        description: "Sistema funcionando",
                        content: jsonContent({
                            type: "object",
                            properties: {
                                success: { type: "boolean" },
                                data: { type: "object", properties: { status: { type: "string" }, timestamp: { type: "string" }, database: { type: "string" } } },
                            },
                        }),
                    },
                    500: SERVER_ERROR,
                },
            },
        },
        "/api/search": {
            get: {
                tags: ["Busca"],
                operationId: "unified_search",
                summary: "Busca unificada no catálogo",
                description: "Busca em todas as entidades do catálogo (magias, classes, itens, monstros, regras...).",
                parameters: [queryParam("q", "Texto de busca"), queryParam("limit", "Máximo de resultados", { type: "integer" })],
                responses: { 200: { description: "Resultados agrupados", content: jsonContent({ type: "object", additionalProperties: true }) }, 500: SERVER_ERROR },
            },
        },
        "/api/sources": {
            get: {
                tags: ["Fontes"],
                operationId: "list_sources",
                summary: "Fontes (livros) cadastradas",
                parameters: [queryParam("entity", "Restringe às fontes usadas por uma entidade (ex.: spells)")],
                responses: { 200: { description: "Fontes", content: jsonContent({ type: "object", additionalProperties: true }) } },
            },
        },
        [MCP_ENDPOINT_PATH]: {
            post: {
                tags: ["MCP"],
                operationId: "mcp",
                summary: "Servidor MCP (Streamable HTTP, JSON-RPC 2.0)",
                description:
                    "Servidor Model Context Protocol do DnDicas. Leituras do catálogo e da central de feedback são públicas; criar/atualizar/comentar feedback exige `Authorization: Bearer dndicas_mcp_...` (token gerado em Perfil).",
                security: [{}, { mcpToken: [] }],
                requestBody: {
                    required: true,
                    content: jsonContent({
                        type: "object",
                        required: ["jsonrpc", "method"],
                        properties: { jsonrpc: { const: "2.0" }, id: { type: ["integer", "string"] }, method: { type: "string" }, params: { type: "object" } },
                    }),
                },
                responses: { 200: { description: "Resposta JSON-RPC (JSON ou text/event-stream)" } },
            },
        },
    }
    for (const doc of CATALOG) Object.assign(paths, catalogPaths(doc))

    return {
        openapi: "3.1.0",
        info: {
            title: "API dndicas",
            version: APP_VERSION.replace(/^v/, ""),
            description: "API pública de leitura do catálogo de D&D 5e do DnDicas (pt-BR) e servidor MCP.",
        },
        servers: [{ url: BASE_PATH || "/" }],
        tags: [
            { name: "Sistema" },
            { name: "Busca" },
            { name: "Fontes" },
            ...CATALOG.map((doc) => ({ name: doc.tag })),
            { name: "MCP" },
        ],
        paths,
        components: {
            securitySchemes: { mcpToken: { type: "http", scheme: "bearer", description: "Token MCP permanente (dndicas_mcp_...)" } },
            schemas: {
                ApiError: {
                    type: "object",
                    properties: { success: { const: false }, error: { type: "string" }, code: { type: "string" } },
                },
                PaginatedList: {
                    type: "object",
                    description: "A lista vem na chave do próprio recurso (ex.: `spells`, `classes`, `items`), junto da paginação.",
                    properties: {
                        total: { type: "integer" },
                        page: { type: "integer" },
                        limit: { type: "integer" },
                    },
                    additionalProperties: true,
                },
            },
        },
    }
}
