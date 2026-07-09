import type { GenAITool } from "@/core/ai/genai"
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

type ToolArgs = Record<string, unknown>
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

export function createEntityUnderstandingTools(): GenAITool[] {
    return [
        {
            declaration: {
                name: "searchCatalogEntities",
                description: "Busca entidades existentes no catálogo do DnDicas para citar ou relacionar com a conversa.",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Texto de busca." },
                        types: { type: "array", items: { type: "string" }, description: "Tipos de entidade desejados." },
                        limit: { type: "number", description: "Quantidade máxima de resultados." },
                    },
                    required: ["query"],
                },
            },
            execute: async (args: ToolArgs) => {
                const query = asString(args.query) ?? ""
                const limit = asLimit(args.limit)
                const types = asStringArray(args.types) as EntityType[] | undefined

                const results = await searchUnifiedEntities({
                    query,
                    limit,
                    offset: 0,
                    specificEntityTypes: types,
                })

                return results.map((item) => ({
                    id: item.id || item._id || "",
                    name: item.name,
                    label: item.label,
                    type: item.type,
                    description: item.description,
                    source: item.source,
                }))
            },
        },
        {
            declaration: {
                name: "getCatalogEntity",
                description: "Carrega uma entidade completa do catálogo do DnDicas por tipo e id.",
                parameters: {
                    type: "object",
                    properties: {
                        entityType: { type: "string", description: "Tipo da entidade." },
                        entityId: { type: "string", description: "ID da entidade." },
                    },
                    required: ["entityType", "entityId"],
                },
            },
            execute: async (args: ToolArgs) => {
                const entityType = asString(args.entityType)
                const entityId = asString(args.entityId)

                if (!entityType || !ENTITY_TYPES.has(entityType) || !entityId) {
                    return { found: false, error: "Tipo ou ID inválido." }
                }

                const entity = await getCatalogEntity(entityType as EntityLookupType, entityId)
                return {
                    found: Boolean(entity),
                    id: entityId,
                    type: entityType,
                    entity,
                }
            },
        },
    ]
}
