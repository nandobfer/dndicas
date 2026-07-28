import dbConnect from "@/core/database/db"
import { Reference } from "@/core/database/models/reference"
import { searchUnifiedEntities } from "@/features/search/api/unified-search-service"
import { BackgroundModel } from "@/features/backgrounds/models/background"
import { CharacterClass } from "@/features/classes/models/character-class"
import { Feat } from "@/features/feats/models/feat"
import { ItemModel } from "@/features/items/database/item"
import { MonsterModel } from "@/features/monsters/models/monster"
import { RaceModel } from "@/features/races/models/race"
import { Spell } from "@/features/spells/models/spell"
import { Trait } from "@/features/traits/database/trait"
import type { EntityType } from "@/lib/config/colors"
import type { UnifiedEntity } from "@/core/utils/search-core"
import type { CatalogEntityType, GetCatalogEntityInput, SearchCatalogEntitiesInput } from "./catalog-schemas"

type PlainRecord = Record<string, unknown>
type QueryableModel = {
    findOne(query: Record<string, unknown>): { lean(): Promise<unknown> }
}

const modelByType: Partial<Record<CatalogEntityType, QueryableModel>> = {
    Regra: Reference,
    Habilidade: Trait,
    Talento: Feat,
    Raça: RaceModel,
    Classe: CharacterClass,
    Origem: BackgroundModel,
    Magia: Spell,
    Item: ItemModel,
    Monstro: MonsterModel,
}

function normalizeLimit(limit: number) {
    return Math.min(Math.max(Math.floor(limit), 1), 50)
}

function isPlainRecord(value: unknown): value is PlainRecord {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function stringifySpecialValue(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString()
    if (isPlainRecord(value) && typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
        const stringValue = value.toString()
        if (stringValue !== "[object Object]") return stringValue
    }
    return value
}

function serializeValue(value: unknown): unknown {
    const specialValue = stringifySpecialValue(value)
    if (specialValue !== value) return specialValue

    if (Array.isArray(value)) return value.map((item) => serializeValue(item))
    if (!isPlainRecord(value)) return value

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => key !== "__v")
            .map(([key, item]) => [key, serializeValue(item)]),
    )
}

function serializeEntity(entity: unknown): PlainRecord | null {
    if (!isPlainRecord(entity)) return null
    const serialized = serializeValue(entity) as PlainRecord
    const id = typeof serialized._id === "string" ? serialized._id : typeof serialized.id === "string" ? serialized.id : undefined

    return {
        ...serialized,
        ...(id ? { id, _id: id } : {}),
    }
}

function normalizeSearchResult(item: UnifiedEntity) {
    return {
        id: item.id,
        _id: item._id ?? item.id,
        name: item.name,
        originalName: item.originalName,
        label: item.label,
        type: item.type,
        description: item.description,
        source: item.source,
        status: item.status,
        metadata: item.metadata,
        school: item.school,
        circle: item.circle,
        rarity: item.rarity,
        itemType: item.itemType,
        image: item.image,
    }
}

function buildSearchEntityOptions(input: SearchCatalogEntitiesInput) {
    const types = input.types?.length ? input.types : undefined
    return {
        query: input.query,
        limit: normalizeLimit(input.limit),
        offset: input.offset,
        specificEntityType: types?.length === 1 ? types[0] as EntityType : undefined,
        specificEntityTypes: types && types.length > 1 ? types as EntityType[] : undefined,
        itemTypes: input.itemTypes,
        circles: input.circles,
        parentClassId: input.parentClassId,
    }
}

function parseSubclassId(id: string) {
    const [prefix, classId, subclassId, extra] = id.split(":")
    if (prefix === "subclass" && classId && subclassId && !extra) {
        return { classId, subclassId }
    }
    return null
}

function getRecordId(record: PlainRecord) {
    const id = record._id ?? record.id ?? record.name
    return typeof id === "string" ? id : id && typeof id === "object" && "toString" in id ? String(id) : undefined
}

async function getActiveSubclassById(id: string) {
    const parsed = parseSubclassId(id)
    const classes = await CharacterClass.find({ status: "active" }).select("_id name originalName source subclasses").lean()

    for (const characterClass of classes as PlainRecord[]) {
        const classId = getRecordId(characterClass)
        if (parsed && classId !== parsed.classId) continue

        const subclasses = Array.isArray(characterClass.subclasses) ? characterClass.subclasses : []
        for (const subclass of subclasses) {
            if (!isPlainRecord(subclass)) continue
            const subclassId = getRecordId(subclass)
            const generatedId = `subclass:${classId}:${subclassId}`
            const matchesParsed = parsed && subclassId === parsed.subclassId
            const matchesDirect = subclassId === id || generatedId === id
            if (!matchesParsed && !matchesDirect) continue

            return serializeEntity({
                ...subclass,
                id: generatedId,
                _id: generatedId,
                type: "Subclasse",
                status: "active",
                source: subclass.source ?? characterClass.source,
                metadata: {
                    parentClassId: classId,
                    parentClassName: characterClass.name,
                    subclassId,
                    subclassName: subclass.name,
                    subclassColor: subclass.color,
                },
            })
        }
    }

    return null
}

export async function searchCatalogEntities(input: SearchCatalogEntitiesInput) {
    const options = buildSearchEntityOptions(input)
    const items = await searchUnifiedEntities(options)

    return {
        items: items.map((item) => normalizeSearchResult(item)),
        limit: options.limit,
        offset: options.offset,
    }
}

export async function getCatalogEntity(input: GetCatalogEntityInput) {
    await dbConnect()

    if (input.type === "Subclasse") {
        return getActiveSubclassById(input.id)
    }

    const model = modelByType[input.type]
    if (!model) return null

    try {
        const entity = await model.findOne({ _id: input.id, status: "active" }).lean()
        return serializeEntity(entity)
    } catch (error) {
        if (error instanceof Error && error.name === "CastError") return null
        throw error
    }
}
