import { z } from "zod"
import {
    MADDOX_CAMPAIGN_NAME_MAX,
    MADDOX_CAMPAIGN_NAME_MIN,
    MADDOX_COMBAT_DIFFICULTY_LEVELS,
    MADDOX_DENSITY_LEVELS,
    MADDOX_LEVEL_MAX,
    MADDOX_LEVEL_MIN,
    MADDOX_PROGRESSION_MODES,
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

/** Declarações dos outros jogadores no chat (DND-36): `true` = viram "Fulano declarou sua ação" (cada um vê a própria). */
const hidePlayerActions = z.boolean({ error: "Escolha se as ações dos outros jogadores ficam visíveis" })

/** PV dos inimigos no combate tático (DND-53): `false` = faixa de estado (padrão), `true` = números atual/máximo. */
const showEnemyHp = z.boolean({ error: "Escolha como o PV dos inimigos aparece" })

/** PV dos aliados NPC no combate tático (DND-53): `false` = faixa de estado (padrão), `true` = números atual/máximo. */
const showAllyHp = z.boolean({ error: "Escolha como o PV dos aliados aparece" })

/** Densidade das narrações (DND-22): quanto texto o narrador escreve a cada narração. */
const density = z.enum(MADDOX_DENSITY_LEVELS, { error: "Escolha uma densidade válida" })

/** Dificuldade dos combates (DND-42): balanceamento dos adversários; aceita em todo grau, usada só nos táticos. */
const combatDifficulty = z.enum(MADDOX_COMBAT_DIFFICULTY_LEVELS, { error: "Escolha uma dificuldade de combate válida" })

/** Nível inicial da mesa (graus com ficha): o dono ajusta antes de a campanha começar. */
const startingLevel = z.number({ error: "Escolha o nível inicial" }).int({ error: "Use um número inteiro" }).min(MADDOX_LEVEL_MIN, { error: `O nível vai de ${MADDOX_LEVEL_MIN} a ${MADDOX_LEVEL_MAX}` }).max(MADDOX_LEVEL_MAX, { error: `O nível vai de ${MADDOX_LEVEL_MIN} a ${MADDOX_LEVEL_MAX}` })
/** Progressão de nível (DND-56, graus com ficha): só na criação; depois, só leitura. */
const progression = z.enum(MADDOX_PROGRESSION_MODES, { error: "Escolha a progressão de nível" })

export const createMaddoxCampaignSchema = z.strictObject({ name: campaignName, rigor, showCheckDc: showCheckDc.optional(), sceneImages: sceneImages.optional(), hidePlayerActions: hidePlayerActions.optional(), showEnemyHp: showEnemyHp.optional(), showAllyHp: showAllyHp.optional(), density: density.optional(), combatDifficulty: combatDifficulty.optional(), startingLevel: startingLevel.optional(), progression: progression.optional() })
export type CreateMaddoxCampaignInput = z.infer<typeof createMaddoxCampaignSchema>

export const updateMaddoxCampaignSchema = z
    .strictObject({ name: campaignName.optional(), rigor: rigor.optional(), showCheckDc: showCheckDc.optional(), startingLevel: startingLevel.optional(), sceneImages: sceneImages.optional(), hidePlayerActions: hidePlayerActions.optional(), showEnemyHp: showEnemyHp.optional(), showAllyHp: showAllyHp.optional(), density: density.optional(), combatDifficulty: combatDifficulty.optional() })
    .refine((value) => value.name !== undefined || value.rigor !== undefined || value.showCheckDc !== undefined || value.startingLevel !== undefined || value.sceneImages !== undefined || value.hidePlayerActions !== undefined || value.showEnemyHp !== undefined || value.showAllyHp !== undefined || value.density !== undefined || value.combatDifficulty !== undefined, { error: "Nada para alterar" })
export type UpdateMaddoxCampaignInput = z.infer<typeof updateMaddoxCampaignSchema>

/** Nova tentativa do retrato do personagem (DND-31): corpo vazio. */
export const maddoxCharacterPortraitRetrySchema = z.strictObject({})
