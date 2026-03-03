import type { AttributeType } from "@/lib/config/colors"

export type { AttributeType }

// ─── D&D 5e Class domain constants ──────────────────────────────────────────

export const ARMOR_PROFICIENCY_OPTIONS = [
    "Nenhuma",
    "Armaduras Leves",
    "Armaduras Médias",
    "Armaduras Pesadas",
    "Escudos",
] as const
export type ArmorProficiency = (typeof ARMOR_PROFICIENCY_OPTIONS)[number]

export const WEAPON_PROFICIENCY_OPTIONS = [
    "Armas Simples",
    "Armas Marciais",
    "Armas de Fogo",
    "Besta Leve",
    "Besta Pesada",
    "Balestras",
    "Espadas Longas",
    "Espadas Curtas",
    "Adagas",
    "Arcos",
] as const
export type WeaponProficiency = (typeof WEAPON_PROFICIENCY_OPTIONS)[number]

export const SKILL_OPTIONS = [
    "Acrobacia",
    "Arcanismo",
    "Atletismo",
    "Atuação",
    "Enganação",
    "Furtividade",
    "História",
    "Intimidação",
    "Intuição",
    "Investigação",
    "Lidar com Animais",
    "Medicina",
    "Natureza",
    "Percepção",
    "Persuasão",
    "Prestidigitação",
    "Religião",
    "Sobrevivência",
] as const
export type SkillType = (typeof SKILL_OPTIONS)[number]

export const HIT_DICE_OPTIONS = ["d6", "d8", "d10", "d12"] as const
export type HitDiceType = (typeof HIT_DICE_OPTIONS)[number]

// ─── Subclass ────────────────────────────────────────────────────────────────

export interface Subclass {
    _id?: string
    name: string
    source?: string
    image?: string
    description?: string
    color?: string
    spellcasting: boolean
    spellcastingAttribute?: AttributeType
    spells?: any[]
    traits: ClassTrait[]
}

// ─── Class Traits ────────────────────────────────────────────────────────────

export interface ClassTrait {
    _id?: string
    level: number
    description: string // HTML string with Mentions to specific traits/rules
}

// ─── Base entity (matches Mongoose document) ─────────────────────────────────

export interface CharacterClass {
    _id: string
    name: string
    image?: string
    description: string // HTML string from TipTap
    source: string
    status: "active" | "inactive"
    hitDice: HitDiceType // e.g. "d10" for Fighter
    primaryAttributes: AttributeType[] // multiclassing prerequisites
    savingThrows: AttributeType[] // exactly 2 per class
    armorProficiencies: ArmorProficiency[]
    weaponProficiencies: WeaponProficiency[]
    skillCount: number // how many skills the player chooses
    availableSkills: SkillType[] // which skills are available to the class
    spellcasting: boolean
    spellcastingAttribute?: AttributeType
    spells?: any[]
    subclasses: Subclass[]
    traits: ClassTrait[]
    createdAt: Date
    updatedAt: Date
}

// ─── API input types ─────────────────────────────────────────────────────────

export interface CreateClassInput {
    name: string
    image?: string
    description: string
    source?: string
    status: "active" | "inactive"
    hitDice: HitDiceType
    primaryAttributes: AttributeType[]
    savingThrows: AttributeType[]
    armorProficiencies: ArmorProficiency[]
    weaponProficiencies: WeaponProficiency[]
    skillCount: number
    availableSkills: SkillType[]
    spellcasting: boolean
    spellcastingAttribute?: AttributeType
    spells?: any[]
    subclasses?: Subclass[]
    traits?: ClassTrait[]
}

export interface UpdateClassInput {
    name?: string
    image?: string
    description?: string
    source?: string
    status?: "active" | "inactive"
    hitDice?: HitDiceType
    primaryAttributes?: AttributeType[]
    savingThrows?: AttributeType[]
    armorProficiencies?: ArmorProficiency[]
    weaponProficiencies?: WeaponProficiency[]
    skillCount?: number
    availableSkills?: SkillType[]
    spellcasting?: boolean
    spellcastingAttribute?: AttributeType | null
    spells?: any[]
    subclasses?: Subclass[]
}

// ─── Filter types ─────────────────────────────────────────────────────────────

export interface ClassesFilters {
    search?: string
    hitDice?: HitDiceType[]
    spellcasting?: boolean[]
    status?: "all" | "active" | "inactive"
}

// ─── API response types ───────────────────────────────────────────────────────

export interface ClassesListResponse {
    classes: CharacterClass[]
    total: number
    page: number
    limit: number
    totalPages: number
}

export interface ClassResponse {
    class: CharacterClass
}
