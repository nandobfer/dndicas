import { z } from "zod"
import { MADDOX_LEVEL_MAX, MADDOX_LEVEL_MIN, MADDOX_STARTING_STAGE_MAX, MADDOX_ABILITY_METHODS, MADDOX_CAMPAIGN_NAME_MAX, MADDOX_CAMPAIGN_NAME_MIN, MADDOX_CHARACTER_NAME_MAX, MADDOX_INTERVIEW_MESSAGE_MAX, MADDOX_PROFILE_SECTIONS, MADDOX_SCRIPT_KINDS, MADDOX_SETTING_SECTIONS } from "./constants"

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

const score = z.number({ error: "Defina o valor do atributo" }).int({ error: "Use um número inteiro" }).min(1).max(30)

/** Envio do card de atributos (Maddox 5): método e os seis valores-base. */
export const maddoxAbilityScoresSubmitSchema = z.strictObject({
    method: z.enum(MADDOX_ABILITY_METHODS, { error: "Escolha o método" }),
    scores: z.strictObject({ strength: score, dexterity: score, constitution: score, intelligence: score, wisdom: score, charisma: score }),
})
export type MaddoxAbilityScoresSubmitInput = z.infer<typeof maddoxAbilityScoresSubmitSchema>

/** Rolagem e reinício das rolagens: corpo vazio (o servidor rola). */
export const maddoxAbilityRollSchema = z.strictObject({})

/** Rolagem do dado de vida de um nível no card de PV. */
export const maddoxHitPointRollSchema = z.strictObject({ nivel: z.number({ error: "Informe o nível" }).int().min(2).max(MADDOX_LEVEL_MAX) })

/** Envio do card de PV: "media" ou "rolagem" em cada nível do 2 ao N. */
export const maddoxHitPointsSubmitSchema = z.strictObject({ escolhas: z.record(z.string().regex(/^\d+$/), z.enum(["media", "rolagem"], { error: "Escolha média ou rolagem" })) })
export type MaddoxHitPointsSubmitInput = z.infer<typeof maddoxHitPointsSubmitSchema>

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
    /** Nível inicial da mesa (graus com ficha); fora de 1–20 ou ausente vira `null` sem invalidar o resto. */
    startingLevel: z.preprocess((value) => (typeof value === "number" && Number.isInteger(value) && value >= MADDOX_LEVEL_MIN && value <= MADDOX_LEVEL_MAX ? value : null), z.number().int().nullable()).optional().transform((value) => value ?? null),
    /** Estágio de experiência inicial (graus narrativos), cortado no limite. */
    startingStage: z.string().trim().nullable().optional().transform((value) => (value ? value.slice(0, MADDOX_STARTING_STAGE_MAX) : null)),
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
    /** História do personagem (Markdown), para o campo "História" da ficha. */
    history: optionalText(),
    personalityTraits: optionalText(),
    ideals: optionalText(),
    bonds: optionalText(),
    flaws: optionalText(),
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
