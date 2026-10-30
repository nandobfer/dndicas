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

// Texto gerado pelo modelo não tem teto de tamanho: um campo longo nunca invalida a consolidação inteira
// (limites da ficha são tratados ao gravar, sem perder o texto do perfil).
const section = z.string().trim().default("")
const optionalText = () => z.string().trim().nullable().optional().transform((value) => value || null)

const sectionsObject = <T extends readonly { key: string }[]>(sections: T) =>
    z.object(Object.fromEntries(sections.map((item) => [item.key, section])) as Record<T[number]["key"], typeof section>)

/** Saída da consolidação do cenário (JSON gerado pelo entrevistador). */
export const scenarioConsolidationSchema = z.object({
    setting: sectionsObject(MADDOX_SETTING_SECTIONS),
    openingSituation: z.string().trim().min(1),
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
    race: optionalText(),
    class: optionalText(),
    subclass: optionalText(),
    origin: optionalText(),
    appearance: optionalText(),
    age: optionalText(),
    height: optionalText(),
    weight: optionalText(),
    eyes: optionalText(),
    skin: optionalText(),
    hair: optionalText(),
    attributes: z
        .object({ strength: attribute, dexterity: attribute, constitution: attribute, intelligence: attribute, wisdom: attribute, charisma: attribute })
        .nullable()
        .optional()
        .transform((value) => value ?? null),
})
export type CharacterSheetSeed = z.infer<typeof characterSheetSeedSchema>

/** Saída da consolidação do personagem. */
export const characterConsolidationSchema = z.object({
    /** Nome combinado; fora de 2..MAX caracteres é ignorado (fica o nome do esboço), sem invalidar o resto. */
    name: z
        .string()
        .trim()
        .nullable()
        .optional()
        .transform((value) => (value && value.length >= 2 && value.length <= MADDOX_CHARACTER_NAME_MAX ? value : null)),
    profile: sectionsObject(MADDOX_PROFILE_SECTIONS),
    sheet: characterSheetSeedSchema.nullable().optional().transform((value) => value ?? null),
})
export type CharacterConsolidation = z.infer<typeof characterConsolidationSchema>
