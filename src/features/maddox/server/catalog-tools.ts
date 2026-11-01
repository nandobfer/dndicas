import { z } from "zod"
import type { ToolSet } from "ai"
import { catalogEntityTypeSchema, catalogEntityTypes } from "@/features/mcp/server/catalog-schemas"
import { MADDOX_CATALOG_SEARCH_LIMIT_DEFAULT, MADDOX_CATALOG_SEARCH_LIMIT_MAX, MADDOX_CATALOG_SUMMARY_MAX, MADDOX_CATALOG_TEXT_MAX, MADDOX_CATALOG_TOOL_NAMES } from "../constants"

/**
 * Consulta ao catálogo do DnDicas (só leitura) para o Maddox entrevistador e narrador: o mesmo serviço do
 * `search_catalog` do Agente Opex e do MCP público (só entidades ativas). Sem contexto de campanha: os dados são
 * públicos. Os retornos são compactos (texto puro, cortado) para não inflar o contexto do modelo.
 */

export class MaddoxCatalogToolError extends Error {}

export interface MaddoxCatalogTool {
    name: string
    description: string
    input: z.ZodObject<z.ZodRawShape>
    readOnly: true
    execute: (input: never) => Promise<unknown>
}

let catalogService: Promise<typeof import("@/features/mcp/server/catalog-entity-service")> | null = null
const loadCatalogService = () => (catalogService ??= import("@/features/mcp/server/catalog-entity-service"))

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" }

/** HTML do catálogo em texto puro (tags e menções viram espaço; entidades comuns decodificadas). */
export function catalogPlainText(value: string): string {
    return value
        .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\s*\n\s*/g, "\n")
        .trim()
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/** Campos que não ajudam o modelo (ids internos, imagens, auditoria). */
const DROPPED_KEYS = new Set(["_id", "__v", "createdAt", "updatedAt", "image", "images", "imageUrl", "status", "slug", "createdBy", "updatedBy", "deletedAt"])
const MAX_DEPTH = 4
const MAX_ARRAY = 40

/** Entidade completa em forma compacta: textos sem HTML e cortados, listas limitadas, sem campos internos. */
export function compactCatalogEntity(entity: Record<string, unknown>): { entity: Record<string, unknown>; truncated: string[] } {
    const truncated: string[] = []
    const walk = (value: unknown, path: string, depth: number): unknown => {
        if (typeof value === "string") {
            const text = catalogPlainText(value)
            if (text.length > MADDOX_CATALOG_TEXT_MAX) truncated.push(path)
            return clip(text, MADDOX_CATALOG_TEXT_MAX)
        }
        if (value === null || typeof value !== "object") return value
        if (depth >= MAX_DEPTH) return undefined
        if (Array.isArray(value)) {
            if (value.length > MAX_ARRAY) truncated.push(path)
            return value.slice(0, MAX_ARRAY).map((item, index) => walk(item, `${path}[${index}]`, depth + 1))
        }
        const out: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            if (DROPPED_KEYS.has(key)) continue
            const next = walk(item, path ? `${path}.${key}` : key, depth + 1)
            if (next === undefined || next === "" || (Array.isArray(next) && next.length === 0)) continue
            out[key] = next
        }
        return out
    }
    return { entity: walk(entity, "", 0) as Record<string, unknown>, truncated }
}

const TYPES = catalogEntityTypes.join(", ")

export const MADDOX_CATALOG_TOOLS: readonly MaddoxCatalogTool[] = [
    {
        name: MADDOX_CATALOG_TOOL_NAMES.search,
        readOnly: true,
        description: `Busca entidades ativas do catálogo do DnDicas pelo nome (ignora acentos): ${TYPES}. Use ANTES de sugerir ou confirmar qualquer uma delas; o que não aparece aqui não existe no catálogo. Para listar todas as opções de um tipo, envie só \`tipos\` (ex.: { "tipos": ["Origem"] }). Devolve id, tipo, nome e um resumo; use ${MADDOX_CATALOG_TOOL_NAMES.get} para ler a entidade completa.`,
        input: z.object({
            consulta: z.string().max(200).optional().describe("Nome (ou parte) a buscar; vazio lista o tipo pedido"),
            tipos: z.array(catalogEntityTypeSchema).max(5).optional().describe(`Tipos: ${TYPES}`),
            limite: z.number().int().min(1).max(MADDOX_CATALOG_SEARCH_LIMIT_MAX).optional().describe(`Máximo de itens (padrão ${MADDOX_CATALOG_SEARCH_LIMIT_DEFAULT})`),
        }),
        execute: async (input: { consulta?: string; tipos?: (typeof catalogEntityTypes)[number][]; limite?: number }) => {
            const query = (input.consulta ?? "").trim()
            if (!query && !input.tipos?.length) throw new MaddoxCatalogToolError("Envie `consulta` (nome a buscar) ou `tipos` (para listar um tipo).")
            const { searchCatalogEntities } = await loadCatalogService()
            const result = await searchCatalogEntities({ query, types: input.tipos, limit: input.limite ?? MADDOX_CATALOG_SEARCH_LIMIT_DEFAULT, offset: 0 })
            return {
                itens: result.items.map((item) => ({
                    id: item.id,
                    tipo: item.type,
                    nome: item.name,
                    ...(item.originalName ? { nomeOriginal: item.originalName } : {}),
                    ...(item.source ? { fonte: item.source } : {}),
                    resumo: clip(catalogPlainText(String(item.description ?? "")).replace(/\s+/g, " "), MADDOX_CATALOG_SUMMARY_MAX),
                })),
                ...(result.items.length === 0 ? { nota: "Nada encontrado no catálogo: não cite isso como entidade do catálogo." } : {}),
            }
        },
    },
    {
        name: MADDOX_CATALOG_TOOL_NAMES.get,
        readOnly: true,
        description: `Entidade ativa completa do catálogo do DnDicas por tipo e id (de ${MADDOX_CATALOG_TOOL_NAMES.search}): por exemplo, os atributos sugeridos e as perícias de uma Origem, os traços de uma Raça, o dado de vida e as salvaguardas de uma Classe. Subclasses usam o id \`subclass:{classe}:{subclasse}\`.`,
        input: z.object({
            tipo: catalogEntityTypeSchema.describe(`Tipo: ${TYPES}`),
            id: z.string().trim().min(1).max(200).describe(`Id devolvido por ${MADDOX_CATALOG_TOOL_NAMES.search}`),
        }),
        execute: async (input: { tipo: (typeof catalogEntityTypes)[number]; id: string }) => {
            const { getCatalogEntity } = await loadCatalogService()
            const entity = await getCatalogEntity({ type: input.tipo, id: input.id })
            if (!entity) throw new MaddoxCatalogToolError(`${input.tipo} "${input.id}" não está no catálogo (ou está inativa). Use ${MADDOX_CATALOG_TOOL_NAMES.search} para achar o id.`)
            const { entity: compact, truncated } = compactCatalogEntity(entity as Record<string, unknown>)
            return { tipo: input.tipo, id: input.id, entidade: compact, ...(truncated.length ? { truncated, nota: "Textos longos foram cortados." } : {}) }
        },
    },
]

/** Executa uma ferramenta de catálogo validando a entrada; falha vira `MaddoxCatalogToolError` em pt-BR. */
export async function runCatalogTool(tool: MaddoxCatalogTool, rawInput: unknown): Promise<unknown> {
    const parsed = tool.input.safeParse(rawInput ?? {})
    if (!parsed.success) throw new MaddoxCatalogToolError(`Entrada inválida para ${tool.name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "entrada"}: ${issue.message}`).join("; ")}`)
    try {
        return await tool.execute(parsed.data as never)
    } catch (error) {
        if (error instanceof MaddoxCatalogToolError) throw error
        const { loggerFor } = await import("@/lib/logger")
        loggerFor({ module: "maddox", feature: "catalog-tools" }).warn({ tool: tool.name, err: error instanceof Error ? error.message : String(error) }, "[maddox] consulta ao catálogo falhou")
        throw new MaddoxCatalogToolError("Não foi possível consultar o catálogo agora. Siga sem a consulta e não cite entidades que não foram confirmadas.")
    }
}

/** Ferramentas de catálogo no formato da AI SDK (a SDK `ai` entra sob demanda). */
export async function buildCatalogAiTools(): Promise<ToolSet> {
    const { dynamicTool } = await import("ai")
    const tools: ToolSet = {}
    for (const def of MADDOX_CATALOG_TOOLS) {
        tools[def.name] = dynamicTool({ description: def.description, inputSchema: def.input, execute: async (input: unknown) => runCatalogTool(def, input) })
    }
    return tools
}
