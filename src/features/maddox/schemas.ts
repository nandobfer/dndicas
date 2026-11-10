import { z } from "zod"
import { AI_TEXT_PROVIDER_IDS } from "@/lib/ai/providers"
import { IMAGE_ASPECT_RATIOS } from "@/features/ai/constants"
import {
    DEFAULT_MADDOX_INSTRUCTIONS,
    DEFAULT_MADDOX_INTERVIEWER_INSTRUCTIONS,
    DEFAULT_MADDOX_OPEX_CHARACTER_INSTRUCTIONS,
    MADDOX_OPEX_NPC_LIMIT_MAX,
    DEFAULT_MADDOX_COMBAT_PREP_INSTRUCTIONS,
    DEFAULT_MADDOX_COMBAT_ADJUST_INSTRUCTIONS,
    DEFAULT_MADDOX_PERSONA,
    MADDOX_INSTRUCTIONS_MAX,
    MADDOX_JEV_DECISIONS,
    MADDOX_PERSONA_MAX,
    MADDOX_RIGOR_LEVEL_DEFS,
    MADDOX_RIGOR_LEVELS,
    MADDOX_SCRIPT_GUIDE_MAX,
    MADDOX_SCRIPT_KINDS,
    MADDOX_SCRIPT_NOTES_MAX,
    MADDOX_SCRIPT_TOPIC_MAX,
    MADDOX_SCRIPT_TOPICS_MAX,
    MADDOX_SCENE_IMAGE_CUSTOM_DESCRIPTION_MAX,
    MADDOX_SCENE_IMAGE_CUSTOM_LABEL_MAX,
    MADDOX_SCENE_IMAGE_CUSTOM_MAX,
    MADDOX_SCENE_IMAGE_DAILY_DEFAULT,
    MADDOX_SCENE_IMAGE_DAILY_MAX,
    MADDOX_SCENE_IMAGE_GAP_DEFAULT,
    MADDOX_SCENE_IMAGE_GAP_MAX,
    MADDOX_SCENE_IMAGE_SITUATIONS,
    MADDOX_SCENE_IMAGE_STYLE_MAX,
    type MaddoxJevDecision,
    type MaddoxSceneImageSituation,
} from "./constants"

const providerFields = {
    provider: z.enum(AI_TEXT_PROVIDER_IDS, { error: "Provedor inválido" }).nullable(),
    model: z.string().trim().max(200, "O nome do modelo é longo demais (até 200 caracteres)").nullable(),
    /** Agente do OpenCode (os demais provedores gravam `null`). */
    agent: z.string().trim().max(100, "O nome do agente do OpenCode é longo demais (até 100 caracteres)").nullable(),
    variant: z.string().trim().max(50, "O nome da variante é longo demais (até 50 caracteres)").nullable(),
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

/**
 * Modelo próprio de um nível de rigor (DND-32): provedor, modelo, variante e agente. Temperatura e máximo de
 * tokens vêm sempre da seleção padrão do Maddox.
 */
export const maddoxRigorModelSchema = z.object({
    rigor: z.enum(MADDOX_RIGOR_LEVELS, { error: "Escolha um grau de rigor válido" }),
    ...providerFields,
})
export type MaddoxRigorModel = z.infer<typeof maddoxRigorModelSchema>

const rigorModelListSchema = z.array(maddoxRigorModelSchema).max(MADDOX_RIGOR_LEVELS.length, `Até ${MADDOX_RIGOR_LEVELS.length} configurações por rigor`)

/** Modelos por nível de rigor do narrador, do entrevistador e do Personagem Opex; nível sem bloco = a seleção padrão do cartão. */
export const maddoxRigorModelsSchema = z.object({ main: rigorModelListSchema, interviewer: rigorModelListSchema, opexCharacter: rigorModelListSchema })
export type MaddoxRigorModels = z.infer<typeof maddoxRigorModelsSchema>
export type MaddoxRigorModelTarget = keyof MaddoxRigorModels

export const maddoxAvatarSchema = z.object({
    /** URL da imagem (upload ou gerada); `null` = sem avatar. */
    url: z.string().trim().max(2000, "A URL do avatar é longa demais (até 2.000 caracteres)").nullable(),
    persona: z.string().trim().max(MADDOX_PERSONA_MAX, `Até ${MADDOX_PERSONA_MAX.toLocaleString("pt-BR")} caracteres`),
})
export type MaddoxAvatar = z.infer<typeof maddoxAvatarSchema>

export const maddoxOpencodeSchema = z.object({
    /**
     * Exclui as sessões da campanha no OpenCode quando ela termina, é arquivada ou deixa de existir (pela rotina
     * `maddox-opencode-sessions-cleanup`).
     */
    deleteOnCampaignEnd: z.boolean({ error: "Informe se as sessões são excluídas ao encerrar a campanha" }),
    /** Diretório das sessões no servidor OpenCode (vazio = o da integração). */
    directory: z.string().trim().max(500, "O diretório é longo demais (até 500 caracteres)").nullable(),
    /**
     * URL pública do MCP do Maddox que o OpenCode chama para as ferramentas do narrador (Maddox 4). Vazio = a URL
     * do app (`NEXT_PUBLIC_APP_URL`/`AUTH_URL`) + `/api/maddox/mcp`.
     */
    mcpUrl: z
        .string()
        .trim()
        .max(500, "A URL é longa demais (até 500 caracteres)")
        .refine((value) => /^https?:\/\/\S+$/i.test(value), "Informe uma URL começando com http:// ou https://")
        .nullable(),
})
export type MaddoxOpencodeSettings = z.infer<typeof maddoxOpencodeSchema>

export const maddoxJevSchema = z.object(Object.fromEntries(MADDOX_JEV_DECISIONS.map((decision) => [decision, z.boolean({ error: "Chave do JEV inválida" })])) as Record<MaddoxJevDecision, z.ZodBoolean>)
export type MaddoxJevSettings = z.infer<typeof maddoxJevSchema>

/** Situação personalizada (texto livre do admin): a descrição orienta o Maddox e o JEV. */
export const maddoxSceneImageCustomSchema = z.object({
    id: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1, "Dê um nome à situação").max(MADDOX_SCENE_IMAGE_CUSTOM_LABEL_MAX, `Até ${MADDOX_SCENE_IMAGE_CUSTOM_LABEL_MAX} caracteres`),
    description: z.string().trim().min(1, "Descreva quando a situação acontece").max(MADDOX_SCENE_IMAGE_CUSTOM_DESCRIPTION_MAX, `Até ${MADDOX_SCENE_IMAGE_CUSTOM_DESCRIPTION_MAX} caracteres`),
    active: z.boolean(),
})
export type MaddoxSceneImageCustom = z.infer<typeof maddoxSceneImageCustomSchema>

/** Imagens nas cenas (Maddox 10): situações, frequência, proporção e estilo. */
export const maddoxSceneImagesSchema = z.object({
    enabled: z.boolean({ error: "Informe se as imagens nas cenas estão ligadas" }),
    situations: z.object(Object.fromEntries(MADDOX_SCENE_IMAGE_SITUATIONS.map((situation) => [situation, z.boolean({ error: "Chave da situação inválida" })])) as Record<MaddoxSceneImageSituation, z.ZodBoolean>),
    custom: z
        .array(maddoxSceneImageCustomSchema)
        .max(MADDOX_SCENE_IMAGE_CUSTOM_MAX, `Até ${MADDOX_SCENE_IMAGE_CUSTOM_MAX} situações personalizadas`)
        .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Cada situação aparece uma vez"),
    minNarrationsBetween: z
        .number({ error: "Informe um número" })
        .int("Use um número inteiro")
        .min(0, "Mínimo 0")
        .max(MADDOX_SCENE_IMAGE_GAP_MAX, `Máximo ${MADDOX_SCENE_IMAGE_GAP_MAX}`),
    maxPerDay: z
        .number({ error: "Informe um número" })
        .int("Use um número inteiro")
        .min(1, "Mínimo 1")
        .max(MADDOX_SCENE_IMAGE_DAILY_MAX, `Máximo ${MADDOX_SCENE_IMAGE_DAILY_MAX}`),
    aspectRatio: z.enum(IMAGE_ASPECT_RATIOS, { error: "Escolha a proporção" }),
    style: z.string().trim().max(MADDOX_SCENE_IMAGE_STYLE_MAX, `Até ${MADDOX_SCENE_IMAGE_STYLE_MAX.toLocaleString("pt-BR")} caracteres`),
})
export type MaddoxSceneImagesSettings = z.infer<typeof maddoxSceneImagesSchema>

export const DEFAULT_MADDOX_SCENE_IMAGES: MaddoxSceneImagesSettings = {
    enabled: false,
    situations: Object.fromEntries(MADDOX_SCENE_IMAGE_SITUATIONS.map((situation) => [situation, false])) as MaddoxSceneImagesSettings["situations"],
    custom: [],
    minNarrationsBetween: MADDOX_SCENE_IMAGE_GAP_DEFAULT,
    maxPerDay: MADDOX_SCENE_IMAGE_DAILY_DEFAULT,
    aspectRatio: "16:9",
    style: "",
}

const instructionsField = z.string().trim().min(1, "Informe as instruções").max(MADDOX_INSTRUCTIONS_MAX, `Até ${MADDOX_INSTRUCTIONS_MAX.toLocaleString("pt-BR")} caracteres`)

/** Configuração do Agente Maddox — mesmo schema na tela e na API. */
export const maddoxSettingsSchema = z
    .object({
        enabled: z.boolean({ error: "Informe se o Agente Maddox está ativo" }),
        main: maddoxMainModelSchema,
        interviewer: maddoxInterviewerModelSchema,
        /** Modelo do Personagem Opex (DND-26); sem provedor = o mesmo do Maddox. */
        opexCharacter: maddoxInterviewerModelSchema,
        rigorModels: maddoxRigorModelsSchema,
        instructions: instructionsField,
        interviewerInstructions: instructionsField,
        opexCharacterInstructions: instructionsField,
        /** NPCs Opex por campanha (DND-27): `null` = sem limite; 0 desliga a promoção. */
        opexNpcLimit: z
            .number({ error: "Informe um número inteiro" })
            .int("Informe um número inteiro")
            .min(0, "Use 0 ou mais")
            .max(MADDOX_OPEX_NPC_LIMIT_MAX, `Até ${MADDOX_OPEX_NPC_LIMIT_MAX}`)
            .nullable(),
        /** DND-41: critério da preparação da mesa de combate e dos pedidos de ajuste. */
        combatPrepInstructions: instructionsField,
        combatAdjustInstructions: instructionsField,
        avatar: maddoxAvatarSchema,
        opencode: maddoxOpencodeSchema,
        jev: maddoxJevSchema,
        sceneImages: maddoxSceneImagesSchema,
    })
    .superRefine((value, ctx) => {
        if (value.interviewer.provider && !value.interviewer.model) ctx.addIssue({ code: "custom", path: ["interviewer", "model"], message: "Selecione o modelo" })
        if (value.opexCharacter.provider && !value.opexCharacter.model) ctx.addIssue({ code: "custom", path: ["opexCharacter", "model"], message: "Selecione o modelo" })
        for (const target of ["main", "interviewer", "opexCharacter"] as const) {
            const seen = new Set<string>()
            value.rigorModels[target].forEach((block, index) => {
                if (seen.has(block.rigor)) ctx.addIssue({ code: "custom", path: ["rigorModels", target, index, "rigor"], message: `Já existe uma configuração para o rigor ${MADDOX_RIGOR_LEVEL_DEFS[block.rigor].label}` })
                seen.add(block.rigor)
                if (!block.provider) ctx.addIssue({ code: "custom", path: ["rigorModels", target, index, "provider"], message: "Selecione o provedor" })
                if (!block.model) ctx.addIssue({ code: "custom", path: ["rigorModels", target, index, "model"], message: "Selecione o modelo" })
            })
        }
        if (!value.enabled) return
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Selecione o provedor" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })
export type MaddoxSettings = z.infer<typeof maddoxSettingsSchema>

export const DEFAULT_MADDOX_SETTINGS: MaddoxSettings = {
    enabled: false,
    main: { provider: null, model: null, agent: null, variant: null, temperature: null, maxOutputTokens: null },
    interviewer: { provider: null, model: null, agent: null, variant: null },
    opexCharacter: { provider: null, model: null, agent: null, variant: null },
    rigorModels: { main: [], interviewer: [], opexCharacter: [] },
    instructions: DEFAULT_MADDOX_INSTRUCTIONS,
    interviewerInstructions: DEFAULT_MADDOX_INTERVIEWER_INSTRUCTIONS,
    opexCharacterInstructions: DEFAULT_MADDOX_OPEX_CHARACTER_INSTRUCTIONS,
    opexNpcLimit: null,
    combatPrepInstructions: DEFAULT_MADDOX_COMBAT_PREP_INSTRUCTIONS,
    combatAdjustInstructions: DEFAULT_MADDOX_COMBAT_ADJUST_INSTRUCTIONS,
    avatar: { url: null, persona: DEFAULT_MADDOX_PERSONA },
    opencode: { deleteOnCampaignEnd: true, directory: null, mcpUrl: null },
    jev: Object.fromEntries(MADDOX_JEV_DECISIONS.map((decision) => [decision, false])) as MaddoxJevSettings,
    sceneImages: DEFAULT_MADDOX_SCENE_IMAGES,
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
