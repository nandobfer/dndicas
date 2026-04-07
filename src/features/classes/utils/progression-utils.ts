/**
 * @fileoverview Pure utility functions for the Class Progression Table feature.
 * Includes proficiency bonus calculation, spell progression templates, and row builders.
 */

import type { ClassTrait } from "../types/classes.types"
import type { ClassProgressionData, SpellSlotsTable, SpellProgressionType } from "../types/progression.types"

// ─── Proficiency Bonus ────────────────────────────────────────────────────────

const PROFICIENCY_BONUS_BY_LEVEL: Record<number, number> = {
    1: 2, 2: 2, 3: 2, 4: 2,
    5: 3, 6: 3, 7: 3, 8: 3,
    9: 4, 10: 4, 11: 4, 12: 4,
    13: 5, 14: 5, 15: 5, 16: 5,
    17: 6, 18: 6, 19: 6, 20: 6,
}

export const getProficiencyBonus = (level: number): number =>
    PROFICIENCY_BONUS_BY_LEVEL[level] ?? 2

// ─── Spell Progression Templates ─────────────────────────────────────────────

/**
 * Standard Full Caster table (Wizard, Cleric, Druid, Bard, Sorcerer).
 * Source: D&D 5e PHB table.
 */
const FULL_CASTER_TABLE: SpellSlotsTable = {
    1:  { cantrips: 3, preparedSpells: 2,  slots: { 1: 2 } },
    2:  { cantrips: 3, preparedSpells: 3,  slots: { 1: 3 } },
    3:  { cantrips: 3, preparedSpells: 4,  slots: { 1: 4, 2: 2 } },
    4:  { cantrips: 4, preparedSpells: 5,  slots: { 1: 4, 2: 3 } },
    5:  { cantrips: 4, preparedSpells: 6,  slots: { 1: 4, 2: 3, 3: 2 } },
    6:  { cantrips: 4, preparedSpells: 7,  slots: { 1: 4, 2: 3, 3: 3 } },
    7:  { cantrips: 4, preparedSpells: 8,  slots: { 1: 4, 2: 3, 3: 3, 4: 1 } },
    8:  { cantrips: 4, preparedSpells: 9,  slots: { 1: 4, 2: 3, 3: 3, 4: 2 } },
    9:  { cantrips: 4, preparedSpells: 10, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 } },
    10: { cantrips: 5, preparedSpells: 11, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 } },
    11: { cantrips: 5, preparedSpells: 12, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 } },
    12: { cantrips: 5, preparedSpells: 12, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 } },
    13: { cantrips: 5, preparedSpells: 13, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 } },
    14: { cantrips: 5, preparedSpells: 13, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 } },
    15: { cantrips: 5, preparedSpells: 14, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 } },
    16: { cantrips: 5, preparedSpells: 14, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 } },
    17: { cantrips: 5, preparedSpells: 15, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 } },
    18: { cantrips: 5, preparedSpells: 15, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 } },
    19: { cantrips: 5, preparedSpells: 15, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 } },
    20: { cantrips: 5, preparedSpells: 15, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 } },
}

/**
 * Half Caster table (Paladin, Ranger).
 * Spell slots start at level 2, reach only 5th circle.
 */
const HALF_CASTER_TABLE: SpellSlotsTable = {
    2:  { preparedSpells: 2,  slots: { 1: 2 } },
    3:  { preparedSpells: 3,  slots: { 1: 3 } },
    4:  { preparedSpells: 3,  slots: { 1: 3 } },
    5:  { preparedSpells: 4,  slots: { 1: 4, 2: 2 } },
    6:  { preparedSpells: 4,  slots: { 1: 4, 2: 2 } },
    7:  { preparedSpells: 5,  slots: { 1: 4, 2: 3 } },
    8:  { preparedSpells: 5,  slots: { 1: 4, 2: 3 } },
    9:  { preparedSpells: 6,  slots: { 1: 4, 2: 3, 3: 2 } },
    10: { preparedSpells: 6,  slots: { 1: 4, 2: 3, 3: 2 } },
    11: { preparedSpells: 7,  slots: { 1: 4, 2: 3, 3: 3 } },
    12: { preparedSpells: 7,  slots: { 1: 4, 2: 3, 3: 3 } },
    13: { preparedSpells: 8,  slots: { 1: 4, 2: 3, 3: 3, 4: 1 } },
    14: { preparedSpells: 8,  slots: { 1: 4, 2: 3, 3: 3, 4: 1 } },
    15: { preparedSpells: 9,  slots: { 1: 4, 2: 3, 3: 3, 4: 2 } },
    16: { preparedSpells: 9,  slots: { 1: 4, 2: 3, 3: 3, 4: 2 } },
    17: { preparedSpells: 10, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 } },
    18: { preparedSpells: 10, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 } },
    19: { preparedSpells: 11, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 } },
    20: { preparedSpells: 11, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3 } },
}

/**
 * Third Caster table (Arcane Trickster Rogue, Eldritch Knight Fighter).
 * Spell slots start at level 3, reach only 4th circle.
 */
const THIRD_CASTER_TABLE: SpellSlotsTable = {
    3:  { cantrips: 2, preparedSpells: 3,  slots: { 1: 2 } },
    4:  { cantrips: 2, preparedSpells: 4,  slots: { 1: 3 } },
    7:  { cantrips: 2, preparedSpells: 5,  slots: { 1: 4, 2: 2 } },
    8:  { cantrips: 2, preparedSpells: 6,  slots: { 1: 4, 2: 2 } },
    10: { cantrips: 3, preparedSpells: 7,  slots: { 1: 4, 2: 3 } },
    11: { cantrips: 3, preparedSpells: 8,  slots: { 1: 4, 2: 3 } },
    13: { cantrips: 3, preparedSpells: 9,  slots: { 1: 4, 2: 3, 3: 2 } },
    14: { cantrips: 3, preparedSpells: 10, slots: { 1: 4, 2: 3, 3: 2 } },
    16: { cantrips: 3, preparedSpells: 11, slots: { 1: 4, 2: 3, 3: 3 } },
    17: { cantrips: 3, preparedSpells: 12, slots: { 1: 4, 2: 3, 3: 3 } },
    19: { cantrips: 3, preparedSpells: 13, slots: { 1: 4, 2: 3, 3: 3, 4: 1 } },
    20: { cantrips: 3, preparedSpells: 14, slots: { 1: 4, 2: 3, 3: 3, 4: 1 } },
}

/**
 * Warlock Pact Magic table (unique short-rest mechanic).
 * Only 1 slot at level 1-2, up to 4 slots by level 17+.
 */
const WARLOCK_TABLE: SpellSlotsTable = {
    1:  { cantrips: 2, preparedSpells: 2,  slots: { 1: 1 } },
    2:  { cantrips: 2, preparedSpells: 3,  slots: { 1: 2 } },
    3:  { cantrips: 2, preparedSpells: 4,  slots: { 2: 2 } },
    4:  { cantrips: 3, preparedSpells: 5,  slots: { 2: 2 } },
    5:  { cantrips: 3, preparedSpells: 6,  slots: { 3: 2 } },
    6:  { cantrips: 3, preparedSpells: 7,  slots: { 3: 2 } },
    7:  { cantrips: 3, preparedSpells: 8,  slots: { 4: 2 } },
    8:  { cantrips: 3, preparedSpells: 9,  slots: { 4: 2 } },
    9:  { cantrips: 3, preparedSpells: 10, slots: { 5: 2 } },
    10: { cantrips: 4, preparedSpells: 10, slots: { 5: 2 } },
    11: { cantrips: 4, preparedSpells: 11, slots: { 5: 3 } },
    12: { cantrips: 4, preparedSpells: 11, slots: { 5: 3 } },
    13: { cantrips: 4, preparedSpells: 12, slots: { 5: 3 } },
    14: { cantrips: 4, preparedSpells: 12, slots: { 5: 3 } },
    15: { cantrips: 4, preparedSpells: 13, slots: { 5: 3 } },
    16: { cantrips: 4, preparedSpells: 13, slots: { 5: 3 } },
    17: { cantrips: 4, preparedSpells: 14, slots: { 5: 4 } },
    18: { cantrips: 4, preparedSpells: 14, slots: { 5: 4 } },
    19: { cantrips: 4, preparedSpells: 15, slots: { 5: 4 } },
    20: { cantrips: 4, preparedSpells: 15, slots: { 5: 4 } },
}

/**
 * Artificer table (PHB variant half-caster, starts at level 1).
 */
const ARTIFICER_TABLE: SpellSlotsTable = {
    1:  { cantrips: 2, preparedSpells: 2,  slots: { 1: 2 } },
    2:  { cantrips: 2, preparedSpells: 2,  slots: { 1: 2 } },
    3:  { cantrips: 2, preparedSpells: 3,  slots: { 1: 3 } },
    4:  { cantrips: 2, preparedSpells: 3,  slots: { 1: 3 } },
    5:  { cantrips: 2, preparedSpells: 4,  slots: { 1: 4, 2: 2 } },
    6:  { cantrips: 2, preparedSpells: 4,  slots: { 1: 4, 2: 2 } },
    7:  { cantrips: 2, preparedSpells: 5,  slots: { 1: 4, 2: 3 } },
    8:  { cantrips: 2, preparedSpells: 5,  slots: { 1: 4, 2: 3 } },
    9:  { cantrips: 2, preparedSpells: 6,  slots: { 1: 4, 2: 3, 3: 2 } },
    10: { cantrips: 3, preparedSpells: 6,  slots: { 1: 4, 2: 3, 3: 2 } },
    11: { cantrips: 3, preparedSpells: 7,  slots: { 1: 4, 2: 3, 3: 3 } },
    12: { cantrips: 3, preparedSpells: 7,  slots: { 1: 4, 2: 3, 3: 3 } },
    13: { cantrips: 3, preparedSpells: 8,  slots: { 1: 4, 2: 3, 3: 3, 4: 1 } },
    14: { cantrips: 3, preparedSpells: 8,  slots: { 1: 4, 2: 3, 3: 3, 4: 1 } },
    15: { cantrips: 3, preparedSpells: 9,  slots: { 1: 4, 2: 3, 3: 3, 4: 2 } },
    16: { cantrips: 3, preparedSpells: 9,  slots: { 1: 4, 2: 3, 3: 3, 4: 2 } },
    17: { cantrips: 4, preparedSpells: 10, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 } },
    18: { cantrips: 4, preparedSpells: 10, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 } },
    19: { cantrips: 4, preparedSpells: 11, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 } },
    20: { cantrips: 4, preparedSpells: 11, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3 } },
}

export const SPELL_TEMPLATES: Record<SpellProgressionType, SpellSlotsTable> = {
    full: FULL_CASTER_TABLE,
    half: HALF_CASTER_TABLE,
    third: THIRD_CASTER_TABLE,
    warlock: WARLOCK_TABLE,
    artificer: ARTIFICER_TABLE,
}

export const SPELL_TEMPLATE_LABELS: Record<SpellProgressionType, string> = {
    full: "Conjurador Completo",
    half: "Meio Conjurador",
    third: "Terço Conjurador",
    warlock: "Warlock (Magia do Pacto)",
    artificer: "Artificer",
}

/**
 * Returns a deep copy of the spell slot table for the given template type.
 */
export const applySpellTemplate = (type: SpellProgressionType): SpellSlotsTable =>
    JSON.parse(JSON.stringify(SPELL_TEMPLATES[type])) as SpellSlotsTable

/**
 * Returns true if any spell slot data has been filled in.
 * Used to decide whether to confirm before applying a template.
 */
export const hasSpellSlotData = (progressionData?: ClassProgressionData): boolean => {
    if (!progressionData?.spellSlots) return false
    return Object.keys(progressionData.spellSlots).length > 0
}

// ─── Progression Row Builder ──────────────────────────────────────────────────

export interface SubclassRowData {
    traits: ClassTrait[]
    progressionData?: ClassProgressionData
    color: string
    name: string
}

export type ProgressionTableRow = {
    level: number
    proficiencyBonus: number
    traits: ClassTrait[]
    source: "class" | "subclass"
    subclassColor?: string
    subclassName?: string
    spellSlotData?: SpellSlotsTable[number]
    customValues?: Record<string, string | null>
    /** Populated in merge mode: subclasses whose data was folded into this class row */
    mergedSubclasses?: Array<{ color: string; name: string }>
}

/**
 * Builds a sorted array of rows for the progression table,
 * merging class data and optional subclass data.
 *
 * Always returns exactly 20 class rows (one per level 1–20),
 * plus additional subclass rows at levels where subclasses have data.
 *
 * When `options.mergeSubclassRows` is true (view mode), subclass data is folded
 * directly into the matching class row instead of creating extra rows.
 */
export const buildProgressionRows = (
    traits: ClassTrait[],
    progressionData?: ClassProgressionData,
    subclassRows?: SubclassRowData[],
    options?: { mergeSubclassRows?: boolean },
): {
    rows: ProgressionTableRow[]
    activeSpellCircles: Set<number>
    allCustomColumns: Array<{ id: string; label: string; subclassColor?: string }>
} => {
    const mergeMode = options?.mergeSubclassRows ?? false
    const rowMap = new Map<string, ProgressionTableRow>()

    // Always generate 20 class rows
    for (let level = 1; level <= 20; level++) {
        const levelTraits = traits.filter((t) => t.level === level)
        const spellSlotData = progressionData?.spellSlots?.[level]
        const customValues: Record<string, string | null> = {}
        progressionData?.customColumns?.forEach((col) => {
            customValues[col.id] = col.values[level - 1] ?? null
        })

        rowMap.set(`${level}-class`, {
            level,
            proficiencyBonus: getProficiencyBonus(level),
            traits: levelTraits,
            source: "class",
            spellSlotData,
            customValues: Object.keys(customValues).length > 0 ? customValues : undefined,
        })
    }

    if (mergeMode) {
        // Merge subclass data into the corresponding class rows instead of creating extra rows
        subclassRows?.forEach((sub) => {
            const subLevels = new Set<number>([
                ...sub.traits.map((t) => t.level),
                ...Object.keys(sub.progressionData?.spellSlots ?? {}).map(Number),
                // Also include levels from custom columns that have non-null values
                ...(sub.progressionData?.customColumns?.flatMap((col) =>
                    col.values
                        .map((v, i) => (v != null ? i + 1 : null))
                        .filter((l): l is number => l !== null),
                ) ?? []),
            ])

            for (const level of subLevels) {
                const classRowKey = `${level}-class`
                const classRow = rowMap.get(classRowKey)
                if (!classRow) continue

                const levelTraits = sub.traits.filter((t) => t.level === level)
                const subCustomValues: Record<string, string | null> = {}
                sub.progressionData?.customColumns?.forEach((col) => {
                    subCustomValues[col.id] = col.values[level - 1] ?? null
                })

                // Merge spell slot data: class values take precedence; subclass fills in gaps
                const subSpellSlotData = sub.progressionData?.spellSlots?.[level]
                const mergedSpellSlotData = subSpellSlotData
                    ? {
                          cantrips: classRow.spellSlotData?.cantrips ?? subSpellSlotData.cantrips,
                          preparedSpells:
                              classRow.spellSlotData?.preparedSpells ?? subSpellSlotData.preparedSpells,
                          slots: {
                              ...(subSpellSlotData.slots ?? {}),
                              ...(classRow.spellSlotData?.slots ?? {}),
                          },
                      }
                    : classRow.spellSlotData

                rowMap.set(classRowKey, {
                    ...classRow,
                    traits: [...classRow.traits, ...levelTraits],
                    customValues: { ...(classRow.customValues ?? {}), ...subCustomValues },
                    spellSlotData: mergedSpellSlotData,
                    mergedSubclasses: [
                        ...(classRow.mergedSubclasses ?? []),
                        { color: sub.color, name: sub.name },
                    ],
                })
            }
        })
    } else {
        // Add subclass rows only at levels where the subclass has traits or spell slots
        subclassRows?.forEach((sub) => {
            const subLevels = new Set<number>([
                ...sub.traits.map((t) => t.level),
                ...Object.keys(sub.progressionData?.spellSlots ?? {}).map(Number),
            ])

            for (const level of subLevels) {
                const key = `${level}-subclass-${sub.name}`
                if (rowMap.has(key)) continue

                const levelTraits = sub.traits.filter((t) => t.level === level)
                const spellSlotData = sub.progressionData?.spellSlots?.[level]
                const customValues: Record<string, string | null> = {}
                sub.progressionData?.customColumns?.forEach((col) => {
                    customValues[col.id] = col.values[level - 1] ?? null
                })

                rowMap.set(key, {
                    level,
                    proficiencyBonus: getProficiencyBonus(level),
                    traits: levelTraits,
                    source: "subclass",
                    subclassColor: sub.color,
                    subclassName: sub.name,
                    spellSlotData,
                    customValues: Object.keys(customValues).length > 0 ? customValues : undefined,
                })
            }
        })
    }

    // Collect active spell circles
    const activeSpellCircles = new Set<number>()
    rowMap.forEach((row) => {
        if (row.spellSlotData?.slots) {
            Object.entries(row.spellSlotData.slots).forEach(([circle, count]) => {
                if (count && count > 0) activeSpellCircles.add(Number(circle))
            })
        }
    })

    // Collect custom columns
    const allCustomColumns: Array<{ id: string; label: string; subclassColor?: string }> = []
    const seenColIds = new Set<string>()
    progressionData?.customColumns?.forEach((col) => {
        if (!seenColIds.has(col.id)) {
            seenColIds.add(col.id)
            allCustomColumns.push({ id: col.id, label: col.label })
        }
    })
    subclassRows?.forEach((sub) => {
        sub.progressionData?.customColumns?.forEach((col) => {
            if (!seenColIds.has(col.id)) {
                seenColIds.add(col.id)
                allCustomColumns.push({ id: col.id, label: col.label, subclassColor: sub.color })
            }
        })
    })

    // Sort: by level ASC, class before subclass at same level
    const rows = Array.from(rowMap.values()).sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level
        if (a.source === "class" && b.source !== "class") return -1
        if (a.source !== "class" && b.source === "class") return 1
        return (a.subclassName ?? "").localeCompare(b.subclassName ?? "")
    })

    return { rows, activeSpellCircles, allCustomColumns }
}

/** Creates an empty custom column with 20 null values */
export const createEmptyCustomColumn = (
    id: string,
    label: string,
): import("../types/progression.types").ProgressionCustomColumn => ({
    id,
    label,
    values: Array<string | null>(20).fill(null),
})
