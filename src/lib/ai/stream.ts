import { streamText, type LanguageModel } from "ai"
import { randomUUID } from "node:crypto"
import { loggerFor } from "@/lib/logger"
import { createAnthropicProvider } from "./anthropic"
import { createDeepseekProvider } from "./deepseek"
import { createGeminiProvider } from "./gemini"
import { createOpenaiProvider } from "./openai"
import { createOpencodeProvider } from "./opencode"
import { getAiProvider, isAiReasoningLevel, type AiProviderId } from "./providers"
import { AiProviderError } from "./errors"
import { recordAiConsumption } from "./consumption"

/**
 * Geração em streaming pela Vercel AI SDK — SOMENTE servidor. Ponto único das features: nenhuma
 * feature fala com OpenCode, Gemini, Anthropic, OpenAI ou DeepSeek diretamente.
 */

export interface AiStreamRequest {
    provider: AiProviderId
    model: string
    instructions: string
    prompt: string
    /** OpenCode: variante do modelo; Gemini: nível de thinking; Anthropic, OpenAI e DeepSeek: nível de raciocínio. */
    variant?: string | null
    /** Só OpenCode. */
    agent?: string | null
    /** Só provedores com amostragem (o OpenCode ignora). */
    temperature?: number | null
    maxOutputTokens?: number | null
    /** Título da sessão criada no OpenCode. */
    title?: string
    signal?: AbortSignal
    /** Contexto do painel de consumo: origem (feature) e referência. Ausente = não medir. */
    consumption?: { origin: string; subject?: string | null }
}

export interface AiUsage {
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    /** Custo em USD informado pelo provedor (OpenCode). */
    costUsd: number | null
}

/** Evento do stream entregue às features (e repassado ao navegador como NDJSON). */
export type AiStreamEvent =
    | { type: "delta"; text: string }
    | { type: "reasoning" }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error" }
    | { type: "notice"; message: string }
    | { type: "done"; finishReason: string; usage: AiUsage; durationMs: number }
    | { type: "error"; message: string }

const log = loggerFor({ module: "ai" })

type StreamTextOptions = Parameters<typeof streamText>[0]

export interface PreparedModel {
    model: LanguageModel
    providerOptions?: StreamTextOptions["providerOptions"]
    /** Nível de raciocínio da AI SDK (Anthropic, OpenAI e DeepSeek). */
    reasoning?: StreamTextOptions["reasoning"]
    dispose: () => Promise<void>
}

const noDispose = async () => {}

/** Provedores diretos por API key: a AI SDK traduz o `reasoning` para cada um. */
const DIRECT_PROVIDERS = {
    anthropic: createAnthropicProvider,
    openai: createOpenaiProvider,
    deepseek: createDeepseekProvider,
} as const satisfies Partial<Record<AiProviderId, () => Promise<(modelId: string) => LanguageModel>>>

/** Modelo da AI SDK pronto para o provedor (exportado para o loop de ferramentas do Agente Opex). */
export async function prepareModel(request: Pick<AiStreamRequest, "provider" | "model" | "variant" | "agent" | "title">): Promise<PreparedModel> {
    if (request.provider === "opencode") {
        const { provider, directory } = await createOpencodeProvider()
        const model = provider(request.model, {
            agent: request.agent || undefined,
            variant: request.variant || undefined,
            sessionTitle: request.title ?? "Opex",
            location: directory ? { directory } : undefined,
            createNewSession: true,
            // Formulários (pergunta do agente) não têm quem responda: cancela e encerra o turno.
            formPolicy: "cancel",
            logger: false,
        })
        return { model, dispose: () => provider.dispose() }
    }
    if (request.provider === "gemini") {
        const google = await createGeminiProvider()
        return {
            model: google(request.model),
            providerOptions: request.variant ? { google: { thinkingConfig: { thinkingLevel: request.variant, includeThoughts: false } } } : undefined,
            dispose: noDispose,
        }
    }
    if (request.provider === "jev") throw new AiProviderError("O JEV decide de forma estruturada e não gera texto")
    const provider = await DIRECT_PROVIDERS[request.provider]()
    return {
        model: provider(request.model),
        reasoning: request.variant && isAiReasoningLevel(request.variant) ? request.variant : undefined,
        dispose: noDispose,
    }
}

/** Temperatura e máximo de tokens só nos provedores com amostragem. A Anthropic não aceita temperatura
 * com raciocínio ligado; nos modelos de raciocínio da OpenAI a AI SDK descarta o que não se aplica. */
export function samplingOptions(request: Pick<AiStreamRequest, "provider" | "variant" | "temperature" | "maxOutputTokens">): Pick<StreamTextOptions, "temperature" | "maxOutputTokens"> {
    if (!getAiProvider(request.provider).supportsSampling) return {}
    const skipTemperature = request.provider === "anthropic" && Boolean(request.variant)
    return {
        ...(request.temperature != null && !skipTemperature ? { temperature: request.temperature } : {}),
        ...(request.maxOutputTokens != null ? { maxOutputTokens: request.maxOutputTokens } : {}),
    }
}

function numberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function describeAiError(error: unknown): string {
    if (error instanceof AiProviderError) return error.message
    const message = error instanceof Error ? error.message : String(error)
    if (/401|unauthori[sz]ed|api key/i.test(message)) return `Credencial recusada pelo provedor: ${message}`
    if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)) return `Provedor inacessível: ${message}`
    return message || "Falha desconhecida do provedor de IA"
}

/** Gera em streaming; nunca lança — falhas viram um evento `error` final. */
export async function* streamAi(request: AiStreamRequest): AsyncGenerator<AiStreamEvent> {
    const startedAt = Date.now()
    // Identidade única por geração: o caminho de streaming gera no máximo um `done` por chamada.
    const consumptionKey = request.consumption ? `stream:${randomUUID()}` : null
    let prepared: PreparedModel
    try {
        prepared = await prepareModel(request)
    } catch (error) {
        yield { type: "error", message: describeAiError(error) }
        return
    }
    let reasoningAnnounced = false
    let failed = false
    let costUsd: number | null = null
    // OpenCode informa falhas do modelo só nos metadados do passo (`outcome: failed`), sem parte `error`.
    let stepError: string | null = null
    try {
        const result = streamText({
            model: prepared.model,
            instructions: request.instructions,
            prompt: request.prompt,
            abortSignal: request.signal,
            providerOptions: prepared.providerOptions,
            ...(prepared.reasoning ? { reasoning: prepared.reasoning } : {}),
            ...samplingOptions(request),
        })
        for await (const part of result.fullStream) {
            switch (part.type) {
                case "text-delta":
                    if (part.text) yield { type: "delta", text: part.text }
                    break
                case "reasoning-delta":
                    if (!reasoningAnnounced) {
                        reasoningAnnounced = true
                        yield { type: "reasoning" }
                    }
                    break
                case "tool-call":
                    yield { type: "tool", id: part.toolCallId, name: part.toolName, state: "running" }
                    break
                case "tool-result":
                    yield { type: "tool", id: part.toolCallId, name: part.toolName, state: "done" }
                    break
                case "tool-error":
                    yield { type: "tool", id: part.toolCallId, name: part.toolName, state: "error" }
                    break
                case "tool-approval-request":
                    yield { type: "notice", message: "O agente pediu aprovação para usar uma ferramenta; aprovações não são suportadas aqui. Ajuste as permissões do agente no OpenCode." }
                    break
                case "finish-step": {
                    const meta = part.providerMetadata?.opencode as { cost?: unknown; error?: { message?: unknown } } | undefined
                    const cost = numberOrNull(meta?.cost)
                    if (cost !== null) costUsd = (costUsd ?? 0) + cost
                    if (typeof meta?.error?.message === "string") stepError = meta.error.message
                    break
                }
                case "error":
                    failed = true
                    yield { type: "error", message: describeAiError(part.error) }
                    break
                case "abort":
                    failed = true
                    break
                case "finish":
                    if (!failed && part.finishReason === "error") {
                        failed = true
                        yield { type: "error", message: describeAiError(new Error(stepError ?? "O modelo terminou com erro")) }
                    } else if (!failed) {
                        const usage = {
                            inputTokens: numberOrNull(part.totalUsage.inputTokens),
                            outputTokens: numberOrNull(part.totalUsage.outputTokens),
                            totalTokens: numberOrNull(part.totalUsage.totalTokens),
                            costUsd,
                        }
                        if (consumptionKey && request.consumption) {
                            await recordAiConsumption({
                                dedupKey: consumptionKey,
                                provider: request.provider,
                                origin: request.consumption.origin,
                                subject: request.consumption.subject ?? null,
                                model: request.model,
                                ...usage,
                            })
                        }
                        yield {
                            type: "done",
                            finishReason: part.finishReason,
                            durationMs: Date.now() - startedAt,
                            usage,
                        }
                    }
                    break
            }
        }
    } catch (error) {
        if (!request.signal?.aborted) {
            log.warn({ provider: request.provider, model: request.model, err: error instanceof Error ? error.message : error }, "[ai] falha na geração")
            yield { type: "error", message: describeAiError(error) }
        }
    } finally {
        await prepared.dispose().catch(() => undefined)
    }
}

/**
 * Geração sem streaming sobre o `streamAi` (mesmo caminho, mesma medição de consumo): junta os
 * deltas e devolve o texto. Lança `AiProviderError` com a mensagem do provedor quando a geração
 * falha — para usos em lote (ex.: tradução do Importador 5etools).
 */
export async function generateAiText(request: AiStreamRequest): Promise<{ text: string; usage: AiUsage | null; durationMs: number }> {
    let text = ""
    for await (const event of streamAi(request)) {
        if (event.type === "delta") text += event.text
        else if (event.type === "error") throw new AiProviderError(event.message)
        else if (event.type === "done") return { text, usage: event.usage, durationMs: event.durationMs }
    }
    if (request.signal?.aborted) throw new AiProviderError("Geração interrompida")
    return { text, usage: null, durationMs: 0 }
}
