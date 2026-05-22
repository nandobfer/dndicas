import { z } from 'zod';
const optionalOriginalNameSchema = z.union([z.string().trim().max(100, "Nome original muito longo"), z.literal("")]).optional().transform((val) => val || undefined)

// Dice value schema
export const diceValueSchema = z.object({
  quantidade: z.number().int().positive({ message: 'Quantidade deve ser um número positivo' }),
  tipo: z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'], { message: 'Tipo de dado inválido' }),
});

// Create spell schema
export const createSpellSchema = z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100, "Nome muito longo"),
    originalName: optionalOriginalNameSchema,
    description: z.string().min(10, "Descrição deve ter pelo menos 10 caracteres").max(10000, "Descrição muito longa"),
    circle: z.number().int().min(0, "Círculo mínimo é 0 (truque)").max(9, "Círculo máximo é 9"),
    school: z.enum(["Abjuração", "Adivinhação", "Conjuração", "Encantamento", "Evocação", "Ilusão", "Necromancia", "Transmutação"], {
        message: "Escola inválida"
    }),
    castingTime: z
        .enum(["Ação", "Ação Bônus", "Reação", "Ritual"], {
            message: "Tempo de conjuração inválido"
        })
        .optional(),
    component: z
        .array(z.enum(["Concentração", "Somático", "Verbal", "Material"]))
        .optional()
        .default([]),
    range: z.string().max(100).optional(),
    area: z.string().max(100).optional(),
    duration: z.string().max(100).optional(),
    saveAttribute: z.enum(["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"]).optional(),
    baseDice: diceValueSchema.optional(),
    additionalBaseDice: z.array(diceValueSchema).optional(),
    extraDicePerLevel: diceValueSchema.optional(),
    additionalExtraDicePerLevel: z.array(diceValueSchema).optional(),
    image: z.string().optional().or(z.literal("")),
    source: z.string().max(200, "Fonte muito longa").optional(),
    status: z.enum(["active", "inactive"])
})

// Update spell schema (all fields optional)
export const updateSpellSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    originalName: optionalOriginalNameSchema,
    description: z.string().min(10).max(10000).optional(),
    circle: z.number().int().min(0).max(9).optional(),
    school: z.enum(["Abjuração", "Adivinhação", "Conjuração", "Encantamento", "Evocação", "Ilusão", "Necromancia", "Transmutação"]).optional(),
    castingTime: z.enum(["Ação", "Ação Bônus", "Reação", "Ritual"]).nullable().optional(),
    component: z.array(z.enum(["Concentração", "Somático", "Verbal", "Material"])).optional(),
    range: z.string().max(100).nullable().optional(),
    area: z.string().max(100).nullable().optional(),
    duration: z.string().max(100).nullable().optional(),
    saveAttribute: z.enum(["Força", "Destreza", "Constituição", "Inteligência", "Sabedoria", "Carisma"]).nullable().optional(),
    baseDice: diceValueSchema.nullable().optional(),
    additionalBaseDice: z.array(diceValueSchema).nullable().optional(),
    extraDicePerLevel: diceValueSchema.nullable().optional(),
    additionalExtraDicePerLevel: z.array(diceValueSchema).nullable().optional(),
    image: z.string().optional().or(z.literal("")),
    source: z.string().max(200).optional(),
    status: z.enum(["active", "inactive"]).optional()
})

// Query/filter schema
export const spellsQuerySchema = z.object({
  search: z.string().optional(),
  circles: z.array(z.number().int().min(0).max(9)).optional(),
  schools: z.array(z.enum(['Abjuração', 'Adivinhação', 'Conjuração', 'Encantamento', 'Evocação', 'Ilusão', 'Necromancia', 'Transmutação'])).optional(),
  saveAttributes: z.array(z.enum(['Força', 'Destreza', 'Constituição', 'Inteligência', 'Sabedoria', 'Carisma'])).optional(),
  diceTypes: z.array(z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'])).optional(),
  sources: z.array(z.string()).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
});

// Type exports
export type CreateSpellSchema = z.infer<typeof createSpellSchema>;
export type UpdateSpellSchema = z.infer<typeof updateSpellSchema>;
export type SpellsQuerySchema = z.infer<typeof spellsQuerySchema>;
