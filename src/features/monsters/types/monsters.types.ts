import type { DamageTypeKey } from "@/lib/config/damage-types-hex"
import type { AttributeType, SkillName } from "@/features/character-sheets/types/character-sheet.types"

export type MonsterType =
    | "aberration"
    | "beast"
    | "celestial"
    | "construct"
    | "dragon"
    | "elemental"
    | "fey"
    | "fiend"
    | "giant"
    | "humanoid"
    | "monstrosity"
    | "ooze"
    | "plant"
    | "undead"

export type MonsterSize = "F" | "D" | "T" | "S" | "M" | "L" | "H" | "G" | "C" | "V"

export type MonsterAlignment =
    | "LG"
    | "NG"
    | "CG"
    | "LN"
    | "N"
    | "CN"
    | "LE"
    | "NE"
    | "CE"
    | "unaligned"
    | "any"

export type MonsterChallengeRating = string

export type ConditionKey =
    | "blinded"
    | "charmed"
    | "deafened"
    | "exhaustion"
    | "frightened"
    | "grappled"
    | "incapacitated"
    | "invisible"
    | "paralyzed"
    | "petrified"
    | "poisoned"
    | "prone"
    | "restrained"
    | "stunned"
    | "unconscious"

export interface MonsterAttributes {
    strength: number
    dexterity: number
    constitution: number
    intelligence: number
    wisdom: number
    charisma: number
}

export interface MonsterSkillState {
    proficient: boolean
    expertise?: boolean
    override?: number
}

export interface MonsterSavingThrowState {
    proficient: boolean
    override?: number
}

export interface MonsterSenses {
    passivePerception?: number
    blindsight?: string
    darkvision?: string
    tremorsense?: string
    truesight?: string
    special?: string
}

export interface NpcParam {
    _id?: string
    label: string
    description: string
    attackRoll?: number
    hitRoll?: string
    usage?: string
    recharge?: string
}

export interface Monster {
    _id: string
    id: string
    name: string
    originalName?: string
    source: string
    description: string
    image?: string
    status: "active" | "inactive"
    type: MonsterType
    size: MonsterSize
    alignment: MonsterAlignment
    armorClass: number
    initiative?: number
    hitPointsFormula: string
    speed?: string
    flySpeed?: string
    swimSpeed?: string
    climbSpeed?: string
    attributes: MonsterAttributes
    savingThrows: Partial<Record<AttributeType, MonsterSavingThrowState>>
    skills: Partial<Record<SkillName, MonsterSkillState>>
    senses: MonsterSenses
    sensesAndLanguages: NpcParam[]
    challengeRating: MonsterChallengeRating
    experience?: number
    experienceOverride?: number
    proficiencyBonusOverride?: number
    languages: string
    damageVulnerabilities: DamageTypeKey[]
    damageResistances: DamageTypeKey[]
    damageImmunities: DamageTypeKey[]
    conditionImmunities: ConditionKey[]
    conditionImmunityNotes?: string
    traits: NpcParam[]
    actions: NpcParam[]
    bonusActions: NpcParam[]
    reactions: NpcParam[]
    legendaryActions: NpcParam[]
    legendaryActionUses?: number
    lairActions: NpcParam[]
    lairActionInitiative?: number
    regionalEffects: NpcParam[]
    createdAt: string
    updatedAt: string
}

export type CreateMonsterInput = Omit<Monster, "_id" | "id" | "createdAt" | "updatedAt">
export type UpdateMonsterInput = Partial<CreateMonsterInput>

export interface MonsterFilterParams {
    search?: string
    type?: MonsterType[]
    size?: MonsterSize[]
    challengeRating?: string
    status?: "active" | "inactive" | "all"
    sources?: string[]
    page?: number
    limit?: number
}

export interface MonstersResponse {
    items: Monster[]
    total: number
    page: number
    limit: number
}
