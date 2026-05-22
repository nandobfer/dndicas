import { z } from "zod"

// ─── Attribute types ──────────────────────────────────────────────────────────

export type AttributeType = "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"

export type ArmorTraining = { light: boolean; medium: boolean; heavy: boolean; shields: boolean }

export type SkillName =
    | "Acrobacia"
    | "Arcanismo"
    | "Atletismo"
    | "Atuação"
    | "Enganação"
    | "Furtividade"
    | "História"
    | "Intimidação"
    | "Intuição"
    | "Investigação"
    | "Lidar com Animais"
    | "Medicina"
    | "Natureza"
    | "Percepção"
    | "Persuasão"
    | "Prestidigitação"
    | "Religião"
    | "Sobrevivência"

export type TraitOrigin = "class" | "race" | "background" | "manual"

// ─── Core entity interfaces ───────────────────────────────────────────────────

export interface CharacterSheet {
    _id: string
    slug: string
    userId: string
    username: string
    name: string
    class: string
    classRef: string | null
    subclass: string
    subclassRef: string | null
    level: number
    experience: string
    race: string
    raceRef: string | null
    origin: string
    originRef: string | null
    inspiration: boolean
    multiclassNotes: string
    photo: string | null
    // Appearance
    age: string
    height: string
    weight: string
    eyes: string
    skin: string
    hair: string
    appearance: string
    // Attributes
    strength: number
    dexterity: number
    constitution: number
    intelligence: number
    wisdom: number
    charisma: number
    // Proficiencies
    proficiencyBonusOverride: number | null
    savingThrows: Record<AttributeType, boolean>
    skills: Record<SkillName, { proficient: boolean; expertise: boolean; override?: number }>
    // Combat
    movementSpeed: string
    hpMax: number | null
    hpCurrent: number | null
    hpTemp: number
    hitDiceTotal: string
    hitDiceUsed: number
    deathSavesSuccess: number
    deathSavesFailure: number
    armorClassOverride: number | null
    armorClassBonus: number | null
    initiativeOverride: number | null
    passivePerceptionOverride: number | null
    // Spellcasting
    spellcastingAttribute: string | null
    spellSaveDCOverride: number | null
    spellAttackBonusOverride: number | null
    spellSlots: Record<string, { total: number; used: number }>
    resourceCharges: CharacterResourceCharge[]
    // Currency
    coins: { cp: number; sp: number; ep: number; gp: number; pp: number }
    // Personality
    personalityTraits: string
    ideals: string
    bonds: string
    flaws: string
    notes: string
    // 2024 sheet fields
    classFeatures: string
    speciesTraits: string
    featuresNotes: string
    size: string
    armorTraining: ArmorTraining
    weaponProficiencies: string
    toolProficiencies: string
    computedArmorClass?: number
    createdAt: string
    updatedAt: string
}

export interface CharacterItem {
    _id: string
    clientKey?: string
    sheetId: string
    catalogItemId: string | null
    name: string
    image: string | null
    quantity: number
    notes: string
    equipped: boolean
    catalogItemType: string | null
    catalogAc: number | null
    catalogAcType: "base" | "bonus" | null
    catalogArmorType: "leve" | "média" | "pesada" | null
    catalogAcBonus: number | null
    createdAt: string
}

export interface CharacterSpell {
    _id: string
    clientKey?: string
    sheetId: string
    catalogSpellId: string | null
    name: string
    circle: number | null
    school: string
    image: string | null
    prepared: boolean
    components: string[]
    castingTime: string
    range: string
    concentration: boolean
    ritual: boolean
    material: boolean
    notes: string
    createdAt: string
}

export interface CharacterTrait {
    _id: string
    sheetId: string
    catalogTraitId: string | null
    name: string
    description: string
    origin: TraitOrigin
    createdAt: string
}

export interface CharacterFeat {
    _id: string
    sheetId: string
    catalogFeatId: string | null
    name: string
    description: string
    levelAcquired: number | null
    createdAt: string
}

export interface CharacterAttack {
    _id: string
    clientKey?: string
    sheetId: string
    name: string
    attackBonus: string
    damageType: string
    notes: string
    createdAt: string
}

export type ResourceChargeSourceKind = "manual-name-mention" | "class-feature" | "species-trait" | "feat" | "item"

export type ResourceChargeSourceEntityType = "Habilidade" | "Talento" | "Item"

export interface CharacterResourceChargeSource {
    kind: ResourceChargeSourceKind
    entityType: ResourceChargeSourceEntityType
    entityId: string
}

export interface CharacterResourceCharge {
    id: string
    name: string
    total: number
    used: number
    source: CharacterResourceChargeSource | null
}

export interface CharacterSheetFull extends CharacterSheet {
    items: CharacterItem[]
    spells: CharacterSpell[]
    traits: CharacterTrait[]
    feats: CharacterFeat[]
    attacks: CharacterAttack[]
}

// ─── API response types ───────────────────────────────────────────────────────

export interface SheetsListResponse {
    sheets: CharacterSheet[]
    total: number
    page: number
    totalPages: number
    hasNextPage: boolean
}

export interface AdminSheetOwnerSummary {
    id: string | null
    name: string
    username: string
    avatarUrl: string | null
}

export interface AdminSheetListItem {
    id: string
    slug: string
    name: string
    photo: string | null
    class: string
    subclass: string
    race: string
    origin: string
    createdAt: string
    updatedAt: string
    owner: AdminSheetOwnerSummary
}

export interface AdminSheetsListResponse {
    items: AdminSheetListItem[]
    total: number
    page: number
    totalPages: number
}

// ─── API body types ───────────────────────────────────────────────────────────

export type PatchSheetBody = Partial<Omit<CharacterSheet, "_id" | "slug" | "userId" | "createdAt" | "updatedAt">>

export interface CreateItemBody {
    catalogItemId?: string
    name: string
    image?: string | null
    quantity?: number
    notes?: string
}

export interface PatchItemBody {
    catalogItemId?: string | null
    name?: string
    quantity?: number
    notes?: string
    equipped?: boolean
    catalogItemType?: string | null
    catalogAc?: number | null
    catalogAcType?: "base" | "bonus" | null
    catalogArmorType?: "leve" | "média" | "pesada" | null
    catalogAcBonus?: number | null
}

export interface CreateSpellBody {
    catalogSpellId?: string | null
    name: string
    circle?: number | null
    school?: string
    image?: string | null
    prepared?: boolean
    components?: string[]
    castingTime?: string
    range?: string
    concentration?: boolean
    ritual?: boolean
    material?: boolean
    notes?: string
}

export interface PatchSpellBody {
    catalogSpellId?: string | null
    name?: string
    circle?: number | null
    prepared?: boolean
    castingTime?: string
    range?: string
    concentration?: boolean
    ritual?: boolean
    material?: boolean
    notes?: string
}

export interface CreateTraitBody {
    catalogTraitId?: string
    name: string
    description?: string
    origin: TraitOrigin
}

export interface CreateFeatBody {
    catalogFeatId?: string
    name: string
    description?: string
    levelAcquired?: number | null
}

export interface CreateAttackBody {
    name: string
    attackBonus?: string
    damageType?: string
    notes?: string
}

export interface PatchAttackBody {
    name?: string
    attackBonus?: string
    damageType?: string
    notes?: string
}

// ─── Zod validation schemas ───────────────────────────────────────────────────

export const PatchSheetSchema = z.object({
    name: z.string().max(100).optional(),
    class: z.string().max(2000).optional(),
    classRef: z.string().nullable().optional(),
    subclass: z.string().max(2000).optional(),
    subclassRef: z.string().nullable().optional(),
    level: z.number().int().min(1).max(20).optional(),
    experience: z.string().optional(),
    race: z.string().max(2000).optional(),
    raceRef: z.string().nullable().optional(),
    origin: z.string().max(2000).optional(),
    originRef: z.string().nullable().optional(),
    inspiration: z.boolean().optional(),
    multiclassNotes: z.string().optional(),
    photo: z.string().url().nullable().optional(),
    age: z.string().optional(),
    height: z.string().optional(),
    weight: z.string().optional(),
    eyes: z.string().optional(),
    skin: z.string().optional(),
    hair: z.string().optional(),
    appearance: z.string().optional(),
    strength: z.number().int().min(1).max(30).optional(),
    dexterity: z.number().int().min(1).max(30).optional(),
    constitution: z.number().int().min(1).max(30).optional(),
    intelligence: z.number().int().min(1).max(30).optional(),
    wisdom: z.number().int().min(1).max(30).optional(),
    charisma: z.number().int().min(1).max(30).optional(),
    proficiencyBonusOverride: z.number().int().nullable().optional(),
    savingThrows: z.record(z.string(), z.boolean()).optional(),
    skills: z.record(z.string(), z.object({ proficient: z.boolean(), expertise: z.boolean(), override: z.number().optional() })).optional(),
    movementSpeed: z.string().optional(),
    hpMax: z.number().int().nullable().optional(),
    hpCurrent: z.number().int().nullable().optional(),
    hpTemp: z.number().int().min(0).optional(),
    hitDiceTotal: z.string().optional(),
    hitDiceUsed: z.number().int().min(0).optional(),
    deathSavesSuccess: z.number().int().min(0).max(3).optional(),
    deathSavesFailure: z.number().int().min(0).max(3).optional(),
    armorClassOverride: z.number().int().nullable().optional(),
    armorClassBonus: z.number().int().nullable().optional(),
    initiativeOverride: z.number().int().nullable().optional(),
    passivePerceptionOverride: z.number().int().nullable().optional(),
    spellcastingAttribute: z.string().nullable().optional(),
    spellSaveDCOverride: z.number().int().nullable().optional(),
    spellAttackBonusOverride: z.number().int().nullable().optional(),
    spellSlots: z.record(z.string(), z.object({ total: z.number().int().min(0), used: z.number().int().min(0) })).optional(),
    resourceCharges: z.array(
        z.object({
            id: z.string().min(1),
            name: z.string().max(2000),
            total: z.number().int().min(0),
            used: z.number().int().min(0),
            source: z.object({
                kind: z.enum(["manual-name-mention", "class-feature", "species-trait", "feat", "item"]),
                entityType: z.enum(["Habilidade", "Talento", "Item"]),
                entityId: z.string().min(1),
            }).nullable(),
        })
    ).optional(),
    coins: z.object({ cp: z.number().int().min(0), sp: z.number().int().min(0), ep: z.number().int().min(0), gp: z.number().int().min(0), pp: z.number().int().min(0) }).optional(),
    personalityTraits: z.string().optional(),
    ideals: z.string().optional(),
    bonds: z.string().optional(),
    flaws: z.string().optional(),
    notes: z.string().optional(),
    classFeatures: z.string().optional(),
    speciesTraits: z.string().optional(),
    featuresNotes: z.string().optional(),
    size: z.string().max(50).optional(),
    armorTraining: z.object({ light: z.boolean(), medium: z.boolean(), heavy: z.boolean(), shields: z.boolean() }).optional(),
    weaponProficiencies: z.string().optional(),
    toolProficiencies: z.string().optional(),
})

export const CreateItemSchema = z.object({
    catalogItemId: z.string().optional(),
    name: z.string().max(2000),
    image: z.string().url().nullable().optional(),
    quantity: z.number().int().min(0).optional(),
    notes: z.string().optional(),
})

export const PatchItemSchema = z.object({
    catalogItemId: z.string().nullable().optional(),
    name: z.string().max(2000).optional(),
    quantity: z.number().int().min(0).optional(),
    notes: z.string().optional(),
    equipped: z.boolean().optional(),
    catalogItemType: z.string().nullable().optional(),
    catalogAc: z.number().nullable().optional(),
    catalogAcType: z.enum(["base", "bonus"]).nullable().optional(),
    catalogArmorType: z.enum(["leve", "média", "pesada"]).nullable().optional(),
    catalogAcBonus: z.number().nullable().optional(),
})

export const CreateSpellSchema = z.object({
    catalogSpellId: z.string().nullable().optional(),
    name: z.string().max(2000),
    circle: z.number().int().min(0).max(9).nullable().optional(),
    school: z.string().optional(),
    image: z.string().url().nullable().optional(),
    prepared: z.boolean().optional(),
    components: z.array(z.string()).optional(),
    castingTime: z.string().optional(),
    range: z.string().optional(),
    concentration: z.boolean().optional(),
    ritual: z.boolean().optional(),
    material: z.boolean().optional(),
    notes: z.string().optional(),
})

export const PatchSpellSchema = z.object({
    catalogSpellId: z.string().optional(),
    name: z.string().max(2000).optional(),
    circle: z.number().int().min(0).max(9).nullable().optional(),
    prepared: z.boolean().optional(),
    castingTime: z.string().optional(),
    range: z.string().optional(),
    concentration: z.boolean().optional(),
    ritual: z.boolean().optional(),
    material: z.boolean().optional(),
    notes: z.string().optional(),
})

export const CreateTraitSchema = z.object({
    catalogTraitId: z.string().optional(),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    origin: z.enum(["class", "race", "background", "manual"]),
})

export const CreateFeatSchema = z.object({
    catalogFeatId: z.string().optional(),
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    levelAcquired: z.number().int().min(1).max(20).nullable().optional(),
})

export const CreateAttackSchema = z.object({
    name: z.string().max(500),
    attackBonus: z.string().optional(),
    damageType: z.string().max(500).optional(),
    notes: z.string().optional(),
})

export const PatchAttackSchema = z.object({
    name: z.string().max(500).optional(),
    attackBonus: z.string().optional(),
    damageType: z.string().max(500).optional(),
    notes: z.string().optional(),
})
