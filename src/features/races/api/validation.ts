
import { z } from "zod"
import { SizeCategory } from "../types/races.types"
const optionalOriginalNameSchema = z.union([z.string().trim().max(100, "Nome original muito longo"), z.literal("")]).optional().transform((val) => val || undefined)

export const raceTraitSchema = z.object({
    _id: z.string().optional(),
    name: z.string().default("Habilidade sem Nome"),
    level: z.coerce.number().optional().default(1),
    description: z.string().min(1, "Descrição da característica é obrigatória")
})

export const raceVariationSchema = z.object({
    _id: z.string().optional(),
    name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
    description: z.string().optional().default(""),
    source: z.string().optional(),
    image: z.string().optional(),
    color: z.string().optional(),
    traits: z.array(raceTraitSchema).default([]),
    spells: z.array(z.any()).default([]),
    size: z.enum(["Pequeno", "Médio", "Grande"]).optional(),
    speed: z.string().optional()
})

export const createRaceSchema = z.object({
    name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
    originalName: optionalOriginalNameSchema,
    description: z.string().min(10, "A descrição deve ter pelo menos 10 caracteres"),
    source: z.string().min(1, "A fonte é obrigatória"),
    status: z.enum(["active", "inactive"]).default("active"),
    image: z.string().optional(),
    size: z.enum(["Pequeno", "Médio", "Grande"]),
    speed: z.union([z.string(), z.number()]).transform(val => String(val)).pipe(z.string().min(1, "O deslocamento é obrigatório")),
    traits: z.array(raceTraitSchema).default([]),
    spells: z.array(z.any()).default([]),
    variations: z.array(raceVariationSchema).default([])
})

export type CreateRaceSchema = z.infer<typeof createRaceSchema>
