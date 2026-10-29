import { z } from "zod"
import { Types } from "mongoose"
import dbConnect from "@/core/database/db"
import { Reference } from "@/core/database/models/reference"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { BackgroundModel } from "@/features/backgrounds/models/background"
import { CharacterClass } from "@/features/classes/models/character-class"
import { Feat } from "@/features/feats/models/feat"
import { ItemModel } from "@/features/items/database/item"
import { MonsterModel } from "@/features/monsters/models/monster"
import { RaceModel } from "@/features/races/models/race"
import { Spell } from "@/features/spells/models/spell"
import { Trait } from "@/features/traits/database/trait"
import { catalogEntityTypes, catalogEntityTypeSchema, type CatalogEntityType } from "@/features/mcp/server/catalog-schemas"
import { getCatalogEntity, searchCatalogEntities } from "@/features/mcp/server/catalog-entity-service"
import { clipText } from "./json"
import { defineTool, OpexToolError } from "./define"

/**
 * Catálogo do DnDicas (magias, classes, subclasses, raças, origens, talentos, habilidades, itens,
 * monstros e regras): as mesmas consultas do servidor MCP, só entidades **ativas**. O grupo
 * "Catálogo (administração)" muda a situação (ativa/inativa) das entidades, só para administradores.
 */

const ENTITY_TYPES = catalogEntityTypes.join(", ")
const typesField = z.array(catalogEntityTypeSchema).max(10).optional().describe(`Tipos de entidade: ${ENTITY_TYPES}`)

/** Campos longos (descrições em HTML) cortados para não estourar o contexto do modelo. */
const ENTITY_TEXT_MAX = 12_000

function clipEntity(entity: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(entity).map(([key, value]) => [key, typeof value === "string" ? clipText(value, ENTITY_TEXT_MAX) : value]))
}

export const catalogTools = [
    defineTool({
        name: "search_catalog",
        group: "catalog",
        label: "Buscar no catálogo",
        risk: "read",
        description:
            "Busca entidades ativas do catálogo de D&D 5e do DnDicas pelo nome (ignora acentos), em todos os tipos ou nos escolhidos. Devolve id, nome, tipo, fonte e um resumo — use get_entity para ler a entidade completa.",
        input: z.object({
            query: z.string().trim().max(200).describe("Texto de busca (vazio lista as primeiras do escopo)"),
            types: typesField,
            circles: z.array(z.number().int().min(0).max(9)).optional().describe("Magias: círculos (0 = truque)"),
            itemTypes: z.array(z.string().trim().min(1)).optional().describe("Itens: tipos (ex.: arma, armadura)"),
            parentClassId: z.string().trim().min(1).optional().describe("Subclasses: id da classe"),
            limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (padrão 20)"),
            offset: z.number().int().min(0).optional(),
        }),
        execute: async (input) => {
            const result = await searchCatalogEntities({ ...input, limit: input.limit ?? 20, offset: input.offset ?? 0 })
            return {
                ...result,
                items: result.items.map((item) => ({ ...item, description: clipText(typeof item.description === "string" ? item.description : null, 400) })),
            }
        },
    }),
    defineTool({
        name: "get_entity",
        group: "catalog",
        label: "Ler entidade",
        risk: "read",
        description: "Entidade ativa completa do catálogo por tipo e id (de search_catalog). Subclasses usam o id `subclass:{classe}:{subclasse}`.",
        input: z.object({ type: catalogEntityTypeSchema.describe(`Tipo: ${ENTITY_TYPES}`), id: z.string().trim().min(1).describe("Id da entidade") }),
        execute: async (input) => {
            const entity = await getCatalogEntity(input)
            if (!entity) throw new OpexToolError(`${input.type} "${input.id}" não encontrada (ou inativa). Use search_catalog para achar o id.`)
            return clipEntity(entity)
        },
    }),
    defineTool({
        name: "list_catalog_entity_types",
        group: "catalog",
        label: "Tipos do catálogo",
        risk: "read",
        description: "Tipos de entidade do catálogo aceitos por search_catalog e get_entity.",
        input: z.object({}),
        execute: async () => ({ types: catalogEntityTypes }),
    }),
]

type StatusModel = {
    findById(id: string): { select(fields: string): { lean(): Promise<unknown> } }
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<unknown>
}

const STATUS_MODELS: Partial<Record<CatalogEntityType, StatusModel>> = {
    Regra: Reference as unknown as StatusModel,
    Habilidade: Trait as unknown as StatusModel,
    Talento: Feat as unknown as StatusModel,
    Raça: RaceModel as unknown as StatusModel,
    Classe: CharacterClass as unknown as StatusModel,
    Origem: BackgroundModel as unknown as StatusModel,
    Magia: Spell as unknown as StatusModel,
    Item: ItemModel as unknown as StatusModel,
    Monstro: MonsterModel as unknown as StatusModel,
}

const STATUS_TYPES = Object.keys(STATUS_MODELS) as [CatalogEntityType, ...CatalogEntityType[]]

export const catalogAdminTools = [
    defineTool({
        name: "set_catalog_entity_status",
        group: "catalog-admin",
        label: "Ativar/inativar entidade",
        risk: "write",
        confirmByDefault: true,
        minRole: "admin",
        description: "Ativa ou inativa uma entidade do catálogo (inativa some das buscas e páginas públicas). Subclasses mudam pela classe.",
        input: z.object({
            type: z.enum(STATUS_TYPES).describe("Tipo da entidade"),
            id: z.string().trim().regex(/^[a-f0-9]{24}$/i, "Id inválido").describe("Id da entidade"),
            status: z.enum(["active", "inactive"]),
        }),
        summarize: (input) => `${input.status === "active" ? "Ativar" : "Inativar"} ${input.type} ${input.id}`,
        execute: async (input, context) => {
            await dbConnect()
            const model = STATUS_MODELS[input.type]!
            const before = (await model.findById(input.id).select("name status").lean()) as { name?: string; status?: string } | null
            if (!before) throw new OpexToolError(`${input.type} "${input.id}" não encontrada.`)
            await model.updateOne({ _id: new Types.ObjectId(input.id) }, { $set: { status: input.status } })
            await recordAudit({
                userId: context.actorId,
                entidade: input.type,
                entidadeId: input.id,
                acao: AcaoAuditoria.ATUALIZAR,
                antes: { status: before.status ?? null },
                depois: { status: input.status, origem: "agente-opex" },
            })
            return { ok: true, type: input.type, id: input.id, name: before.name ?? null, status: input.status }
        },
    }),
]
