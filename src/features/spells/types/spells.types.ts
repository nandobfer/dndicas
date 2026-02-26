import { type SpellSchool, type SpellComponent, type DiceType } from "@/lib/config/colors"

export { type SpellSchool, type SpellComponent, type DiceType }

// Base entity (matches Mongoose document)
export interface Spell {
    _id: string
    name: string
    description: string // HTML string from TipTap
    circle: number // 0-9
    school: SpellSchool
    component: SpellComponent[]
    range?: string
    area?: string
    saveAttribute?: AttributeType
    baseDice?: DiceValue
    extraDicePerLevel?: DiceValue
    source: string
    status: "active" | "inactive"
    createdAt: Date
    updatedAt: Date
    circleLabel?: string // Virtual from Mongoose
}

// Dice value structure
export interface DiceValue {
    quantidade: number
    tipo: DiceType
}

// Remove locally defined DiceType, SpellSchool if they were there (replacing with export from colors)
// I'll check if they are still there and remove them if necessary.

// D&D attributes (for save throws)
export type AttributeType = "Força" | "Destreza" | "Constituição" | "Inteligência" | "Sabedoria" | "Carisma"

// API input types
export interface CreateSpellInput {
    name: string
    description: string
    circle: number
    school: SpellSchool
    component: SpellComponent[]
    range?: string
    area?: string
    saveAttribute?: AttributeType
    baseDice?: DiceValue
    extraDicePerLevel?: DiceValue
    source?: string
    status: "active" | "inactive"
}

export interface UpdateSpellInput {
    name?: string
    description?: string
    circle?: number
    school?: SpellSchool
    component?: SpellComponent[]
    range?: string | null
    area?: string | null
    saveAttribute?: AttributeType | null // null to clear
    baseDice?: DiceValue | null
    extraDicePerLevel?: DiceValue | null
    source?: string
    status?: "active" | "inactive"
}

// Filter types
export interface SpellsFilters {
    search?: string
    circles?: number[] // Multi-select: [0, 1, 3] for Truque, 1º, 3º
    schools?: SpellSchool[] // Multi-select: ["Evocação", "Abjuração"]
    saveAttributes?: AttributeType[] // Multi-select
    diceTypes?: DiceType[] // Multi-select: ["d6", "d8"]
    status?: "all" | "active" | "inactive" // Admin-only filter
}

// API response types
export interface SpellsListResponse {
    spells: Spell[]
    total: number
    page: number
    limit: number
    totalPages: number
}

export interface SpellResponse {
    spell: Spell
}
