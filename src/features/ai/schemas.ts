import { z } from "zod"
import { AI_IMAGE_PROVIDER_IDS, AI_TEXT_PROVIDER_IDS } from "@/lib/ai/providers"
import {
    DEFAULT_ENTITY_IMPORT_INSTRUCTIONS,
    DEFAULT_ENTITY_UNDERSTANDING_INSTRUCTIONS,
    DEFAULT_IMAGE_GENERATOR_INSTRUCTIONS,
    DEFAULT_MEMORY_SUMMARY_INSTRUCTIONS,
    ENTITY_UNDERSTANDING_TOOL_ROUNDS_DEFAULT,
    ENTITY_UNDERSTANDING_TOOL_ROUNDS_MAX,
    ENTITY_UNDERSTANDING_TOOL_ROUNDS_MIN,
    IMAGE_ASPECT_RATIOS,
    SUMMARY_MAX_LENGTH_DEFAULT,
    SUMMARY_MAX_LENGTH_MAX,
    SUMMARY_MAX_LENGTH_MIN,
} from "./constants"
import { opexMainModelSchema } from "@/features/opex-agent/schemas"

const instructionsField = z.string().trim().min(1, "Informe as instruções").max(8000, "Até 8.000 caracteres")

// ── Gerador de imagens ───────────────────────────────────────────────────────

/**
 * Agente "Gerador de imagens" (botão "Gerar com IA" das imagens, com o contexto da ficha ou do
 * formulário, e imagens da importação do 5etools) — mesmo schema na tela e na API.
 */
export const imageGeneratorSettingsSchema = z
    .object({
        enabled: z.boolean(),
        provider: z.enum(AI_IMAGE_PROVIDER_IDS).nullable(),
        model: z.string().trim().max(200).nullable(),
        instructions: instructionsField,
        defaultAspectRatio: z.enum(IMAGE_ASPECT_RATIOS),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.provider) ctx.addIssue({ code: "custom", path: ["provider"], message: "Selecione o provedor" })
        if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Selecione o modelo" })
    })

export type ImageGeneratorSettings = z.infer<typeof imageGeneratorSettingsSchema>

export const DEFAULT_IMAGE_GENERATOR_SETTINGS: ImageGeneratorSettings = {
    enabled: false,
    provider: null,
    model: null,
    instructions: DEFAULT_IMAGE_GENERATOR_INSTRUCTIONS,
    defaultAspectRatio: "1:1",
}

// ── Entender com IA ──────────────────────────────────────────────────────────

/**
 * Agente "Entender com IA" (chat por entidade com ferramentas de busca no catálogo). Usa os provedores
 * que executam ferramentas do app (os mesmos do Agente Opex), no formato do cartão de modelo dele.
 */
export const entityUnderstandingSettingsSchema = z
    .object({
        enabled: z.boolean(),
        main: opexMainModelSchema,
        instructions: instructionsField,
        maxToolRounds: z
            .number({ error: "Informe um número" })
            .int("Use um número inteiro")
            .min(ENTITY_UNDERSTANDING_TOOL_ROUNDS_MIN, `Mínimo ${ENTITY_UNDERSTANDING_TOOL_ROUNDS_MIN}`)
            .max(ENTITY_UNDERSTANDING_TOOL_ROUNDS_MAX, `Máximo ${ENTITY_UNDERSTANDING_TOOL_ROUNDS_MAX}`),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Selecione o provedor" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })

export type EntityUnderstandingSettings = z.infer<typeof entityUnderstandingSettingsSchema>

export const DEFAULT_ENTITY_UNDERSTANDING_SETTINGS: EntityUnderstandingSettings = {
    enabled: false,
    main: { provider: null, model: null, variant: null, temperature: null, maxOutputTokens: null },
    instructions: DEFAULT_ENTITY_UNDERSTANDING_INSTRUCTIONS,
    maxToolRounds: ENTITY_UNDERSTANDING_TOOL_ROUNDS_DEFAULT,
}

// ── Importador 5etools ───────────────────────────────────────────────────────

/** Agente "Importador 5etools" (tradução das entidades importadas e dos scripts de seed). */
export const entityImportSettingsSchema = z
    .object({
        enabled: z.boolean(),
        provider: z.enum(AI_TEXT_PROVIDER_IDS).nullable(),
        model: z.string().trim().max(200).nullable(),
        agent: z.string().trim().max(100).nullable(),
        variant: z.string().trim().max(50).nullable(),
        temperature: z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable(),
        maxOutputTokens: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(256, "Mínimo 256").max(65_536, "Máximo 65.536").nullable(),
        instructions: instructionsField,
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.provider) ctx.addIssue({ code: "custom", path: ["provider"], message: "Selecione o provedor" })
        if (!value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Selecione o modelo" })
    })

export type EntityImportSettings = z.infer<typeof entityImportSettingsSchema>

export const DEFAULT_ENTITY_IMPORT_SETTINGS: EntityImportSettings = {
    enabled: false,
    provider: null,
    model: null,
    agent: null,
    variant: null,
    temperature: null,
    maxOutputTokens: null,
    instructions: DEFAULT_ENTITY_IMPORT_INSTRUCTIONS,
}

// ── Resumo de memórias ───────────────────────────────────────────────────────

/**
 * Uso "Resumo de memórias" (formata e resume as memórias dos agentes) — mesmo schema na tela e na API.
 * Copiado do Opex; o provedor/modelo fica em `main`, no formato do cartão de modelo do Agente Opex.
 */
export const memorySummarySettingsSchema = z
    .object({
        enabled: z.boolean(),
        main: opexMainModelSchema,
        instructions: instructionsField,
        maxLength: z
            .number({ error: "Informe um número" })
            .int("Use um número inteiro")
            .min(SUMMARY_MAX_LENGTH_MIN, `Mínimo ${SUMMARY_MAX_LENGTH_MIN}`)
            .max(SUMMARY_MAX_LENGTH_MAX, `Máximo ${SUMMARY_MAX_LENGTH_MAX}`),
    })
    .superRefine((value, ctx) => {
        if (!value.enabled) return
        if (!value.main.provider) ctx.addIssue({ code: "custom", path: ["main", "provider"], message: "Selecione o provedor" })
        if (!value.main.model) ctx.addIssue({ code: "custom", path: ["main", "model"], message: "Selecione o modelo" })
    })

export type MemorySummarySettings = z.infer<typeof memorySummarySettingsSchema>

export const DEFAULT_MEMORY_SUMMARY_SETTINGS: MemorySummarySettings = {
    enabled: false,
    main: { provider: null, model: null, variant: null, temperature: null, maxOutputTokens: null },
    instructions: DEFAULT_MEMORY_SUMMARY_INSTRUCTIONS,
    maxLength: SUMMARY_MAX_LENGTH_DEFAULT,
}

/** Memória de um agente: o texto livre é formatado pelo Resumo de memórias antes de salvar. */
export const MEMORY_TEXT_MAX = 2000
export const memoryInputSchema = z.object({
    texto: z.string().trim().min(3, "Escreva a memória").max(MEMORY_TEXT_MAX, "Até 2.000 caracteres"),
})
export type MemoryInput = z.infer<typeof memoryInputSchema>
