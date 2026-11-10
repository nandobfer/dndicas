import type { LanguageModel, ModelMessage, streamText } from "ai"
import { randomUUID } from "node:crypto"
import { loggerFor } from "@/lib/logger"
import { getAiProvider, isAiReasoningLevel, type AiProviderId } from "./providers"
import { AiProviderError } from "./errors"
import { recordAiConsumption } from "./consumption"
import { stepCostUsd } from "./step-cost"

export { stepCostUsd } from "./step-cost"

/**
 * Geração em streaming pela Vercel AI SDK — SOMENTE servidor. Ponto único das features: nenhuma
 * feature fala com OpenCode, OpenCode Go, Gemini, Anthropic, OpenAI ou DeepSeek diretamente.
 *
 * A SDK `ai` e os clientes dos provedores entram sob demanda (`await import`): no topo, eles custam
 * centenas de ms de carga em todo módulo (e arquivo de teste) que só alcança este ponto de entrada.
 */

export interface AiStreamRequest {
    provider: AiProviderId
    model: string
    instructions: string
    /** Texto único do usuário. Ignorado quando `messages` vem preenchido. */
    prompt: string
    /** Conversa (histórico + última mensagem do usuário), alternativa ao `prompt`. */
    messages?: ModelMessage[]
    /**
     * Só OpenCode: fixa uma sessão existente (modo `existing`). O OpenCode guarda o histórico e só a
     * última mensagem do usuário é enviada; a sessão não é excluída no `dispose`.
     */
    opencodeSessionId?: string | null
    /**
     * Só OpenCode Go: chave estável da conversa (ex.: `opex:<sessão>`), que vira o `x-opencode-session`
     * (roteamento e cache de prompt no Go). Ausente = um id novo por geração.
     */
    sessionKey?: string | null
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
    /** Custo em USD informado pelo provedor (OpenCode e OpenCode Go). */
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
    anthropic: async () => (await import("./anthropic")).createAnthropicProvider(),
    openai: async () => (await import("./openai")).createOpenaiProvider(),
    deepseek: async () => (await import("./deepseek")).createDeepseekProvider(),
} as const satisfies Partial<Record<AiProviderId, () => Promise<(modelId: string) => LanguageModel>>>

/** Modelo da AI SDK pronto para o provedor (exportado para o loop de ferramentas do Agente Opex). */
export async function prepareModel(request: Pick<AiStreamRequest, "provider" | "model" | "variant" | "agent" | "title" | "opencodeSessionId" | "sessionKey">): Promise<PreparedModel> {
    if (request.provider === "opencode") {
        const { createOpencodeProvider } = await import("./opencode")
        const { provider, directory } = await createOpencodeProvider()
        const pinned = request.opencodeSessionId || null
        const model = provider(request.model, {
            agent: request.agent || undefined,
            variant: request.variant || undefined,
            sessionTitle: request.title ?? "Opex",
            location: directory ? { directory } : undefined,
            ...(pinned ? { sessionId: pinned, sessionMode: "existing" as const, createNewSession: false } : { createNewSession: true }),
            // Formulários (pergunta do agente) não têm quem responda: cancela e encerra o turno.
            formPolicy: "cancel",
            logger: false,
        })
        return { model, dispose: () => provider.dispose() }
    }
    if (request.provider === "gemini") {
        const { createGeminiProvider } = await import("./gemini")
        const google = await createGeminiProvider()
        return {
            model: google(request.model),
            providerOptions: request.variant ? { google: { thinkingConfig: { thinkingLevel: request.variant, includeThoughts: false } } } : undefined,
            dispose: noDispose,
        }
    }
    if (request.provider === "opencode-go") {
        // Gateway por API key: não abre sessão no servidor OpenCode do host.
        const { createOpencodeGoProvider } = await import("./opencode-go")
        const go = await createOpencodeGoProvider({ sessionKey: request.sessionKey })
        return {
            model: go(request.model),
            reasoning: request.variant && isAiReasoningLevel(request.variant) ? request.variant : undefined,
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

/** Status HTTP estruturado de um erro de chamada da AI SDK (`APICallError.statusCode`). */
function errorStatus(error: unknown): number | null {
    if (!error || typeof error !== "object") return null
    const { statusCode, lastError } = error as { statusCode?: unknown; lastError?: unknown }
    if (typeof statusCode === "number") return statusCode
    // As tentativas esgotadas da AI SDK chegam como `RetryError`, com a última falha em `lastError`.
    return lastError && lastError !== error ? errorStatus(lastError) : null
}

/** Mensagens acionáveis do OpenCode Go, pelo status HTTP (nunca pelo texto, que pode trazer detalhes do provedor). */
function describeOpencodeGoError(status: number | null, model?: string): string | null {
    if (status === 401) return "O OpenCode Go recusou a API key: confira a chave oc_sk_… em Integrações › Provedores de IA › OpenCode Go."
    if (status === 403) {
        const target = model ? `o modelo ${model}` : "o modelo"
        return `O OpenCode Go recusou ${target} (HTTP 403): modelos grátis (*-free) só funcionam dentro do OpenCode, e os modelos DeepSeek exigem a região Global habilitada em Settings › Privacy da conta OpenCode. Troque o modelo ou ajuste a conta.`
    }
    if (status === 429) return "Limite da assinatura OpenCode Go atingido (HTTP 429): aguarde a renovação do allowance, habilite o Extra Usage no OpenCode ou troque o provedor do agente."
    return null
}

export function describeAiError(error: unknown, context?: { provider?: AiProviderId; model?: string }): string {
    if (error instanceof AiProviderError) return error.message
    if (context?.provider === "opencode-go") {
        const specific = describeOpencodeGoError(errorStatus(error), context.model)
        if (specific) return specific
    }
    const message = error instanceof Error ? error.message : String(error)
    if (/401|unauthori[sz]ed|api key/i.test(message)) return `Credencial recusada pelo provedor: ${message}`
    if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)) return `Provedor inacessível: ${message}`
    return message || "Falha desconhecida do provedor de IA"
}

/** Erro de um passo do OpenCode (`providerMetadata.opencode.error`), classificado pelo `type`/`status` estruturados. */
export interface OpencodeStepError {
    type?: unknown
    message?: unknown
    status?: unknown
}

/** Mensagem acionável do erro de um passo do OpenCode; tipos sem tratamento próprio mantêm a mensagem original. */
export function describeOpencodeStepError(error: OpencodeStepError, model: string): string {
    const message = typeof error.message === "string" && error.message ? error.message : "O modelo terminou com erro"
    if (error.type === "provider.quota") {
        const status = typeof error.status === "number" ? ` (HTTP ${error.status})` : ""
        return `O provedor recusou o modelo ${model} por cota ou plano${status}: ${message} Troque o modelo nas configurações do agente ou confira o plano do provedor no OpenCode.`
    }
    return message
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
        yield { type: "error", message: describeAiError(error, request) }
        return
    }
    let reasoningAnnounced = false
    let failed = false
    let costUsd: number | null = null
    // OpenCode informa falhas do modelo só nos metadados do passo (`outcome: failed`), sem parte `error`.
    let stepError: OpencodeStepError | null = null
    try {
        const { streamText } = await import("ai")
        const result = streamText({
            model: prepared.model,
            instructions: request.instructions,
            ...(request.messages?.length ? { messages: request.messages } : { prompt: request.prompt }),
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
                    const meta = part.providerMetadata?.opencode as { error?: OpencodeStepError } | undefined
                    const cost = stepCostUsd(part.providerMetadata)
                    if (cost !== null) costUsd = (costUsd ?? 0) + cost
                    if (meta?.error && typeof meta.error === "object") stepError = meta.error
                    const go = part.providerMetadata?.["opencode-go"] as { billingSource?: unknown; allowance?: unknown; listCost?: unknown } | undefined
                    if (go && (go.allowance != null || go.billingSource != null)) {
                        log.debug({ provider: request.provider, model: request.model, billingSource: go.billingSource, allowance: go.allowance, listCost: go.listCost }, "[ai] allowance do OpenCode Go")
                    }
                    break
                }
                case "error":
                    failed = true
                    yield { type: "error", message: describeAiError(part.error, request) }
                    break
                case "abort":
                    failed = true
                    break
                case "finish":
                    if (!failed && part.finishReason === "error") {
                        failed = true
                        yield { type: "error", message: describeAiError(new Error(stepError ? describeOpencodeStepError(stepError, request.model) : "O modelo terminou com erro")) }
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
            yield { type: "error", message: describeAiError(error, request) }
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
