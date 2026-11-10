import { z } from "zod"
import { MADDOX_ABILITIES, MADDOX_SKILLS } from "./check-modifier"
import { parseDiceExpression } from "./combat-rules"
import { MADDOX_COMBAT_PREP_TEXT_CEILING as CEILING, MADDOX_REACTION_TRIGGERS } from "./constants"

/**
 * Contrato da resposta da IA na preparação da mesa de combate e nos pedidos de ajuste (DND-41) — módulo PURO.
 * Validação tolerante: o texto longo é cortado (não invalida o objeto) e cada item da lista é conferido sozinho, então
 * um item errado é descartado sem derrubar os demais (`parseList`).
 */

const cut = (max: number) => (value: string) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value)
const text = (max: number) => z.string().trim().transform(cut(max))
const reason = text(CEILING.reason).pipe(z.string().min(1))
const optionalReason = z.string().trim().transform(cut(CEILING.reason)).optional().default("")
const attribute = z.enum(MADDOX_ABILITIES as [string, ...string[]])
export const diceText = z
    .string()
    .trim()
    .refine((value) => Boolean(parseDiceExpression(value)), { error: "Expressão de dados inválida" })
const ref = z.string().trim().max(40).optional()

/** Operações de ficha permitidas (lista fechada). `ref` liga uma criação a uma opção acrescentada (`fromChange`). */
export const combatSheetChangeSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("ability"), attribute, value: z.number().int().min(1).max(30), reason, ref }),
    z.object({ type: z.literal("save-proficiency"), attribute, proficient: z.boolean(), reason, ref }),
    z.object({ type: z.literal("skill-proficiency"), skill: z.enum(MADDOX_SKILLS as [string, ...string[]]), proficient: z.boolean(), expertise: z.boolean().optional(), reason, ref }),
    z.object({ type: z.literal("spellcasting-attribute"), attribute: attribute.nullable(), reason, ref }),
    z.object({ type: z.literal("spell-slots"), circle: z.number().int().min(1).max(9), total: z.number().int().min(0).max(9), reason, ref }),
    z.object({ type: z.literal("charge-upsert"), chargeId: z.string().trim().max(80).optional(), name: text(CEILING.name).pipe(z.string().min(1)), total: z.number().int().min(0).max(99), used: z.number().int().min(0).max(99).optional(), reason, ref }),
    z.object({
        type: z.literal("attack-upsert"),
        attackId: z.string().trim().max(40).optional(),
        name: text(CEILING.name).pipe(z.string().min(1)),
        attackBonus: z.number().int().min(-5).max(20),
        damage: z.object({ quantity: z.number().int().min(1).max(20), faces: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12), z.literal(20)]), bonus: z.number().int().min(-10).max(20).optional().default(0), type: text(40).optional().default("") }),
        reason,
        ref,
    }),
    z.object({ type: z.literal("attack-remove"), attackId: z.string().trim().min(1).max(40), reason, ref }),
    z.object({ type: z.literal("trait-upsert"), id: z.string().trim().max(40).optional(), name: text(CEILING.name).pipe(z.string().min(1)), description: text(CEILING.description), reason, ref }),
    z.object({ type: z.literal("feat-upsert"), id: z.string().trim().max(40).optional(), name: text(CEILING.name).pipe(z.string().min(1)), description: text(CEILING.description), reason, ref }),
    z.object({ type: z.literal("spell-update"), spellId: z.string().trim().min(1).max(40), prepared: z.boolean().optional(), circle: z.number().int().min(0).max(9).optional(), reason, ref }),
    z.object({ type: z.literal("item-equip"), itemId: z.string().trim().min(1).max(40), equipped: z.boolean(), reason, ref }),
    z.object({ type: z.literal("text-append"), field: z.enum(["classFeatures", "speciesTraits", "featuresNotes", "weaponProficiencies", "notes"]), text: text(CEILING.append).pipe(z.string().min(1)), reason, ref }),
])
export type CombatSheetChange = z.infer<typeof combatSheetChangeSchema>

/** Correção parcial do ataque (`modify`): o que a IA omitir é herdado da opção (Leve, à distância, tipo de dano, Acuidade). */
const attackPatchSchema = z.object({ bonus: z.number().int().min(-5).max(25), damage: diceText, damageType: z.string().trim().max(40).nullable().optional(), ranged: z.boolean().optional(), light: z.boolean().optional(), finesse: z.boolean().optional() })
/** Ataque de uma opção acrescentada (`add`): sem a opção de origem, os campos omitidos assumem o padrão. */
const attackSchema = attackPatchSchema.extend({ damageType: z.string().trim().max(40).nullable().optional().default(null), ranged: z.boolean().optional().default(false), light: z.boolean().optional().default(false) })
const saveSchema = z.object({ ability: attribute, dc: z.number().int().min(5).max(30), halfOnSave: z.boolean().optional().default(false), damage: diceText.nullable().optional().default(null), damageType: z.string().trim().max(40).nullable().optional().default(null) })
const healSchema = z.object({ dice: diceText })

export const combatModifySchema = z.object({
    optionId: z.string().trim().min(1).max(200),
    label: text(CEILING.label).optional(),
    detail: text(CEILING.detail).optional(),
    economy: z.enum(["action", "bonus"]).optional(),
    attack: attackPatchSchema.optional(),
    save: saveSchema.optional(),
    heal: healSchema.optional(),
    reason,
})

export const combatRemoveSchema = z.object({ optionId: z.string().trim().min(1).max(200), reason })

export const combatAddSchema = z.object({
    id: z
        .string()
        .trim()
        .min(1)
        .max(60)
        .transform((value) =>
            value
                .replace(/^prep:/, "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, ""),
        ),
    category: z.enum(["weapons", "spells", "items", "abilities", "other"]),
    economy: z.enum(["action", "bonus", "reaction"]),
    label: text(CEILING.label).pipe(z.string().min(1)),
    detail: text(CEILING.detail).optional().default(""),
    target: z.enum(["enemy", "ally", "self", "any", "none"]).optional().default("any"),
    multiTarget: z.boolean().optional().default(false),
    resolution: z.enum(["attack", "save", "heal", "auto", "utility"]),
    attack: attackSchema.optional(),
    save: saveSchema.optional(),
    heal: healSchema.optional(),
    trigger: z.enum(MADDOX_REACTION_TRIGGERS).optional(),
    chargeId: z.string().trim().max(80).nullable().optional(),
    itemId: z.string().trim().max(40).nullable().optional(),
    spellCircle: z.number().int().min(1).max(9).nullable().optional(),
    concentration: z.boolean().optional(),
    fromChange: z.string().trim().max(40).optional(),
    reason,
})

export const sneakAttackSchema = z.object({ dice: diceText.nullable(), reason: optionalReason })

/** Resposta da preparação de uma ficha. Os arrays são conferidos item a item em `parseList`. */
export const combatPrepResponseSchema = z.object({
    sheetChanges: z.array(z.unknown()).optional().default([]),
    modify: z.array(z.unknown()).optional().default([]),
    remove: z.array(z.unknown()).optional().default([]),
    add: z.array(z.unknown()).optional().default([]),
    sneakAttack: z.unknown().optional(),
})

/** Resposta do pedido de ajuste. */
export const combatAdjustResponseSchema = z.object({
    decision: z.enum(["accept", "refuse"]),
    reason: text(CEILING.reason).pipe(z.string().min(1)),
    sheetChanges: z.array(z.unknown()).optional().default([]),
    modify: z.array(z.unknown()).optional().default([]),
    remove: z.array(z.unknown()).optional().default([]),
    add: z.array(z.unknown()).optional().default([]),
})

/** Confere cada item sozinho: devolve os válidos e quantos foram descartados. */
export function parseList<T>(schema: z.ZodType<T>, items: readonly unknown[]): { valid: T[]; dropped: number } {
    const valid: T[] = []
    let dropped = 0
    for (const item of items) {
        const parsed = schema.safeParse(item)
        if (parsed.success) valid.push(parsed.data)
        else dropped += 1
    }
    return { valid, dropped }
}
