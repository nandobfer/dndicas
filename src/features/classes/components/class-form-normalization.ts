import type { CreateClassSchema } from "../api/validation"
import type { AttributeType } from "../types/classes.types"
import type { CharacterClass, ClassTrait, WeaponProficiency } from "../types/classes.types"

type CharacterClassFormSource = Partial<Omit<CharacterClass, "subclasses" | "traits">> & {
    subclasses?: unknown
    traits?: unknown
}

type FormProgressionTable = NonNullable<CreateClassSchema["progressionTable"]>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null
const ATTRIBUTE_VALUES: AttributeType[] = ["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"]

const normalizeOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined

    const trimmedValue = value.trim()
    return trimmedValue ? trimmedValue : undefined
}

const normalizeAttributeType = (value: unknown): AttributeType | undefined => {
    if (typeof value !== "string") return undefined
    return ATTRIBUTE_VALUES.includes(value as AttributeType) ? (value as AttributeType) : undefined
}

const normalizeProgressionTable = (progressionTable: CharacterClassFormSource["progressionTable"]): CreateClassSchema["progressionTable"] => {
    if (!progressionTable) return undefined

    const spellSlotsEntries = Object.entries(progressionTable.spellSlots ?? {}).flatMap(([level, spellSlotData]) => {
        if (!spellSlotData || !isRecord(spellSlotData)) return []

        const cantrips = typeof spellSlotData.cantrips === "number" ? spellSlotData.cantrips : undefined
        const preparedSpells = typeof spellSlotData.preparedSpells === "number" ? spellSlotData.preparedSpells : undefined
        const slotsEntries = Object.entries((isRecord(spellSlotData.slots) ? spellSlotData.slots : {}) ?? {}).flatMap(([circle, value]) =>
            typeof value === "number" ? [[circle, value] as const] : []
        )
        const slots = slotsEntries.length > 0 ? Object.fromEntries(slotsEntries) : undefined

        if (cantrips === undefined && preparedSpells === undefined && !slots) return []

        return [[
            String(level),
            {
                ...(cantrips !== undefined ? { cantrips } : {}),
                ...(preparedSpells !== undefined ? { preparedSpells } : {}),
                ...(slots ? { slots } : {}),
            },
        ] as const]
    })

    const customColumns = (progressionTable.customColumns ?? []).flatMap((column) => {
        if (!column || typeof column.id !== "string" || typeof column.label !== "string" || !Array.isArray(column.values)) return []

        return [{
            id: column.id,
            label: column.label,
            values: column.values.map((value) => (typeof value === "string" || value === null ? value : null)),
        }]
    })

    const normalizedProgressionTable: FormProgressionTable = {}

    if (spellSlotsEntries.length > 0) {
        normalizedProgressionTable.spellSlots = Object.fromEntries(spellSlotsEntries)
    }

    if (customColumns.length > 0) {
        normalizedProgressionTable.customColumns = customColumns
    }

    return Object.keys(normalizedProgressionTable).length > 0 ? normalizedProgressionTable : undefined
}

export const normalizeClassTraitsForForm = (traits: unknown): ClassTrait[] => {
    if (!Array.isArray(traits)) return []

    return traits.flatMap((trait) => {
        if (!isRecord(trait)) return []
        const level = trait.level
        const descriptionValue = trait.description
        if (typeof level !== "number" || !Number.isInteger(level)) return []
        if (typeof descriptionValue !== "string") return []

        const description = descriptionValue.trim()
        if (!description) return []

        return [
            {
                _id: normalizeOptionalString(trait._id),
                level,
                description,
            },
        ]
    })
}

const normalizeSubclassForForm = (subclass: unknown): CreateClassSchema["subclasses"][number] | null => {
    if (!isRecord(subclass)) return null
    if (typeof subclass.name !== "string") return null

    const name = subclass.name.trim()
    if (!name) return null

    return {
        _id: normalizeOptionalString(subclass._id),
        name,
        source: normalizeOptionalString(subclass.source),
        image: normalizeOptionalString(subclass.image) ?? "",
        description: normalizeOptionalString(subclass.description),
        color: normalizeOptionalString(subclass.color),
        spellcasting: Boolean(subclass.spellcasting),
        spellcastingAttribute: normalizeAttributeType(subclass.spellcastingAttribute),
        spells: Array.isArray(subclass.spells) ? subclass.spells : [],
        traits: normalizeClassTraitsForForm(subclass.traits),
        progressionTable: isRecord(subclass.progressionTable) ? subclass.progressionTable : undefined,
    }
}

export const normalizeSubclassesForForm = (subclasses: unknown): CreateClassSchema["subclasses"] => {
    if (!Array.isArray(subclasses)) return []

    return subclasses.flatMap((subclass) => {
        const normalizedSubclass = normalizeSubclassForForm(subclass)
        return normalizedSubclass ? [normalizedSubclass] : []
    })
}

export const buildClassFormDefaults = (characterClass?: CharacterClassFormSource | null): CreateClassSchema => ({
    name: characterClass?.name ?? "",
    originalName: characterClass?.originalName ?? "",
    description: characterClass?.description ?? "",
    source: characterClass?.source ?? "",
    status: characterClass?.status ?? "active",
    hitDice: characterClass?.hitDice ?? "d8",
    primaryAttributes: characterClass?.primaryAttributes ?? [],
    savingThrows: characterClass?.savingThrows ?? [],
    armorProficiencies: characterClass?.armorProficiencies ?? [],
    weaponProficiencies: characterClass?.weaponProficiencies ?? (["Armas Simples"] as WeaponProficiency[]),
    skillCount: characterClass?.skillCount ?? 2,
    availableSkills: characterClass?.availableSkills ?? [],
    spellcasting: Boolean(characterClass?.spellcasting),
    spellcastingAttribute: characterClass?.spellcastingAttribute ?? undefined,
    spells: Array.isArray(characterClass?.spells) ? characterClass.spells : [],
    subclasses: normalizeSubclassesForForm(characterClass?.subclasses),
    traits: normalizeClassTraitsForForm(characterClass?.traits),
    image: characterClass?.image ?? "",
    progressionTable: normalizeProgressionTable(characterClass?.progressionTable),
})
