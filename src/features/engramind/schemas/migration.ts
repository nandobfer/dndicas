import { z } from "zod"
import { AI_TEXT_PROVIDER_IDS } from "@/lib/ai/providers"

/** Contratos da aba "Migração" (DND-21): os mesmos schemas na tela e nas rotas. */

export const curatorRunSchema = z.object({
    provider: z.enum(AI_TEXT_PROVIDER_IDS, { error: "Escolha um provedor de texto configurado" }),
    model: z.string().trim().min(1, "Escolha o modelo").max(200),
    variant: z.string().trim().max(50).nullish(),
    agent: z.string().trim().max(100).nullish(),
})
export type CuratorRunInput = z.infer<typeof curatorRunSchema>

export const MIGRATION_REVIEW_STATUSES = ["pendente", "aprovada", "rejeitada"] as const
export type MigrationReviewStatus = (typeof MIGRATION_REVIEW_STATUSES)[number]

export const migrationItemPatchSchema = z.object({
    items: z
        .array(
            z.object({
                id: z.string().trim().min(1).max(40),
                status: z.enum(MIGRATION_REVIEW_STATUSES).optional(),
                texto: z.string().trim().min(1, "Escreva a memória").max(20_000).nullish(),
                categoria: z.string().trim().min(1).max(40).nullish(),
            }),
        )
        .min(1)
        .max(500),
})
export type MigrationItemPatch = z.infer<typeof migrationItemPatchSchema>

export const migrationBulkSchema = z.object({
    list: z.string().trim().min(1).max(60),
    status: z.enum(["aprovada", "rejeitada"]),
    /** Inclui as de revisão (`revisar_dono`); `descartar` nunca é aprovada em lote. */
    includeAttention: z.boolean().optional(),
})
export type MigrationBulkInput = z.infer<typeof migrationBulkSchema>

export const migrationCompactSchema = z.object({ combination: z.string().trim().min(1).max(80) })
export const migrationConfirmSchema = z.object({ confirm: z.literal(true, { error: "Confirme a operação" }) })
