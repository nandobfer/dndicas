import { getIntegrationDef } from "@/lib/integrations/catalog"
import { getIntegration, isIntegrationConfigured } from "@/lib/integrations/config"
import { clearAiCatalogCache, listAiAgents, listAiModels } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { getOpencodeInfo } from "@/lib/ai/opencode"
import { AI_PROVIDERS } from "@/lib/ai/providers"
import { describeFetchError, fail, stepSignal, warnResult, type IntegrationTester } from "@/features/integrations/testers/types"

/** Testes de conexão dos provedores de IA e do hub "Provedores de IA". */

function failFrom(error: unknown): never {
    fail(error instanceof AiProviderError ? error.message : describeFetchError(error))
}

export const testOpencode: IntegrationTester = async ({ emit, signal }) => {
    const resolved = await getIntegration("ai_opencode")
    if (!resolved.values.baseUrl) fail("Sem URL do servidor: informe o endereço do opencode serve")
    if (!resolved.values.password) emit("warn", "Sem senha: o opencode serve 2.x exige autenticação Basic em todas as rotas")
    clearAiCatalogCache()

    emit("step", `GET ${resolved.values.baseUrl}/api/info`)
    const info = await getOpencodeInfo(stepSignal(signal, 15_000)).catch(failFrom)
    emit("success", `OpenCode ${info.version}`)

    emit("step", "GET /api/model")
    const models = await listAiModels("opencode", { fresh: true, signal: stepSignal(signal, 20_000) }).catch(failFrom)
    const providers = new Set(models.map((model) => model.group)).size
    emit(models.length ? "success" : "warn", `${models.length} modelo(s) de ${providers} provedor(es)`)

    emit("step", "GET /api/agent")
    const agents = await listAiAgents({ fresh: true, signal: stepSignal(signal, 15_000) }).catch(failFrom)
    emit("info", `Agentes: ${agents.map((agent) => agent.id).join(", ") || "nenhum"}`)

    if (!models.length) return warnResult("Conectado, mas sem modelos habilitados: conecte um provedor no OpenCode")
    return `OpenCode ${info.version} com ${models.length} modelo(s)`
}

export const testGemini: IntegrationTester = async ({ emit, signal }) => {
    const resolved = await getIntegration("ai_gemini")
    if (!resolved.values.apiKey) fail("Sem API key: cadastre a chave do Google AI Studio em Campos privados")
    clearAiCatalogCache()
    emit("step", "GET /v1beta/models")
    const models = await listAiModels("gemini", { fresh: true, signal: stepSignal(signal, 20_000) }).catch(failFrom)
    emit(models.length ? "success" : "warn", `${models.length} modelo(s) de texto disponível(is)`)
    if (!models.length) return warnResult("API key válida, mas nenhum modelo de texto disponível")
    return `API key válida; ${models.length} modelo(s)`
}

/** Provedores diretos por API key: o teste lista os modelos de texto. */
const API_KEY_INTEGRATIONS = { anthropic: "ai_anthropic", openai: "ai_openai", deepseek: "ai_deepseek" } as const

function apiKeyModelsTester(providerId: keyof typeof API_KEY_INTEGRATIONS, keyHint: string, endpoint: string): IntegrationTester {
    return async ({ emit, signal }) => {
        const resolved = await getIntegration(API_KEY_INTEGRATIONS[providerId])
        if (!resolved.values.apiKey) fail(`Sem API key: cadastre a chave ${keyHint} em Campos privados`)
        clearAiCatalogCache()
        emit("step", `GET ${endpoint}`)
        const models = await listAiModels(providerId, { fresh: true, signal: stepSignal(signal, 20_000) }).catch(failFrom)
        emit(models.length ? "success" : "warn", `${models.length} modelo(s) de texto disponível(is)`)
        if (!models.length) return warnResult("API key válida, mas nenhum modelo de texto disponível")
        return `API key válida; ${models.length} modelo(s)`
    }
}

export const testAnthropic = apiKeyModelsTester("anthropic", "do Claude Console", "/v1/models")
export const testOpenai = apiKeyModelsTester("openai", "da plataforma OpenAI", "/v1/models")
export const testDeepseek = apiKeyModelsTester("deepseek", "da plataforma DeepSeek", "/models")

export const testJev: IntegrationTester = async ({ emit, signal }) => {
    const resolved = await getIntegration("ai_jev")
    if (!resolved.values.apiKey) fail("Sem API key: cadastre a chave da TypeSafe em Campos privados")
    clearAiCatalogCache()
    emit("step", "GET /v1/models")
    const models = await listAiModels("jev", { fresh: true, signal: stepSignal(signal, 20_000) }).catch(failFrom)
    emit(models.length ? "success" : "warn", `${models.length} modelo(s) disponível(is)`)
    if (!models.length) return warnResult("API key válida, mas nenhum modelo disponível")
    return `API key válida; ${models.length} modelo(s)`
}

/** Hub: testa cada provedor configurado (gravando o status de cada um) e resume. */
export const testAiHub: IntegrationTester = async ({ emit, signal }) => {
    const { runIntegrationTest } = await import("@/features/integrations/services/integration-test-runner")
    let configured = 0
    let connected = 0
    for (const provider of AI_PROVIDERS) {
        const resolved = await getIntegration(provider.integrationId)
        if (!isIntegrationConfigured(getIntegrationDef(provider.integrationId), resolved)) {
            emit("info", `${provider.name}: não configurado`)
            continue
        }
        configured++
        emit("step", `Testando ${provider.name}`)
        const result = await runIntegrationTest(provider.integrationId, {
            source: "manual",
            signal,
            emit: (level, message) => emit(level, `  ${provider.name}: ${message}`),
        })
        if (result.ok) connected++
        emit(result.ok ? "success" : "error", `${provider.name}: ${result.message}`)
    }
    if (configured === 0) fail("Nenhum provedor configurado: configure ao menos um provedor na aba Provedores")
    if (connected === 0) fail("Nenhum provedor de IA conectado")
    if (connected < configured) return warnResult(`${connected} de ${configured} provedor(es) conectado(s)`)
    return `${connected} provedor(es) de IA conectado(s)`
}
