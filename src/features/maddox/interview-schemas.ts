import { z } from "zod"
import { MADDOX_CAMPAIGN_NAME_MAX, MADDOX_CAMPAIGN_NAME_MIN, MADDOX_CHARACTER_NAME_MAX, MADDOX_INTERVIEW_MESSAGE_MAX, MADDOX_PROFILE_SECTIONS, MADDOX_SCRIPT_KINDS, MADDOX_SETTING_SECTIONS } from "./constants"

/** Schemas das entrevistas do Maddox (Maddox 2) — módulo PURO (tela, rotas e consolidação). */

export const maddoxInterviewKindSchema = z.enum(MADDOX_SCRIPT_KINDS)

export const maddoxInterviewMessageSchema = z.strictObject({
    content: z
        .string({ error: "Escreva sua resposta" })
        .trim()
        .min(1, { error: "Escreva sua resposta" })
        .max(MADDOX_INTERVIEW_MESSAGE_MAX, { error: `A resposta pode ter no máximo ${MADDOX_INTERVIEW_MESSAGE_MAX.toLocaleString("pt-BR")} caracteres` }),
})
export type MaddoxInterviewMessageInput = z.infer<typeof maddoxInterviewMessageSchema>

const section = z.string().trim().max(6000).default("")
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => value || null)

const sectionsObject = <T extends readonly { key: string }[]>(sections: T) =>
    z.object(Object.fromEntries(sections.map((item) => [item.key, section])) as Record<T[number]["key"], typeof section>)

/** Saída da consolidação do cenário (JSON gerado pelo entrevistador). */
export const scenarioConsolidationSchema = z.object({
    setting: sectionsObject(MADDOX_SETTING_SECTIONS),
    openingSituation: z.string().trim().min(1).max(6000),
    campaignName: z
        .string()
        .trim()
        .nullable()
        .optional()
        .transform((value) => (value && value.length >= MADDOX_CAMPAIGN_NAME_MIN && value.length <= MADDOX_CAMPAIGN_NAME_MAX ? value : null)),
})
export type ScenarioConsolidation = z.infer<typeof scenarioConsolidationSchema>

/** Atributo de 1 a 30; valor ausente, não inteiro ou fora do intervalo é descartado (`null`), sem invalidar o resto. */
const attribute = z.preprocess((value) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 30 ? value : null), z.number().int().nullable())

/** Ficha D&D básica (a partir do rigor Equilibrado). */
export const characterSheetSeedSchema = z.object({
    race: optionalText(100),
    class: optionalText(100),
    subclass: optionalText(100),
    origin: optionalText(100),
    appearance: optionalText(4000),
    age: optionalText(40),
    height: optionalText(40),
    weight: optionalText(40),
    eyes: optionalText(40),
    skin: optionalText(40),
    hair: optionalText(40),
    attributes: z
        .object({ strength: attribute, dexterity: attribute, constitution: attribute, intelligence: attribute, wisdom: attribute, charisma: attribute })
        .nullable()
        .optional()
        .transform((value) => value ?? null),
})
export type CharacterSheetSeed = z.infer<typeof characterSheetSeedSchema>

/** Saída da consolidação do personagem. */
export const characterConsolidationSchema = z.object({
    name: z.string().trim().min(2).max(MADDOX_CHARACTER_NAME_MAX).nullable().optional().transform((value) => value || null),
    profile: sectionsObject(MADDOX_PROFILE_SECTIONS),
    sheet: characterSheetSeedSchema.nullable().optional().transform((value) => value ?? null),
})
export type CharacterConsolidation = z.infer<typeof characterConsolidationSchema>
