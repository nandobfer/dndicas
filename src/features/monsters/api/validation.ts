import { z } from "zod"

const optionalTrimmed = (max = 200) =>
    z
        .union([z.string().trim().max(max), z.literal(""), z.null()])
        .optional()
        .transform((value) => value || undefined)

const diceTextSchema = z.string().trim().regex(/^\d+(?:d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?)?(?:\s+.*)?$/i, "Use número, dados ou dados + bônus")

const monsterTypeSchema = z.enum(["aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead"])
const monsterSizeSchema = z.enum(["F", "D", "T", "S", "M", "L", "H", "G", "C", "V"])
const alignmentSchema = z.enum(["LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE", "unaligned", "any"])
const challengeRatingSchema = z
    .string()
    .trim()
    .transform((value) => value || "0")
    .pipe(z.string().regex(/^\d+(?:\/\d+)?$/, "Use apenas números e /"))
const damageTypeSchema = z.enum(["acid", "cold", "fire", "force", "healing", "lightning", "necrotic", "poison", "radiant", "thunder", "psychic", "physical"])
const conditionSchema = z.enum(["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"])
export const npcParamSchema = z.object({
    _id: z.string().optional(),
    label: z.string().trim().min(1, "Nome é obrigatório").max(120, "Nome muito longo"),
    description: z.string().trim().min(1, "Descrição é obrigatória").max(20000, "Descrição muito longa"),
    attackRoll: z.coerce.number().int().min(-20).max(50).optional(),
    hitRoll: optionalTrimmed(300).pipe(z.string().regex(/^\d+(?:d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?)?(?:\s+.*)?$/i).optional()),
    usage: optionalTrimmed(120),
    recharge: optionalTrimmed(80),
})

const attributesSchema = z.object({
    strength: z.coerce.number().int().min(1).max(30).default(10),
    dexterity: z.coerce.number().int().min(1).max(30).default(10),
    constitution: z.coerce.number().int().min(1).max(30).default(10),
    intelligence: z.coerce.number().int().min(1).max(30).default(10),
    wisdom: z.coerce.number().int().min(1).max(30).default(10),
    charisma: z.coerce.number().int().min(1).max(30).default(10),
})

const savingThrowStateSchema = z.object({
    proficient: z.boolean().default(false),
    override: z.coerce.number().int().min(-20).max(50).optional(),
})

const skillStateSchema = z.object({
    proficient: z.boolean().default(false),
    expertise: z.boolean().optional().default(false),
    override: z.coerce.number().int().min(-20).max(50).optional(),
})

export const createMonsterSchema = z.object({
    name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome muito longo"),
    originalName: optionalTrimmed(100),
    source: z.string().trim().min(1, "Fonte é obrigatória").max(200, "Fonte muito longa"),
    description: z.string().trim().min(10, "Descrição deve ter pelo menos 10 caracteres").max(20000, "Descrição muito longa"),
    image: z.string().optional().default(""),
    status: z.enum(["active", "inactive"]).default("active"),
    type: monsterTypeSchema,
    size: monsterSizeSchema,
    alignment: alignmentSchema,
    armorClass: z.coerce.number().int().min(0).max(50),
    initiative: z.coerce.number().int().min(-20).max(50).optional(),
    hitPointsFormula: diceTextSchema.max(80),
    speed: optionalTrimmed(80),
    flySpeed: optionalTrimmed(80),
    swimSpeed: optionalTrimmed(80),
    climbSpeed: optionalTrimmed(80),
    attributes: attributesSchema,
    savingThrows: z.record(z.string(), savingThrowStateSchema).default({}),
    skills: z.record(z.string(), skillStateSchema).default({}),
    senses: z
        .object({
            passivePerception: z.coerce.number().int().min(0).max(60).optional(),
            blindsight: optionalTrimmed(80),
            darkvision: optionalTrimmed(80),
            tremorsense: optionalTrimmed(80),
            truesight: optionalTrimmed(80),
            special: optionalTrimmed(200),
        })
        .partial()
        .default({}),
    sensesAndLanguages: z.array(npcParamSchema).default([]),
    challengeRating: challengeRatingSchema,
    experience: z.coerce.number().int().min(0).optional(),
    experienceOverride: z.coerce.number().int().min(0).optional(),
    proficiencyBonusOverride: z.coerce.number().int().min(0).max(20).optional(),
    languages: z.string().trim().max(500).default("—"),
    damageVulnerabilities: z.array(damageTypeSchema).default([]),
    damageResistances: z.array(damageTypeSchema).default([]),
    damageImmunities: z.array(damageTypeSchema).default([]),
    conditionImmunities: z.array(conditionSchema).default([]),
    conditionImmunityNotes: optionalTrimmed(5000),
    traits: z.array(npcParamSchema).default([]),
    actions: z.array(npcParamSchema).default([]),
    bonusActions: z.array(npcParamSchema).default([]),
    reactions: z.array(npcParamSchema).default([]),
    legendaryActions: z.array(npcParamSchema).default([]),
    legendaryActionUses: z.coerce.number().int().min(0).max(10).optional(),
    lairActions: z.array(npcParamSchema).default([]),
    lairActionInitiative: z.coerce.number().int().min(0).max(30).optional(),
    regionalEffects: z.array(npcParamSchema).default([]),
})

export const updateMonsterSchema = createMonsterSchema.partial().omit({ name: true }).extend({
    name: z.string().trim().min(2).max(100).optional(),
})

export type CreateMonsterSchema = z.infer<typeof createMonsterSchema>
export type UpdateMonsterSchema = z.infer<typeof updateMonsterSchema>
