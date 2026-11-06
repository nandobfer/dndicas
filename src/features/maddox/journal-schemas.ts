import { z } from "zod"
import { MADDOX_CAMPAIGN_MEMORY_KINDS, MADDOX_QUEST_STATUSES } from "./constants"

/** Tamanho do termo da busca do Diário da campanha. */
export const MADDOX_JOURNAL_QUERY_MIN = 2
export const MADDOX_JOURNAL_QUERY_MAX = 100

const cursor = z
    .string()
    .regex(/^[a-f0-9]{24}$/i, "Cursor inválido")
    .optional()

export const maddoxJournalSearchSchema = z.object({
    q: z
        .string()
        .trim()
        .min(MADDOX_JOURNAL_QUERY_MIN, `Digite ao menos ${MADDOX_JOURNAL_QUERY_MIN} caracteres para buscar.`)
        .max(MADDOX_JOURNAL_QUERY_MAX, `A busca aceita até ${MADDOX_JOURNAL_QUERY_MAX} caracteres.`),
})

export const maddoxJournalNpcsSchema = z.object({ cursor })

export const maddoxJournalMemoriesSchema = z.object({
    kind: z.enum(MADDOX_CAMPAIGN_MEMORY_KINDS, { message: `Tipo inválido. Use um destes: ${MADDOX_CAMPAIGN_MEMORY_KINDS.join(", ")}.` }),
    status: z.enum(MADDOX_QUEST_STATUSES, { message: `Situação inválida. Use uma destas: ${MADDOX_QUEST_STATUSES.join(", ")}.` }).optional(),
    /** Cursor opaco da rede de memórias (as anotações vêm do Engramind). */
    cursor: z.string().trim().min(1).max(500, "Cursor inválido").optional(),
})

/** Filtro da aba Imagens do diário (DND-22): cenas (narração, fim de batalha e pedido manual) ou retratos de NPC. */
export const MADDOX_JOURNAL_IMAGE_KINDS = ["todas", "cenas", "retratos"] as const
export type MaddoxJournalImageKind = (typeof MADDOX_JOURNAL_IMAGE_KINDS)[number]

export const maddoxJournalImagesSchema = z.object({
    kind: z.enum(MADDOX_JOURNAL_IMAGE_KINDS, { message: `Filtro inválido. Use um destes: ${MADDOX_JOURNAL_IMAGE_KINDS.join(", ")}.` }).optional(),
    cursor,
})

export type MaddoxJournalMemoriesQuery = z.infer<typeof maddoxJournalMemoriesSchema>
