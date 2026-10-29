import { tool, type ToolSet } from "ai"
import { z } from "zod"
import dbConnect from "@/core/database/db"
import { Reference } from "@/core/database/models/reference"
import { searchUnifiedEntities } from "@/features/search/api/unified-search-service"
import { BackgroundModel } from "@/features/backgrounds/models/background"
import { CharacterClass } from "@/features/classes/models/character-class"
import { Feat } from "@/features/feats/models/feat"
import { ItemModel } from "@/features/items/database/item"
import { MonsterModel } from "@/features/monsters/models/monster"
import { UserNpcModel } from "@/features/monsters/models/user-npc"
import { RaceModel } from "@/features/races/models/race"
import { Spell } from "@/features/spells/models/spell"
import { Trait } from "@/features/traits/database/trait"
import type { EntityType } from "@/lib/config/colors"

type EntityLookupType = EntityType | "NPC"

const ENTITY_TYPES = new Set<string>([
    "Regra",
    "Habilidade",
    "Talento",
    "Magia",
    "Classe",
    "Subclasse",
    "Origem",
    "Raça",
    "Item",
    "Monstro",
    "NPC",
])

const asString = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined

const asStringArray = (value: unknown): string[] | undefined => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && ENTITY_TYPES.has(item))
    : undefined

const asLimit = (value: unknown): number => {
    const parsed = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(parsed)) return 8
    return Math.max(1, Math.min(Math.floor(parsed), 12))
}

async function getCatalogEntity(entityType: EntityLookupType, entityId: string): Promise<unknown> {
    await dbConnect()

    if (entityType === "Regra") return Reference.findById(entityId).lean()
    if (entityType === "Habilidade") return Trait.findById(entityId).lean()
    if (entityType === "Talento") return Feat.findById(entityId).lean()
    if (entityType === "Magia") return Spell.findById(entityId).lean()
    if (entityType === "Classe") return CharacterClass.findById(entityId).lean()
    if (entityType === "Origem") return BackgroundModel.findById(entityId).lean()
    if (entityType === "Raça") return RaceModel.findById(entityId).lean()
    if (entityType === "Item") return ItemModel.findById(entityId).lean()
    if (entityType === "Monstro") return MonsterModel.findById(entityId).lean()
    if (entityType === "NPC") return UserNpcModel.findById(entityId).lean()

    if (entityType === "Subclasse") {
        const match = /^subclass:([^:]+):(.+)$/.exec(entityId)
        if (!match) return null

        const parentClass = await CharacterClass.findById(match[1]).lean()
        const parentRecord = parentClass as { subclasses?: Array<Record<string, unknown>> } | null
        const subclass = parentRecord?.subclasses?.find((item) => String(item._id || item.name) === match[2]) ?? null

        return subclass ? { parentClass, subclass } : null
    }

    return null
}

export interface CatalogSearchInput {
    query: string
    types?: string[]
    limit?: number
}

export interface CatalogSearchResult {
    id: string
    name: string
    label: string | undefined
    type: string
    description: string | undefined
    source: string | undefined
}

/** Busca unificada no catálogo (mesma busca do app), com tipos filtrados pelos conhecidos. */
export async function searchCatalogEntities(input: CatalogSearchInput): Promise<CatalogSearchResult[]> {
    const types = asStringArray(input.types) as EntityType[] | undefined
    const results = await searchUnifiedEntities({
        query: input.query.trim(),
        limit: asLimit(input.limit),
        offset: 0,
        specificEntityTypes: types && types.length > 0 ? types : undefined,
    })
    return results.map((item) => ({
        id: item.id || item._id || "",
        name: item.name,
        label: item.label,
        type: item.type,
        description: item.description,
        source: item.source,
    }))
}

/** Entidade completa por tipo e id; tipo ou id inválido devolvem `found: false` com o motivo. */
export async function loadCatalogEntity(entityType: string, entityId: string): Promise<{ found: boolean; id: string; type: string; entity?: unknown; error?: string }> {
    const type = asString(entityType)
    const id = asString(entityId)
    if (!type || !ENTITY_TYPES.has(type) || !id) return { found: false, id: entityId, type: entityType, error: "Tipo ou ID inválido." }
    const entity = await getCatalogEntity(type as EntityLookupType, id)
    return { found: Boolean(entity), id, type, entity }
}

export const CATALOG_ENTITY_TYPES = [...ENTITY_TYPES]

/** Ferramentas do chat "Entender com IA" no formato da Vercel AI SDK. */
export function createEntityUnderstandingTools(): ToolSet {
    return {
        searchCatalogEntities: tool({
            description: "Busca entidades existentes no catálogo do DnDicas para citar ou relacionar com a conversa.",
            inputSchema: z.object({
                query: z.string().describe("Texto de busca."),
                types: z.array(z.string()).optional().describe(`Tipos de entidade desejados: ${CATALOG_ENTITY_TYPES.join(", ")}.`),
                limit: z.number().optional().describe("Quantidade máxima de resultados (até 12)."),
            }),
            execute: async (input) => searchCatalogEntities(input),
        }),
        getCatalogEntity: tool({
            description: "Carrega uma entidade completa do catálogo do DnDicas por tipo e id.",
            inputSchema: z.object({
                entityType: z.string().describe(`Tipo da entidade: ${CATALOG_ENTITY_TYPES.join(", ")}.`),
                entityId: z.string().describe("ID da entidade."),
            }),
            execute: async (input) => loadCatalogEntity(input.entityType, input.entityId),
        }),
    }
}
