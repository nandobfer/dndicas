import { z } from "zod"

/**
 * Contratos do descanso conduzido pelo Maddox (DND-58): a resposta da preparação da ficha (Maddox + catálogo), as rotas das
 * partes dos personagens e a lista das trocas aceitas depois do descanso.
 */

/** Tipos da lista fechada da ficha (`combatSheetChangeSchema`) que uma troca depois do descanso pode usar. */
export const MADDOX_REST_EXCHANGE_CHANGE_TYPES = ["spell-add", "spell-remove", "spell-update", "trait-upsert", "trait-remove", "feat-upsert", "feat-remove", "weapon-mastery", "attack-upsert", "attack-remove"] as const

const sourceSchema = z.object({ ref: z.string().trim().min(3).max(300), quote: z.string().trim().min(1).max(2_000) })
const reasonText = z
    .string()
    .trim()
    .transform((value) => value.slice(0, 300))
    .optional()

/** Resposta do Maddox na preparação da ficha: o que volta, pela regra lida no catálogo. */
export const restPrepResponseSchema = z.object({
    cargas: z
        .array(
            z.object({
                chargeId: z.string().trim().min(1).max(200),
                recupera: z.union([z.literal("todas"), z.literal("nenhuma"), z.number().int().min(0).max(99)]),
                source: sourceSchema.optional(),
                motivo: reasonText,
            }),
        )
        .optional()
        .default([]),
    espacosNoCurto: z
        .object({ recupera: z.boolean(), source: sourceSchema.optional(), motivo: reasonText })
        .nullable()
        .optional()
        .default(null),
})
export type RestPrepResponse = z.infer<typeof restPrepResponseSchema>

/** Corpo vazio (`{}`): a rolagem e as ações do dono não aceitam dado nem valor do cliente. */
export const restEmptyBodySchema = z.strictObject({}, { error: "Esta ação não aceita dados no corpo." })

export const restExchangeInputSchema = z.object({ text: z.string().trim().min(1, "Escreva o que quer trocar.").max(4_000, "O pedido pode ter até 4.000 caracteres.") })
export const restExchangeFinishSchema = z.object({ nothing: z.boolean().optional().default(false) })

/** Decisão do Personagem Opex no descanso: quantos dados de vida rolar e o que trocar (texto livre ou nada). */
export const opexRestDecisionSchema = z.object({
    dadosDeVida: z.number().int().min(0).max(30).optional().default(0),
    trocas: z.string().trim().max(4_000).nullable().optional().default(null),
    memorias: z.array(z.object({ titulo: z.string().trim().min(1), texto: z.string().trim().min(1) })).optional().default([]),
})
export type OpexRestDecision = z.infer<typeof opexRestDecisionSchema>

/** Resposta do Personagem Opex a um esclarecimento do Maddox nas trocas. */
export const opexRestReplySchema = z.object({ resposta: z.string().trim().max(4_000).nullable().optional().default(null) })
