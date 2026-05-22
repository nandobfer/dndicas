import { entityColors } from "@/lib/config/colors"
import { UnifiedEntity } from "@/core/utils/search-engine"

/**
 * @fileoverview Unified entity configuration and data providers.
 * Combines UI styles from entityColors and search endpoints from search-engine.
 */

export interface EntityProvider {
    name: keyof typeof entityColors
    label: string
    endpoint: () => string
    map: (item: any) => UnifiedEntity | UnifiedEntity[]
}

function createSubclassSearchId(parentClassId: string, subclassId: string) {
    return `subclass:${parentClassId}:${subclassId}`
}

export const ENTITY_PROVIDERS: EntityProvider[] = [
    {
        name: "Regra",
        label: "Regras",
        endpoint: () => `/api/rules`,
        map: (item: any): UnifiedEntity => ({
            id: item._id || item.id,
            _id: item._id,
            name: item.name,
            originalName: item.originalName,
            label: item.name,
            type: "Regra",
            description: item.description,
            source: item.source,
            status: item.status || "active",
        }),
    },
    {
        name: "Habilidade",
        label: "Habilidades",
        endpoint: () => `/api/traits/search`,
        map: (item: any): UnifiedEntity => ({
            id: item._id || item.id,
            _id: item._id,
            name: item.name,
            originalName: item.originalName,
            label: item.name,
            type: "Habilidade",
            description: item.description,
            source: item.source,
            status: item.status || "active",
        }),
    },
    {
        name: "Talento",
        label: "Talentos",
        endpoint: () => `/api/feats/search`,
        map: (item: any): UnifiedEntity => ({
            id: item.id || item._id,
            _id: item._id,
            name: item.label || item.name,
            originalName: item.originalName,
            label: item.label || item.name,
            type: "Talento",
            description: item.metadata?.description || item.description,
            source: item.source || item.metadata?.source,
            status: item.status || "active",
            metadata: item.metadata,
        }),
    },
    {
        name: "Magia",
        label: "Magias",
        endpoint: () => `/api/spells/search`,
        map: (item: any): UnifiedEntity => ({
            id: item.id || item._id,
            _id: item._id,
            name: item.label || item.name,
            originalName: item.originalName,
            label: item.label || item.name,
            type: "Magia",
            description: item.description,
            school: item.school,
            circle: item.circle,
            saveAttribute: item.saveAttribute,
            component: item.component, // Em SpellPreview o campo usado é 'component' (singular)
            baseDice: item.baseDice,
            extraDicePerLevel: item.extraDicePerLevel,
            source: item.source,
            status: item.status || "active",
        }),
    },
    {
        name: "Classe",
        label: "Classes",
        endpoint: () => `/api/classes/search`,
        map: (item: any): UnifiedEntity[] => {
            const classId = String(item.id || item._id)
            const classLabel = item.label || item.name
            const subclasses = Array.isArray(item.subclasses) ? item.subclasses : []

            return [
                {
                    id: classId,
                    _id: item._id ? String(item._id) : classId,
                    name: classLabel,
                    originalName: item.originalName,
                    label: classLabel,
                    type: "Classe",
                    description: item.description,
                    source: item.source,
                    status: item.status || "active",
                    metadata: {
                        subclasses,
                    },
                },
                ...subclasses.map((subclass: any) => {
                    const subclassId = String(subclass._id || subclass.name)
                    return {
                        id: createSubclassSearchId(classId, subclassId),
                        _id: createSubclassSearchId(classId, subclassId),
                        name: subclass.name,
                        originalName: subclass.originalName,
                        label: subclass.name,
                        type: "Subclasse" as const,
                        description: subclass.description,
                        source: subclass.source || item.source,
                        image: subclass.image,
                        status: item.status || "active",
                        metadata: {
                            parentClassId: classId,
                            parentClassName: classLabel,
                            subclassId,
                            subclassName: subclass.name,
                            subclassColor: subclass.color,
                        },
                    }
                }),
            ]
        },
    },
    {
        name: "Origem",
        label: "Origens",
        endpoint: () => `/api/backgrounds/search`,
        map: (item: any): UnifiedEntity => ({
            id: item.id || item._id,
            _id: item._id,
            name: item.label || item.name,
            originalName: item.originalName,
            label: item.label || item.name,
            type: "Origem",
            description: item.description,
            source: item.source,
            status: item.status || "active",
        }),
    },
    {
        name: "Raça",
        label: "Raças",
        endpoint: () => `/api/races`,
        map: (item: any): UnifiedEntity => ({
            id: item.id || item._id,
            _id: item._id,
            name: item.label || item.name,
            originalName: item.originalName,
            label: item.label || item.name,
            type: "Raça",
            description: item.description,
            source: item.source,
            status: item.status || "active",
        }),
    },
    {
        name: "Item",
        label: "Itens",
        endpoint: () => `/api/items/search`,
        map: (item: any): UnifiedEntity => ({
            id: item._id || item.id,
            _id: item._id,
            name: item.name,
            originalName: item.originalName,
            label: item.name,
            type: "Item",
            description: item.description,
            image: item.image,
            rarity: item.rarity,
            itemType: item.type,
            price: item.price,
            damageDice: item.damageDice,
            damageType: item.damageType,
            additionalDamage: item.additionalDamage,
            mastery: item.mastery,
            properties: item.properties,
            traits: item.traits,
            isMagic: item.isMagic,
            // Armor/Shield fields
            ac: item.ac,
            acType: item.acType,
            armorType: item.armorType,
            acBonus: item.acBonus,
            // Tool fields
            attributeUsed: item.attributeUsed,
            source: item.source,
            status: item.status || "active",
        }),
    },
]

export const entityConfig = ENTITY_PROVIDERS.reduce((acc, provider) => {
    acc[provider.name] = {
        name: provider.name,
        label: provider.label,
        ...entityColors[provider.name],
        provider
    }
    return acc
}, {} as Record<keyof typeof entityColors, (typeof entityColors)[keyof typeof entityColors] & { name: string; label: string; provider?: EntityProvider }>)
