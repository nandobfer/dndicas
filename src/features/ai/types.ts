import type { AiUsage } from "@/lib/ai/stream"
import type { EntityImportSettings, EntityUnderstandingSettings, ImageGeneratorSettings } from "./schemas"

export type { AiAgentDto, AiModelDto, AiProviderStatusDto } from "@/lib/ai/providers"

/** Pode ser usada agora? Sem `available`, `reason` explica (botão desabilitado com o motivo). */
export interface AiFeatureAvailability {
    available: boolean
    reason: string | null
}

/** Configuração de uma feature com a disponibilidade calculada pelo servidor. */
export interface AiFeatureSettingsDto<T> {
    settings: T
    /** Nada salvo ainda: valores iniciais do código. */
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}

export type ImageGeneratorSettingsDto = AiFeatureSettingsDto<ImageGeneratorSettings>
export type EntityUnderstandingSettingsDto = AiFeatureSettingsDto<EntityUnderstandingSettings>
export type EntityImportSettingsDto = AiFeatureSettingsDto<EntityImportSettings>

/** Evento de geração repassado ao navegador (mesma forma do `streamAi`). */
export type AiGenerationEvent =
    | { type: "start"; provider: string; model: string; agent: string | null }
    | { type: "delta"; text: string }
    | { type: "reasoning" }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error" }
    | { type: "notice"; message: string }
    | { type: "done"; finishReason: string; usage: AiUsage; durationMs: number }
    | { type: "error"; message: string }

/** Memória exibida na lista compacta de um agente. */
export interface MemoryDto {
    id: string
    texto: string
    resumo: string
    /** Mantido do Ciliar/crm (lá, memórias do contato); no DnDicas toda memória é escrita por um administrador ou pelo agente a pedido dele. */
    origem?: "agente" | "usuario"
    autor: string | null
    criadaEm: string
    atualizadaEm: string
}

export interface MemoryMutationResult {
    memoria: MemoryDto
    /** `false` quando o Resumo de memórias estava indisponível e o texto foi salvo como escrito. */
    formatadaPorIa: boolean
}

export interface MemorySummarySettingsDto {
    settings: import("./schemas").MemorySummarySettings
    isDefault: boolean
    availability: AiFeatureAvailability
    updatedAt: string | null
}
