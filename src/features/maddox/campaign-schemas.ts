import { z } from "zod"
import {
    MADDOX_CAMPAIGN_NAME_MAX,
    MADDOX_CAMPAIGN_NAME_MIN,
    MADDOX_CHARACTER_NAME_MAX,
    MADDOX_CHARACTER_NAME_MIN,
    MADDOX_RIGOR_LEVELS,
} from "./constants"

/** Schemas das Campanhas Maddox (Maddox 1) — módulo PURO, usado pela tela e pelas rotas. */

const campaignName = z
    .string({ error: "Informe o nome da campanha" })
    .trim()
    .min(MADDOX_CAMPAIGN_NAME_MIN, { error: `O nome da campanha precisa de ao menos ${MADDOX_CAMPAIGN_NAME_MIN} caracteres` })
    .max(MADDOX_CAMPAIGN_NAME_MAX, { error: `O nome da campanha pode ter no máximo ${MADDOX_CAMPAIGN_NAME_MAX} caracteres` })

const rigor = z.enum(MADDOX_RIGOR_LEVELS, { error: "Escolha um grau de rigor válido" })

export const createMaddoxCampaignSchema = z.strictObject({ name: campaignName, rigor })
export type CreateMaddoxCampaignInput = z.infer<typeof createMaddoxCampaignSchema>

export const updateMaddoxCampaignSchema = z
    .strictObject({ name: campaignName.optional(), rigor: rigor.optional() })
    .refine((value) => value.name !== undefined || value.rigor !== undefined, { error: "Nada para alterar" })
export type UpdateMaddoxCampaignInput = z.infer<typeof updateMaddoxCampaignSchema>

export const maddoxCharacterDraftSchema = z.strictObject({
    name: z
        .string({ error: "Informe o nome do personagem" })
        .trim()
        .min(MADDOX_CHARACTER_NAME_MIN, { error: `O nome do personagem precisa de ao menos ${MADDOX_CHARACTER_NAME_MIN} caracteres` })
        .max(MADDOX_CHARACTER_NAME_MAX, { error: `O nome do personagem pode ter no máximo ${MADDOX_CHARACTER_NAME_MAX} caracteres` }),
    portraitUrl: z
        .string({ error: "Retrato inválido" })
        .trim()
        .max(2000, { error: "Endereço do retrato muito longo" })
        .refine((value) => value === "" || value.startsWith("/") || /^https?:\/\//.test(value), { error: "Endereço do retrato inválido" })
        .nullable()
        .optional(),
})
export type MaddoxCharacterDraftInput = z.infer<typeof maddoxCharacterDraftSchema>
