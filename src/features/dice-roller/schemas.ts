import { z } from "zod"
import { DICE_TYPES } from "./types"

export const DiceTypeSchema = z.enum(DICE_TYPES)

export const DiceRollModeSchema = z.enum(["disadvantage", "normal", "advantage"])

export const DiceTermSchema = z.object({
    dice: DiceTypeSchema,
    quantity: z.number().int().positive(),
})

export const DiceRollRequestSchema = z.object({
    terms: z.array(DiceTermSchema).min(1),
    modifier: z.number().int().optional().default(0),
    mode: DiceRollModeSchema.default("normal"),
    label: z.string().trim().min(1).max(120).optional(),
    source: z.enum(["manual", "sheet", "owlbear"]).optional().default("manual"),
    diceSessionId: z.string().trim().min(8).max(120).optional(),
})

export const DiceOverrideCreateSchema = z.discriminatedUnion("action", [
    z.object({
        action: z.literal("min"),
        dice: DiceTypeSchema,
        value: z.number().int(),
        diceSessionId: z.string().trim().min(8).max(120).optional(),
    }),
    z.object({
        action: z.literal("max"),
        dice: DiceTypeSchema,
        value: z.number().int(),
        diceSessionId: z.string().trim().min(8).max(120).optional(),
    }),
    z.object({
        action: z.literal("range"),
        dice: DiceTypeSchema,
        min: z.number().int(),
        max: z.number().int(),
        diceSessionId: z.string().trim().min(8).max(120).optional(),
    }),
    z.object({
        action: z.literal("exact"),
        dice: DiceTypeSchema,
        value: z.number().int(),
        diceSessionId: z.string().trim().min(8).max(120).optional(),
    }),
])

export const DiceOverrideDeleteSchema = z.object({
    dice: DiceTypeSchema.optional(),
    diceSessionId: z.string().trim().min(8).max(120).optional(),
})
