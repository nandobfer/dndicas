import { z } from "zod"
import { DICE_TYPES } from "./types"

export const DiceTypeSchema = z.enum(DICE_TYPES)
const OwlbearDisplayContextSchema = z.object({
    playerName: z.string().trim().min(1).max(120),
    owlbearRoomId: z.string().trim().min(1).max(120),
})
const OwlbearPlayerTargetSchema = z.object({
    owlbearPlayerId: z.string().trim().min(1).max(120),
})

function extendWithOptionalOwlbearDisplayContext<TSchema extends z.ZodObject<z.ZodRawShape>>(schema: TSchema) {
    return schema
        .extend({
            playerName: OwlbearDisplayContextSchema.shape.playerName.optional(),
            owlbearRoomId: OwlbearDisplayContextSchema.shape.owlbearRoomId.optional(),
        })
}

function extendWithOptionalOwlbearPlayerTarget<TSchema extends z.ZodObject<z.ZodRawShape>>(schema: TSchema) {
    return schema.extend({
        owlbearPlayerId: OwlbearPlayerTargetSchema.shape.owlbearPlayerId.optional(),
    })
}

function validateOptionalOwlbearDisplayContext(value: { playerName?: string; owlbearRoomId?: string }, ctx: z.RefinementCtx) {
    const hasPlayerName = typeof value.playerName === "string" && value.playerName.trim().length > 0
    const hasRoomId = typeof value.owlbearRoomId === "string" && value.owlbearRoomId.trim().length > 0

    if (hasPlayerName !== hasRoomId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "playerName e owlbearRoomId devem ser informados juntos.",
            path: hasPlayerName ? ["owlbearRoomId"] : ["playerName"],
        })
    }
}

export const DiceRollModeSchema = z.enum(["disadvantage", "normal", "advantage"])

export const DiceTermSchema = z.object({
    dice: DiceTypeSchema,
    quantity: z.number().int().positive(),
})

export const DiceRollRequestSchema = extendWithOptionalOwlbearPlayerTarget(
    extendWithOptionalOwlbearDisplayContext(z.object({
        terms: z.array(DiceTermSchema).min(1),
        modifier: z.number().int().optional().default(0),
        mode: DiceRollModeSchema.default("normal"),
        label: z.string().trim().min(1).max(120).optional(),
        source: z.enum(["manual", "sheet", "owlbear"]).optional().default("manual"),
        diceSessionId: z.string().trim().min(8).max(120).optional(),
    }))
).superRefine(validateOptionalOwlbearDisplayContext)

export const DiceOverrideCreateSchema = z.discriminatedUnion("action", [
    extendWithOptionalOwlbearPlayerTarget(z.object({
        action: z.literal("min"),
        dice: DiceTypeSchema,
        value: z.number().int(),
        diceSessionId: z.string().trim().min(8).max(120).optional(),
    })),
    extendWithOptionalOwlbearPlayerTarget(z.object({
        action: z.literal("max"),
        dice: DiceTypeSchema,
        value: z.number().int(),
        diceSessionId: z.string().trim().min(8).max(120).optional(),
    })),
    extendWithOptionalOwlbearPlayerTarget(z.object({
        action: z.literal("range"),
        dice: DiceTypeSchema,
        min: z.number().int(),
        max: z.number().int(),
        diceSessionId: z.string().trim().min(8).max(120).optional(),
    })),
    extendWithOptionalOwlbearPlayerTarget(z.object({
        action: z.literal("exact"),
        dice: DiceTypeSchema,
        value: z.number().int(),
        diceSessionId: z.string().trim().min(8).max(120).optional(),
    })),
])

export const DiceOverrideDeleteSchema = extendWithOptionalOwlbearPlayerTarget(z.object({
    dice: DiceTypeSchema.optional(),
    diceSessionId: z.string().trim().min(8).max(120).optional(),
}))

export type DiceRollRequestInput = z.infer<typeof DiceRollRequestSchema>
export type DiceOverrideCreateInput = z.infer<typeof DiceOverrideCreateSchema>
export type DiceOverrideDeleteInput = z.infer<typeof DiceOverrideDeleteSchema>
