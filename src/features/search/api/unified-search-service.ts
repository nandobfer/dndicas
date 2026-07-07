import dbConnect from "@/core/database/db"
import { Reference } from "@/core/database/models/reference"
import { applyFuzzySearch, filterEntitiesByOptions, type UnifiedEntity, type UnifiedSearchOptions } from "@/core/utils/search-core"
import { BackgroundModel } from "@/features/backgrounds/models/background"
import { CharacterClass } from "@/features/classes/models/character-class"
import { Feat } from "@/features/feats/models/feat"
import { ItemModel } from "@/features/items/database/item"
import { MonsterModel } from "@/features/monsters/models/monster"
import { RaceModel } from "@/features/races/models/race"
import { Spell } from "@/features/spells/models/spell"
import { Trait } from "@/features/traits/database/trait"

type EntityRecord = Record<string, unknown>

export type UnifiedServerSearchParams = UnifiedSearchOptions & {
    query: string
    limit: number
    offset: number
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

function asString(value: unknown): string | undefined {
    if (typeof value === "string") return value
    if (value && typeof value === "object" && "toString" in value) return String(value)
    return undefined
}

function getId(item: EntityRecord): string {
    return asString(item._id) ?? asString(item.id) ?? ""
}

function normalizeLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT
    return Math.min(Math.floor(limit), MAX_LIMIT)
}

function hasSpecificSearchScope(params: UnifiedServerSearchParams): boolean {
    return Boolean(
        params.specificEntityType
        || params.specificEntityTypes?.length
        || params.itemTypes?.length
        || params.circles?.length
        || params.parentClassId
    )
}

function hasExplicitEntityType(params: UnifiedServerSearchParams): boolean {
    return Boolean(params.specificEntityType || params.specificEntityTypes?.length)
}

function applyEmptyQueryScope(items: UnifiedEntity[], params: UnifiedServerSearchParams): UnifiedEntity[] {
    if (hasExplicitEntityType(params)) return items

    const inferredTypes = new Set<UnifiedEntity["type"]>()
    if (params.itemTypes?.length) inferredTypes.add("Item")
    if (params.circles?.length) inferredTypes.add("Magia")
    if (params.parentClassId) inferredTypes.add("Subclasse")

    if (inferredTypes.size === 0) return items
    return items.filter((item) => inferredTypes.has(item.type))
}

function toEntityRecord(item: unknown): EntityRecord {
    return item as EntityRecord
}

function mapRule(item: EntityRecord): UnifiedEntity {
    const id = getId(item)
    return {
        id,
        _id: id,
        name: String(item.name ?? ""),
        originalName: asString(item.originalName),
        label: String(item.name ?? ""),
        type: "Regra",
        description: asString(item.description),
        source: asString(item.source),
        status: "active",
    }
}

function mapTrait(item: EntityRecord): UnifiedEntity {
    const id = getId(item)
    return {
        id,
        _id: id,
        name: String(item.name ?? ""),
        originalName: asString(item.originalName),
        label: String(item.name ?? ""),
        type: "Habilidade",
        description: asString(item.description),
        source: asString(item.source),
        status: "active",
    }
}

function mapFeat(item: EntityRecord): UnifiedEntity {
    const id = getId(item)
    return {
        id,
        _id: id,
        name: String(item.name ?? ""),
        originalName: asString(item.originalName),
        label: String(item.name ?? ""),
        type: "Talento",
        description: asString(item.description),
        source: asString(item.source),
        status: "active",
        metadata: { level: item.level },
    }
}

function mapSpell(item: EntityRecord): UnifiedEntity {
    const id = getId(item)
    return {
        id,
        _id: id,
        name: String(item.name ?? ""),
        originalName: asString(item.originalName),
        label: String(item.name ?? ""),
        type: "Magia",
        description: asString(item.description),
        source: asString(item.source),
        status: "active",
        school: asString(item.school),
        circle: typeof item.circle === "number" ? item.circle : undefined,
        saveAttribute: asString(item.saveAttribute),
        component: Array.isArray(item.component) ? item.component.map(String) : undefined,
        baseDice: item.baseDice,
        extraDicePerLevel: item.extraDicePerLevel,
    }
}

function mapClass(item: EntityRecord): UnifiedEntity[] {
    const classId = getId(item)
    const className = String(item.name ?? "")
    const subclasses = Array.isArray(item.subclasses) ? item.subclasses as EntityRecord[] : []

    return [
        {
            id: classId,
            _id: classId,
            name: className,
            originalName: asString(item.originalName),
            label: className,
            type: "Classe",
            description: asString(item.description),
            source: asString(item.source),
            status: "active",
        },
        ...subclasses.map((subclass) => {
            const subclassId = asString(subclass._id) ?? String(subclass.name ?? "")
            const id = `subclass:${classId}:${subclassId}`
            const subclassName = String(subclass.name ?? "")

            return {
                id,
                _id: id,
                name: subclassName,
                originalName: asString(subclass.originalName),
                label: subclassName,
                type: "Subclasse" as const,
                description: asString(subclass.description),
                source: asString(subclass.source) ?? asString(item.source),
                image: asString(subclass.image),
                status: "active" as const,
                metadata: {
                    parentClassId: classId,
                    parentClassName: className,
                    subclassId,
                    subclassName,
                    subclassColor: asString(subclass.color),
                },
            }
        }),
    ]
}

function mapBackground(item: EntityRecord): UnifiedEntity {
    const id = getId(item)
    return {
        id,
        _id: id,
        name: String(item.name ?? ""),
        originalName: asString(item.originalName),
        label: String(item.name ?? ""),
        type: "Origem",
        description: asString(item.description),
        source: asString(item.source),
        status: "active",
    }
}

function mapRace(item: EntityRecord): UnifiedEntity {
    const id = getId(item)
    return {
        id,
        _id: id,
        name: String(item.name ?? ""),
        originalName: asString(item.originalName),
        label: String(item.name ?? ""),
        type: "Raça",
        description: asString(item.description),
        source: asString(item.source),
        status: "active",
    }
}

function mapItem(item: EntityRecord): UnifiedEntity {
    const id = getId(item)
    return {
        id,
        _id: id,
        name: String(item.name ?? ""),
        originalName: asString(item.originalName),
        label: String(item.name ?? ""),
        type: "Item",
        description: asString(item.description),
        source: asString(item.source),
        status: "active",
        image: asString(item.image),
        rarity: asString(item.rarity),
        itemType: asString(item.type),
        price: asString(item.price),
        damageDice: item.damageDice,
        damageType: asString(item.damageType),
        ac: typeof item.ac === "number" ? item.ac : undefined,
        acType: asString(item.acType),
        armorType: asString(item.armorType),
        acBonus: typeof item.acBonus === "number" ? item.acBonus : undefined,
        attributeUsed: asString(item.attributeUsed),
        isMagic: typeof item.isMagic === "boolean" ? item.isMagic : undefined,
        traits: Array.isArray(item.traits) ? item.traits : undefined,
        properties: Array.isArray(item.properties) ? item.properties : undefined,
        additionalDamage: Array.isArray(item.additionalDamage) ? item.additionalDamage : undefined,
        mastery: asString(item.mastery),
    }
}

function mapMonster(item: EntityRecord): UnifiedEntity {
    const id = getId(item)
    return {
        id,
        _id: id,
        name: String(item.name ?? ""),
        originalName: asString(item.originalName),
        label: String(item.name ?? ""),
        type: "Monstro",
        description: asString(item.description),
        source: asString(item.source),
        status: "active",
        image: asString(item.image),
        metadata: {
            monsterType: item.type,
            size: item.size,
            challengeRating: item.challengeRating,
            armorClass: item.armorClass,
            hitPointsFormula: item.hitPointsFormula,
        },
    }
}

async function loadSearchEntities(): Promise<UnifiedEntity[]> {
    const [rules, traits, feats, spells, classes, backgrounds, races, items, monsters] = await Promise.all([
        Reference.find({ status: "active" }).select("_id name originalName source description").lean(),
        Trait.find({ status: "active" }).select("_id name originalName source description").lean(),
        Feat.find({ status: "active" }).select("_id name originalName level description source").lean(),
        Spell.find({ status: "active" }).select("_id name originalName circle school source description saveAttribute component baseDice extraDicePerLevel").lean(),
        CharacterClass.find({ status: "active" }).select("_id name originalName source description subclasses").lean(),
        BackgroundModel.find({ status: "active" }).select("_id name originalName source description").lean(),
        RaceModel.find({ status: "active" }).select("_id name originalName source description").lean(),
        ItemModel.find({ status: "active" }).select("_id name originalName source description image rarity type price damageDice damageType additionalDamage mastery properties traits isMagic ac acType armorType acBonus attributeUsed").lean(),
        MonsterModel.find({ status: "active" }).select("_id name originalName source description image type size challengeRating armorClass hitPointsFormula").lean(),
    ])

    return [
        ...rules.map((item) => mapRule(toEntityRecord(item))),
        ...traits.map((item) => mapTrait(toEntityRecord(item))),
        ...feats.map((item) => mapFeat(toEntityRecord(item))),
        ...spells.map((item) => mapSpell(toEntityRecord(item))),
        ...classes.flatMap((item) => mapClass(toEntityRecord(item))),
        ...backgrounds.map((item) => mapBackground(toEntityRecord(item))),
        ...races.map((item) => mapRace(toEntityRecord(item))),
        ...items.map((item) => mapItem(toEntityRecord(item))),
        ...monsters.map((item) => mapMonster(toEntityRecord(item))),
    ]
}

export async function searchUnifiedEntities(params: UnifiedServerSearchParams): Promise<UnifiedEntity[]> {
    const query = params.query.trim()
    if (!query && !hasSpecificSearchScope(params)) return []

    await dbConnect()

    const limit = normalizeLimit(params.limit)
    const offset = Math.max(0, Math.floor(params.offset || 0))
    const allEntities = await loadSearchEntities()
    const filteredEntities = filterEntitiesByOptions(allEntities, params)

    if (!query) {
        return applyEmptyQueryScope(filteredEntities, params).slice(offset, offset + limit)
    }

    return applyFuzzySearch(filteredEntities, query, limit, offset)
}
