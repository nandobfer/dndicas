/**
 * Provedores de IA (módulo PURO, usado pela tela e pelo servidor). Cada provedor é uma
 * integração-filha de "Provedores de IA" (`ai`) no catálogo de integrações.
 */

import type { IntegrationId } from "@/lib/integrations/catalog"

export const AI_PROVIDER_IDS = ["opencode", "gemini", "anthropic", "openai", "deepseek", "jev"] as const
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number]

/** Provedores que geram texto (usados pelos agentes Importador 5etools e Resumo de memórias). */
export const AI_TEXT_PROVIDER_IDS = ["opencode", "gemini", "anthropic", "openai", "deepseek"] as const
export type AiTextProviderId = (typeof AI_TEXT_PROVIDER_IDS)[number]

/** Provedores com modelos de IMAGEM (agente "Gerador de imagens"). */
export const AI_IMAGE_PROVIDER_IDS = ["gemini", "openai"] as const
export type AiImageProviderId = (typeof AI_IMAGE_PROVIDER_IDS)[number]

export function isAiImageProviderId(value: string): value is AiImageProviderId {
    return (AI_IMAGE_PROVIDER_IDS as readonly string[]).includes(value)
}

export interface AiProviderDef {
    readonly id: AiProviderId
    readonly integrationId: IntegrationId
    readonly name: string
    /** Gera texto para as features do app (streaming). O JEV decide de forma estruturada e não gera texto. */
    readonly supportsTextGeneration: boolean
    /** Aceita temperatura e máximo de tokens (o OpenCode ignora parâmetros de amostragem). */
    readonly supportsSampling: boolean
    /** Sessões rodam com um agente do servidor (OpenCode). */
    readonly supportsAgent: boolean
    /** Rótulo da escolha de "variante" do modelo. */
    readonly variantLabel: string
}

export const AI_PROVIDERS: readonly AiProviderDef[] = [
    { id: "opencode", integrationId: "ai_opencode", name: "OpenCode", supportsTextGeneration: true, supportsSampling: false, supportsAgent: true, variantLabel: "Variante" },
    { id: "gemini", integrationId: "ai_gemini", name: "Gemini", supportsTextGeneration: true, supportsSampling: true, supportsAgent: false, variantLabel: "Raciocínio (thinking)" },
    { id: "anthropic", integrationId: "ai_anthropic", name: "Anthropic", supportsTextGeneration: true, supportsSampling: true, supportsAgent: false, variantLabel: "Raciocínio" },
    { id: "openai", integrationId: "ai_openai", name: "OpenAI", supportsTextGeneration: true, supportsSampling: true, supportsAgent: false, variantLabel: "Esforço de raciocínio" },
    { id: "deepseek", integrationId: "ai_deepseek", name: "DeepSeek", supportsTextGeneration: true, supportsSampling: true, supportsAgent: false, variantLabel: "Raciocínio" },
    { id: "jev", integrationId: "ai_jev", name: "JEV", supportsTextGeneration: false, supportsSampling: false, supportsAgent: false, variantLabel: "Variante" },
]

export function getAiProvider(id: AiProviderId): AiProviderDef {
    return AI_PROVIDERS.find((provider) => provider.id === id)!
}

export function isAiProviderId(value: string): value is AiProviderId {
    return (AI_PROVIDER_IDS as readonly string[]).includes(value)
}

/** Provedor de texto? As features de texto só aceitam estes (o JEV fica de fora). */
export function isAiTextProviderId(value: string): value is AiTextProviderId {
    return (AI_TEXT_PROVIDER_IDS as readonly string[]).includes(value)
}

export function aiProviderOfIntegration(integrationId: IntegrationId): AiProviderDef | undefined {
    return AI_PROVIDERS.find((provider) => provider.integrationId === integrationId)
}

/** Modelo disponível num provedor. */
export interface AiModelDto {
    /** Id usado na chamada (OpenCode: `provedor/modelo`; Gemini: `gemini-…`). */
    id: string
    name: string
    /** Variantes aceitas (OpenCode: `variants` do modelo; Gemini: níveis de thinking; Anthropic, OpenAI e DeepSeek: nível de raciocínio). */
    variants: string[]
    /** Grupo exibido na lista (OpenCode: provedor de origem). */
    group: string | null
    contextWindow: number | null
    /** Sem custo por token (ex.: modelos gratuitos do OpenCode Zen). */
    free: boolean
}

/** Agente primário do servidor OpenCode. */
export interface AiAgentDto {
    id: string
    name: string
    description: string | null
}

/** Situação de um provedor para escolha nas features. */
export interface AiProviderStatusDto {
    id: AiProviderId
    integrationId: IntegrationId
    name: string
    configured: boolean
    /** Configurado e com o último teste verde ou amarelo. */
    connected: boolean
}

export const GEMINI_THINKING_LEVELS = ["low", "medium", "high"] as const

/** Níveis de raciocínio (opção `reasoning` da AI SDK) dos modelos que raciocinam na Anthropic, OpenAI e DeepSeek. */
export const AI_REASONING_LEVELS = ["low", "medium", "high"] as const
export type AiReasoningLevel = (typeof AI_REASONING_LEVELS)[number]

export function isAiReasoningLevel(value: string): value is AiReasoningLevel {
    return (AI_REASONING_LEVELS as readonly string[]).includes(value)
}
