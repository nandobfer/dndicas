import { z } from "zod"
import { SKILL_OPTIONS, HIT_DICE_OPTIONS } from "../types/classes.types"

const ATTRIBUTES = ["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"] as const

// ─── Progression Table Schemas ───────────────────────────────────────────────

const spellSlotsLevelDataSchema = z.object({
    cantrips: z.number().int().min(0).max(20).optional(),
    preparedSpells: z.number().int().min(0).optional(),
    slots: z.record(z.string(), z.number().int().min(0).max(10)).optional(),
})

const progressionCustomColumnSchema = z.object({
    id: z.string(),
    label: z.string().min(1).max(100),
    values: z.array(z.string().nullable()).length(20),
})

const classProgressionDataSchema = z.object({
    spellSlots: z.record(z.string(), spellSlotsLevelDataSchema).optional(),
    customColumns: z.array(progressionCustomColumnSchema).optional(),
}).optional()

// ─── Subclass Schema ─────────────────────────────────────────────────────────

const subclassSchema = z.object({
    _id: z.string().optional(),
    name: z.string().min(2, "Nome da subclasse deve ter pelo menos 2 caracteres").max(100, "Nome muito longo"),
    source: z.string().max(200, "Fonte muito longa").optional(),
    image: z.string().optional().or(z.literal("")),
    description: z.string().max(20000).optional(),
    color: z.string().optional(),
    spellcasting: z.boolean().default(false),
    spellcastingAttribute: z
        .string()
        .optional()
        .nullable()
        .transform((val) => val || undefined),
    spells: z.array(z.any()).default([]),
    traits: z
        .array(
            z.object({
                _id: z.string().optional(),
                level: z.number().int().min(1).max(20),
                description: z.string().min(1, "Descrição da habilidade é obrigatória").max(10000)
            })
        )
        .default([]),
    progressionTable: classProgressionDataSchema,
})

const classTraitSchema = z.object({
    _id: z.string().optional(),
    level: z.number().int().min(1).max(20),
    description: z.string().min(1, "Descrição da habilidade é obrigatória").max(10000)
})

export const createClassSchema = z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome muito longo"),
    image: z.string().optional().or(z.literal("")),
    description: z.string().min(10, "Descrição deve ter pelo menos 10 caracteres").max(20000, "Descrição muito longa"),
    source: z.string().max(200, "Fonte muito longa").optional(),
    status: z.enum(["active", "inactive"]),
    hitDice: z.enum(HIT_DICE_OPTIONS, { message: "Dado de vida inválido" }),
    primaryAttributes: z.array(z.enum(ATTRIBUTES)).min(1, "Selecione ao menos 1 atributo primário"),
    savingThrows: z
        .array(z.enum(ATTRIBUTES))
        .min(2, "Selecione exatamente 2 testes de resistência")
        .max(2, "Selecione exatamente 2 testes de resistência"),
    armorProficiencies: z.array(z.string()).default([]),
    weaponProficiencies: z.array(z.string()).default([]),
    skillCount: z.number().int({ message: "Deve ser um número inteiro" }).min(1, "Mínimo 1 perícia").max(10, "Máximo 10 perícias"),
    availableSkills: z.array(z.enum(SKILL_OPTIONS)).min(1, "Selecione ao menos 1 perícia disponível"),
    spellcasting: z.boolean().default(false),
    spellcastingAttribute: z
        .string()
        .optional()
        .nullable()
        .transform((val) => val || undefined),
    spells: z.array(z.any()).default([]),
    subclasses: z.array(subclassSchema).default([]),
    traits: z.array(classTraitSchema).default([]),
    progressionTable: classProgressionDataSchema,
})

export const updateClassSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    image: z.string().optional().or(z.literal("")),
    description: z.string().min(10).max(20000).optional(),
    source: z.string().max(200).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    hitDice: z.enum(HIT_DICE_OPTIONS).optional(),
    primaryAttributes: z.array(z.enum(ATTRIBUTES)).optional(),
    savingThrows: z.array(z.enum(ATTRIBUTES)).min(2).max(2).optional(),
    armorProficiencies: z.array(z.string()).optional(),
    weaponProficiencies: z.array(z.string()).optional(),
    skillCount: z.number().int().min(1).max(10).optional(),
    availableSkills: z.array(z.enum(SKILL_OPTIONS)).optional(),
    spellcasting: z.boolean().optional(),
    spellcastingAttribute: z.enum(ATTRIBUTES).nullable().optional(),
    spells: z.array(z.any()).optional(),
    subclasses: z.array(subclassSchema).optional(),
    traits: z.array(classTraitSchema).optional(),
    progressionTable: classProgressionDataSchema,
})

export const classesQuerySchema = z.object({
    search: z.string().optional(),
    hitDice: z.array(z.enum(HIT_DICE_OPTIONS)).optional(),
    spellcasting: z.array(z.boolean()).optional(),
    status: z.enum(["all", "active", "inactive"]).default("active"),
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(10)
})

export type CreateClassSchema = z.infer<typeof createClassSchema>
export type UpdateClassSchema = z.infer<typeof updateClassSchema>
export type ClassesQuerySchema = z.infer<typeof classesQuerySchema>

