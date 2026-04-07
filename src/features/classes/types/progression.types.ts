/**
 * @fileoverview Types for the Class Progression Table feature.
 * Defines the data model for storing spell slot progression and custom columns.
 */

/**
 * Spell progression data for a single class level.
 * Keys are spell circle numbers (1–9). Omit a key to show an empty cell.
 */
export interface SpellSlotsLevelData {
    /** Known cantrips at this class level */
    cantrips?: number
    /** Prepared / known spells at this class level */
    preparedSpells?: number
    /** Spell slots per spell circle. Omit circles that have 0 slots. */
    slots?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, number>>
}

/**
 * Full 20-level spell slot table. Keys are class levels (1–20).
 * Missing keys mean no spell progression at that level.
 */
export type SpellSlotsTable = Partial<Record<number, SpellSlotsLevelData>>

/**
 * A manually-defined progression column (e.g., "Ataque Furtivo").
 * Stores 20 values — one per class level. `null` means no value (empty cell).
 */
export interface ProgressionCustomColumn {
    id: string
    label: string
    /** 20 entries (index 0 = level 1). null renders as empty cell. */
    values: Array<string | null>
}

/**
 * Root progression data stored on CharacterClass and Subclass.
 * The auto-derived columns (level, proficiency bonus, traits) are NOT stored here.
 */
export interface ClassProgressionData {
    spellSlots?: SpellSlotsTable
    customColumns?: ProgressionCustomColumn[]
}

/**
 * Spell progression template types for shortcut buttons in the form.
 */
export type SpellProgressionType =
    | "full"       // Full caster (Wizard, Cleric, Druid, Bard, Sorcerer)
    | "half"       // Half caster (Paladin, Ranger — starts at level 2)
    | "third"      // Third caster (Arcane Trickster, Eldritch Knight — starts at level 3)
    | "warlock"    // Pact Magic (unique short-rest slots)
    | "artificer"  // Artificer (half-caster variant, starts at level 1)
