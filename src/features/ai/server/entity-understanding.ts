import { stepCountIs, streamText } from "ai"
import { randomUUID } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { recordAiConsumption } from "@/lib/ai/consumption"
import { describeAiError, prepareModel, samplingOptions } from "@/lib/ai/stream"
import { stepCostUsd } from "@/lib/ai/step-cost"
import { loggerFor } from "@/lib/logger"
import {
    buildEntityUnderstandingHistory,
    buildEntityUnderstandingSystemInstruction,
    toEntityUnderstandingModelMessages,
} from "@/features/entity-understanding/services/entity-understanding-prompt"
import { createEntityUnderstandingTools } from "@/features/entity-understanding/services/entity-understanding-tools"
import type { EntityUnderstandingChatRequest } from "@/features/entity-understanding/types/entity-understanding.types"
import { ENTITY_UNDERSTANDING_CONSUMPTION_ORIGIN } from "../constants"
import { availabilityOfEntityUnderstanding, loadEntityUnderstandingSettings } from "./settings"
import { memoryBlock } from "./memory-block"

/**
 * Agente "Entender com IA": chat por entidade com as ferramentas de busca no catálogo, no provedor e
 * modelo configurados (Integrações › Provedores de IA › Entender com IA). Substitui o antigo
 * `chatWithToolsStream` fixo no Gemini; sem configuração não há fallback (409 com o motivo).
 */

export type EntityUnderstandingChunk = { type: "text"; text: string } | { type: "error"; message: string }

const log = loggerFor({ module: "ai", feature: "entity-understanding" })

/** Confere a disponibilidade antes de abrir o stream (409 pt-BR quando indisponível). */
export async function prepareEntityUnderstanding() {
    const { settings } = await loadEntityUnderstandingSettings()
    const availability = await availabilityOfEntityUnderstanding(settings)
    if (!availability.available || !settings.main.provider || !settings.main.model) {
        throw new DomainError(409, availability.reason ?? "O \"Entender com IA\" não está configurado.", "AI_FEATURE_UNAVAILABLE")
    }
    return { settings, provider: settings.main.provider, model: settings.main.model }
}

/** Gera a resposta em streaming (texto). Nunca lança: falhas viram um `error` final. */
export async function* streamEntityUnderstanding(
    input: EntityUnderstandingChatRequest,
    prepared: Awaited<ReturnType<typeof prepareEntityUnderstanding>>,
    options: { userId?: string; signal?: AbortSignal } = {},
): AsyncGenerator<EntityUnderstandingChunk> {
    const { settings, provider, model } = prepared
    const request = { provider, model, variant: settings.main.variant, temperature: settings.main.temperature, maxOutputTokens: settings.main.maxOutputTokens }
    let ready: Awaited<ReturnType<typeof prepareModel>>
    try {
        // Conversa = usuário + entidade: o OpenCode Go reaproveita o cache de prompt entre as perguntas.
        const sessionKey = options.userId ? `entity-understanding:${options.userId}:${input.entityType}:${input.entityId}` : null
        ready = await prepareModel({ ...request, title: "Entender com IA", sessionKey })
    } catch (error) {
        yield { type: "error", message: describeAiError(error, request) }
        return
    }
    try {
        const result = streamText({
            model: ready.model,
            instructions: buildEntityUnderstandingSystemInstruction(settings.instructions, await memoryBlock("entity-understanding")),
            messages: toEntityUnderstandingModelMessages(buildEntityUnderstandingHistory(input)),
            tools: createEntityUnderstandingTools(),
            stopWhen: stepCountIs(settings.maxToolRounds + 1),
            abortSignal: options.signal,
            providerOptions: ready.providerOptions,
            ...(ready.reasoning ? { reasoning: ready.reasoning } : {}),
            ...samplingOptions(request),
        })
        let costUsd: number | null = null
        for await (const part of result.fullStream) {
            if (part.type === "text-delta" && part.text) yield { type: "text", text: part.text }
            else if (part.type === "finish-step") {
                const cost = stepCostUsd(part.providerMetadata)
                if (cost !== null) costUsd = (costUsd ?? 0) + cost
            } else if (part.type === "error") {
                yield { type: "error", message: describeAiError(part.error, request) }
                return
            } else if (part.type === "finish") {
                await recordAiConsumption({
                    dedupKey: `stream:${randomUUID()}`,
                    provider,
                    origin: ENTITY_UNDERSTANDING_CONSUMPTION_ORIGIN,
                    subject: `${input.entityType}:${input.entityId}`,
                    model,
                    inputTokens: part.totalUsage.inputTokens ?? null,
                    outputTokens: part.totalUsage.outputTokens ?? null,
                    totalTokens: part.totalUsage.totalTokens ?? null,
                    costUsd,
                })
            }
        }
    } catch (error) {
        if (!options.signal?.aborted) {
            log.warn({ provider, model, userId: options.userId, err: error instanceof Error ? error.message : error }, "[ai] falha no Entender com IA")
            yield { type: "error", message: describeAiError(error, request) }
        }
    } finally {
        await ready.dispose().catch(() => undefined)
    }
}
