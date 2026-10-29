import { z } from "zod"
import { AI_TEXT_PROVIDER_IDS } from "@/lib/ai/providers"
import {
    DEFAULT_MADDOX_INSTRUCTIONS,
    DEFAULT_MADDOX_INTERVIEWER_INSTRUCTIONS,
    DEFAULT_MADDOX_PERSONA,
    MADDOX_INSTRUCTIONS_MAX,
    MADDOX_JEV_DECISIONS,
    MADDOX_PERSONA_MAX,
    MADDOX_SCRIPT_GUIDE_MAX,
    MADDOX_SCRIPT_KINDS,
    MADDOX_SCRIPT_NOTES_MAX,
    MADDOX_SCRIPT_TOPIC_MAX,
    MADDOX_SCRIPT_TOPICS_MAX,
    MADDOX_SESSION_SCOPES,
    type MaddoxJevDecision,
} from "./constants"

const providerFields = {
    provider: z.enum(AI_TEXT_PROVIDER_IDS).nullable(),
    model: z.string().trim().max(200).nullable(),
    /** Agente do OpenCode (os demais provedores gravam `null`). */
    agent: z.string().trim().max(100).nullable(),
    variant: z.string().trim().max(50).nullable(),
}

/** Modelo do Maddox (narrador): todos os provedores de texto, inclusive o OpenCode. */
export const maddoxMainModelSchema = z.object({
    ...providerFields,
    temperature: z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
    maxOutputTokens: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(256, "Mínimo 256").max(65_536, "Máximo 65.536").nullable(),
})
export type MaddoxMainModel = z.infer<typeof maddoxMainModelSchema>

/** Modelo do entrevistador (sem provedor = o mesmo do Maddox). */
export const maddoxInterviewerModelSchema = z.object(providerFields)
export type MaddoxInterviewerModel = z.infer<typeof maddoxInterviewerModelSchema>

export const maddoxAvatarSchema = z.object({
    /** URL da imagem (upload ou gerada); `null` = sem avatar. */
    url: z.string().trim().max(2000).nullable(),
    persona: z.string().trim().max(MADDOX_PERSONA_MAX, `Até ${MADDOX_PERSONA_MAX.toLocaleString("pt-BR")} caracteres`),
})
export type MaddoxAvatar = z.infer<typeof maddoxAvatarSchema>

export const maddoxOpencodeSchema = z.object({
    sessionScope: z.enum(MADDOX_SESSION_SCOPES),
    /** Exclui as sessões da campanha no OpenCode quando ela termina ou é arquivada. */
    deleteOnCampaignEnd: z.boolean(),
    /** Diretório das sessões no servidor OpenCode (vazio = o da integração). */
    directory: z.string().trim().max(500).nullable(),
})
export type MaddoxOpencodeSettings = z.infer<typeof maddoxOpencodeSchema>

export const maddoxJevSchema = z.object(Object.fromEntries(MADDOX_JEV_DECISIONS.map((decision) => [decision, z.boolean()])) as Record<MaddoxJevDecision, z.ZodBoolean>)
export type MaddoxJevSettings = z.infer<typeof maddoxJevSchema>

const instructionsField = z.string().trim().min(1, "Informe as instruções").max(MADDOX_INSTRUCTIONS_MAX, `Até ${MADDOX_INSTRUCTIONS_MAX.toLocaleString("pt-BR")} caracteres`)

/** Configuração do Agente Maddox — mesmo schema na tela e na API. */
export const maddoxSettingsSchema = z
    .object({
        enabled: z.boolean(),
        main: maddoxMainModelSchema,
        interviewer: maddoxInterviewerModelSchema,
        instructions: instructionsField,
        interviewerInstructions: instructionsField,
        avatar: maddoxAvatarSchema,
        opencode: maddoxOpencodeSchema,
        jev: maddoxJevSchema,
    })
    .superRefine((value, ctx) => {
        if (value.interviewer.provider && !value.interviewer.model) ctx.addIssue({ code: "custom", path: ["interviewer", "model"], message: "Selecione o modelo" })
        if (!value.enabled) return
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Selecione o provedor" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })
export type MaddoxSettings = z.infer<typeof maddoxSettingsSchema>

export const DEFAULT_MADDOX_SETTINGS: MaddoxSettings = {
    enabled: false,
    main: { provider: null, model: null, agent: null, variant: null, temperature: null, maxOutputTokens: null },
    interviewer: { provider: null, model: null, agent: null, variant: null },
    instructions: DEFAULT_MADDOX_INSTRUCTIONS,
    interviewerInstructions: DEFAULT_MADDOX_INTERVIEWER_INSTRUCTIONS,
    avatar: { url: null, persona: DEFAULT_MADDOX_PERSONA },
    opencode: { sessionScope: "campaign-and-interviews", deleteOnCampaignEnd: true, directory: null },
    jev: Object.fromEntries(MADDOX_JEV_DECISIONS.map((decision) => [decision, false])) as MaddoxJevSettings,
}

// ── Roteiros ─────────────────────────────────────────────────────────────────

export const maddoxScriptTopicSchema = z.object({
    id: z.string().trim().min(1).max(64),
    text: z.string().trim().min(1, "Informe o texto do tópico").max(MADDOX_SCRIPT_TOPIC_MAX, `Até ${MADDOX_SCRIPT_TOPIC_MAX} caracteres`),
    active: z.boolean(),
})

/** Tópicos sugeridos: lista ordenada (a ordem é a da lista), ids únicos. */
export const maddoxScriptTopicsSchema = z
    .array(maddoxScriptTopicSchema)
    .max(MADDOX_SCRIPT_TOPICS_MAX, `Até ${MADDOX_SCRIPT_TOPICS_MAX} tópicos`)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Cada tópico aparece uma vez no roteiro")

export const maddoxScriptGuideSchema = z
    .string()
    .trim()
    .min(1, "Escreva o guia da entrevista")
    .max(MADDOX_SCRIPT_GUIDE_MAX, `Até ${MADDOX_SCRIPT_GUIDE_MAX.toLocaleString("pt-BR")} caracteres`)

export const saveMaddoxScriptSchema = z.strictObject({
    guide: maddoxScriptGuideSchema,
    topics: maddoxScriptTopicsSchema,
    notes: z.string().trim().max(MADDOX_SCRIPT_NOTES_MAX, `Até ${MADDOX_SCRIPT_NOTES_MAX} caracteres`).default(""),
    /** Versão vigente na abertura do editor (conflito se outra gravação aconteceu). */
    version: z.number().int().nonnegative(),
})
export type SaveMaddoxScriptInput = z.infer<typeof saveMaddoxScriptSchema>

export const maddoxScriptKindSchema = z.enum(MADDOX_SCRIPT_KINDS)

// ── Avatar ───────────────────────────────────────────────────────────────────

export const generateMaddoxAvatarSchema = z.object({
    persona: z.string().trim().min(3, "Descreva a persona do Maddox").max(MADDOX_PERSONA_MAX, `Até ${MADDOX_PERSONA_MAX.toLocaleString("pt-BR")} caracteres`),
})
