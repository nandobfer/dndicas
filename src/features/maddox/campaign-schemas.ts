import { z } from "zod"
import {
    MADDOX_CAMPAIGN_NAME_MAX,
    MADDOX_CAMPAIGN_NAME_MIN,
    MADDOX_CHARACTER_NAME_MAX,
    MADDOX_CHARACTER_NAME_MIN,
    MADDOX_DENSITY_LEVELS,
    MADDOX_LEVEL_MAX,
    MADDOX_LEVEL_MIN,
    MADDOX_RIGOR_LEVELS,
} from "./constants"

/** Schemas das Campanhas Maddox (Maddox 1) — módulo PURO, usado pela tela e pelas rotas. */

const campaignName = z
    .string({ error: "Informe o nome da campanha" })
    .trim()
    .min(MADDOX_CAMPAIGN_NAME_MIN, { error: `O nome da campanha precisa de ao menos ${MADDOX_CAMPAIGN_NAME_MIN} caracteres` })
    .max(MADDOX_CAMPAIGN_NAME_MAX, { error: `O nome da campanha pode ter no máximo ${MADDOX_CAMPAIGN_NAME_MAX} caracteres` })

const rigor = z.enum(MADDOX_RIGOR_LEVELS, { error: "Escolha um grau de rigor válido" })

/** CD dos testes pedidos pelo Maddox (Maddox 5): `false` = secreta (padrão), `true` = visível aos jogadores. */
const showCheckDc = z.boolean({ error: "Escolha se a CD dos testes fica visível" })

/** Imagens automáticas nas cenas (Maddox 10): `true` = valem as situações da aba do Maddox; `false` = só o pedido manual. */
const sceneImages = z.boolean({ error: "Escolha se as imagens nas cenas ficam ligadas" })

/** Densidade das narrações (DND-22): quanto texto o narrador escreve a cada narração. */
const density = z.enum(MADDOX_DENSITY_LEVELS, { error: "Escolha uma densidade válida" })

export const createMaddoxCampaignSchema = z.strictObject({ name: campaignName, rigor, showCheckDc: showCheckDc.optional(), sceneImages: sceneImages.optional(), density: density.optional() })
export type CreateMaddoxCampaignInput = z.infer<typeof createMaddoxCampaignSchema>

/** Nível inicial da mesa (graus com ficha): o dono ajusta antes de a campanha começar. */
const startingLevel = z.number({ error: "Escolha o nível inicial" }).int({ error: "Use um número inteiro" }).min(MADDOX_LEVEL_MIN, { error: `O nível vai de ${MADDOX_LEVEL_MIN} a ${MADDOX_LEVEL_MAX}` }).max(MADDOX_LEVEL_MAX, { error: `O nível vai de ${MADDOX_LEVEL_MIN} a ${MADDOX_LEVEL_MAX}` })

export const updateMaddoxCampaignSchema = z
    .strictObject({ name: campaignName.optional(), rigor: rigor.optional(), showCheckDc: showCheckDc.optional(), startingLevel: startingLevel.optional(), sceneImages: sceneImages.optional(), density: density.optional() })
    .refine((value) => value.name !== undefined || value.rigor !== undefined || value.showCheckDc !== undefined || value.startingLevel !== undefined || value.sceneImages !== undefined || value.density !== undefined, { error: "Nada para alterar" })
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
