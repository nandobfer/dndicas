import { getIntegrationConfig, getInternalBaseUrl } from "@/lib/integrations/config"
import type { IntegrationId } from "@/lib/integrations/catalog"
import { describeSchedule } from "@/lib/integrations/schedule"
import { CronJobState } from "@/lib/db/models/CronJobState"
import { dbConnect } from "@/lib/db"
import { getRawPusherServer } from "@/lib/pusher/server"
import { MCP_ENDPOINT_PATH, PUBLIC_API_SPEC_PATH } from "@/lib/public-api/paths"
import { testAiHub, testAnthropic, testDeepseek, testGemini, testJev, testOpenai, testOpencode } from "@/features/ai/server/testers"
import { verifyConnection } from "@/lib/email/mailer"
import { checkBucket } from "@/lib/storage/s3"
import { User } from "@/features/users/models/user"
import { describeFetchError, fail, stepSignal, warnResult, type IntegrationTester } from "./types"

// ---------------------------------------------------------------------------
// Pusher: GET /channels
// ---------------------------------------------------------------------------

const testPusher: IntegrationTester = async ({ emit }) => {
    const pusherConfig = await getIntegrationConfig("pusher")
    const target = pusherConfig.mode === "host" ? `host próprio ${pusherConfig.url ?? ""}`.trim() : `cluster ${pusherConfig.cluster}`
    emit("step", `Autenticando na API REST do Pusher (GET /channels, ${target})`)
    let client: Awaited<ReturnType<typeof getRawPusherServer>>
    try {
        client = await getRawPusherServer()
    } catch (error) {
        fail(describeFetchError(error))
    }
    const res = await client.get({ path: "/channels" }).catch((error: unknown) => fail(`Pusher recusou: ${describeFetchError(error)}`))
    if (!res.ok) fail(`Pusher respondeu HTTP ${res.status}`)
    const body = (await res.json().catch(() => ({}))) as { channels?: Record<string, unknown> }
    const count = Object.keys(body.channels ?? {}).length
    emit("success", `Pusher respondeu HTTP ${res.status}; ${count} canal(is) ocupado(s)`)
    return "Credenciais do Pusher válidas"
}

// ---------------------------------------------------------------------------
// API dndicas: especificação OpenAPI + servidor MCP + tokens MCP ativos
// ---------------------------------------------------------------------------

const testInternalApi: IntegrationTester = async ({ emit, signal }) => {
    const base = await getInternalBaseUrl()
    const url = `${base}${PUBLIC_API_SPEC_PATH}`
    emit("step", `GET ${url}`)
    let res: Response
    try {
        res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: stepSignal(signal, 20_000) })
    } catch (error) {
        fail(`Não foi possível chamar a própria API: ${describeFetchError(error)}`)
    }
    if (!res.ok) fail(`A especificação respondeu HTTP ${res.status}`)
    const spec = (await res.json().catch(() => null)) as { openapi?: string; paths?: Record<string, unknown> } | null
    if (!spec?.openapi?.startsWith("3.")) fail("A resposta não é uma especificação OpenAPI 3.x")
    emit("success", `Especificação OpenAPI ${spec.openapi} com ${Object.keys(spec.paths ?? {}).length} caminho(s)`)

    const warnings: string[] = []
    const mcpUrl = `${base}${MCP_ENDPOINT_PATH}`
    emit("step", `POST ${mcpUrl} (initialize)`)
    const mcp = await fetch(mcpUrl, {
        method: "POST",
        headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "dndicas-integrations-test", version: "1.0.0" } },
        }),
        cache: "no-store",
        signal: stepSignal(signal, 20_000),
    }).catch((error: unknown) => {
        warnings.push("servidor MCP inacessível")
        emit("warn", `Servidor MCP inacessível: ${describeFetchError(error)}`)
        return null
    })
    if (mcp) {
        const text = await mcp.text().catch(() => "")
        const name = /"serverInfo"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/.exec(text)?.[1]
        if (mcp.ok && name) emit("success", `Servidor MCP respondeu: ${name}`)
        else {
            warnings.push("servidor MCP não respondeu ao initialize")
            emit("warn", `Servidor MCP respondeu HTTP ${mcp.status} sem identificação`)
        }
    }

    await dbConnect()
    const tokens = await User.countDocuments({ mcpTokenHash: { $exists: true, $nin: [null, ""] }, deleted: { $ne: true } })
    emit("info", `${tokens} usuário(s) com token MCP ativo (gerado em /profile)`)
    return warnings.length ? warnResult(`API documentada com restrição: ${warnings.join("; ")}`) : "API documentada e servidor MCP disponível"
}

// ---------------------------------------------------------------------------
// Crons: segredo + estado do agendador
// ---------------------------------------------------------------------------

const testCrons: IntegrationTester = async ({ emit }) => {
    const config = await getIntegrationConfig("crons")
    if (!config.cronSecret) fail("Cron secret não configurado: as rotas /api/routines/* recusarão toda chamada")
    emit("success", "Cron secret configurado")
    emit("info", "Disparo: tick interno (processo persistente)")

    if (!config.schedulerEnabled) {
        emit("warn", "Agendador desligado: nenhuma rotina será disparada")
    } else {
        emit("success", "Agendador ativo")
    }

    await dbConnect()
    const states = await CronJobState.find({}).lean()
    const byId = new Map(states.map((state) => [state.jobId, state]))
    let failures = 0
    for (const job of config.jobs) {
        const state = byId.get(job.id)
        const next = state?.nextRunAt ? new Date(state.nextRunAt).toISOString() : "ainda não agendada"
        const status = state?.lastStatus === "error" ? "erro na última execução" : state?.lastStatus === "ok" ? "última execução OK" : "sem execuções"
        if (state?.lastStatus === "error") failures++
        emit(
            !job.enabled ? "info" : state?.lastStatus === "error" ? "warn" : "info",
            `• ${job.label}: ${job.enabled ? describeSchedule(job.schedule) : "desativada"} — ${status}; próxima: ${next}`,
        )
    }
    if (!config.schedulerEnabled) fail("Agendador desligado")
    return failures > 0 ? `Agendador ativo; ${failures} rotina(s) com erro na última execução` : "Agendador ativo e rotinas em dia"
}

// ---------------------------------------------------------------------------
// SMTP: transporter.verify()
// ---------------------------------------------------------------------------

const testSmtp: IntegrationTester = async ({ emit }) => {
    const config = await getIntegrationConfig("smtp")
    if (!config.host) fail("Host SMTP não configurado (envios estão em modo simulado)")
    emit("step", `Conectando em ${config.host}:${config.port}${config.port === 465 ? " (TLS)" : ""}`)
    try {
        await verifyConnection()
    } catch (error) {
        fail(`Servidor SMTP recusou: ${describeFetchError(error)}`)
    }
    emit("success", "Servidor SMTP aceitou a conexão e a autenticação")
    return "SMTP pronto para enviar e-mails"
}

// ---------------------------------------------------------------------------
// Storage S3: HeadBucket
// ---------------------------------------------------------------------------

const testStorage: IntegrationTester = async ({ emit }) => {
    const config = await getIntegrationConfig("storage_s3")
    if (!config.endpoint || !config.accessKey || !config.secretKey) fail("Endpoint ou credenciais do Storage não configurados")
    emit("step", `Verificando o bucket "${config.bucket}" em ${config.endpoint}`)
    try {
        await checkBucket()
    } catch (error) {
        fail(`Bucket inacessível: ${describeFetchError(error)}`)
    }
    emit("success", `Bucket "${config.bucket}" acessível`)
    return "Storage S3 acessível"
}

// ---------------------------------------------------------------------------
// Autenticação Google: credenciais OAuth (troca de código inválido no token endpoint)
// ---------------------------------------------------------------------------

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

const testGoogleAuth: IntegrationTester = async ({ emit, signal }) => {
    const config = await getIntegrationConfig("google_auth")
    if (!config.clientId || !config.clientSecret) fail("Client ID ou Client secret não configurados: o login com Google fica oculto")
    if (!config.clientId.endsWith(".apps.googleusercontent.com")) emit("warn", "O Client ID não termina em .apps.googleusercontent.com")
    emit("step", `POST ${GOOGLE_TOKEN_URL} (código de teste, sem login real)`)
    let res: Response
    try {
        res = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code: "dndicas-connection-test",
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: "http://localhost",
            }),
            cache: "no-store",
            signal: stepSignal(signal, 20_000),
        })
    } catch (error) {
        fail(`Não foi possível conectar ao Google: ${describeFetchError(error)}`)
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string }
    // Com credenciais válidas o Google recusa só o código de teste (invalid_grant/redirect).
    if (body.error === "invalid_client" || body.error === "unauthorized_client") fail(`O Google recusou as credenciais: ${body.error_description ?? body.error}`)
    if (body.error && body.error !== "invalid_grant" && body.error !== "redirect_uri_mismatch") {
        return warnResult(`Resposta inesperada do Google: ${body.error_description ?? body.error}`)
    }
    emit("success", "Client ID e Client secret aceitos pelo Google")
    emit("info", "Confirme no console do Google o redirecionamento autorizado: <URL do app>/api/auth/callback/google")
    return "Credenciais OAuth do Google válidas"
}

// ---------------------------------------------------------------------------
// Analytics (Umami): o script responde
// ---------------------------------------------------------------------------

const testUmami: IntegrationTester = async ({ emit, signal }) => {
    const config = await getIntegrationConfig("analytics_umami")
    if (!config.active) emit("warn", "Integração desativada: o script não é carregado nas páginas")
    emit("step", `GET ${config.scriptUrl}`)
    let res: Response
    try {
        res = await fetch(config.scriptUrl, { cache: "no-store", signal: stepSignal(signal, 20_000) })
    } catch (error) {
        fail(`Script do Umami inacessível: ${describeFetchError(error)}`)
    }
    if (!res.ok) fail(`O script do Umami respondeu HTTP ${res.status}`)
    emit("success", `Script do Umami respondeu HTTP ${res.status} (website ${config.websiteId})`)
    return config.active ? "Analytics ativo" : warnResult("Script acessível, mas a integração está desativada")
}

// ---------------------------------------------------------------------------
// Tradução: Google Cloud Translation e/ou LibreTranslate
// ---------------------------------------------------------------------------

const testTranslation: IntegrationTester = async ({ emit, signal }) => {
    const config = await getIntegrationConfig("translation")
    const ok: string[] = []
    const problems: string[] = []

    if (config.googleApiKey) {
        const url = "https://translation.googleapis.com/language/translate/v2/languages"
        emit("step", `GET ${url}`)
        const res = await fetch(`${url}?key=${encodeURIComponent(config.googleApiKey)}`, { cache: "no-store", signal: stepSignal(signal, 20_000) }).catch(
            (error: unknown) => {
                problems.push(`Google Cloud inacessível (${describeFetchError(error)})`)
                return null
            },
        )
        if (res?.ok) {
            emit("success", "Google Cloud Translation aceitou a API key")
            ok.push("Google Cloud")
        } else if (res) {
            problems.push(`Google Cloud respondeu HTTP ${res.status}`)
            emit("warn", `Google Cloud Translation respondeu HTTP ${res.status}`)
        }
    } else {
        emit("info", "Google Cloud Translation sem API key")
    }

    const libreUrl = (config.libretranslateUrl || `http://127.0.0.1:${config.libretranslatePort}`).replace(/\/+$/, "")
    emit("step", `GET ${libreUrl}/languages`)
    const libre = await fetch(`${libreUrl}/languages`, { cache: "no-store", signal: stepSignal(signal, 10_000) }).catch(() => null)
    if (libre?.ok) {
        emit("success", "LibreTranslate respondeu")
        ok.push("LibreTranslate")
    } else {
        emit("info", libre ? `LibreTranslate respondeu HTTP ${libre.status}` : "LibreTranslate não está no ar (os scripts de seed sobem o servidor local quando precisam)")
    }

    emit("info", `Tradutor padrão dos scripts: ${config.provider}`)
    if (ok.length === 0 && problems.length > 0) fail(problems.join("; "))
    if (problems.length > 0) return warnResult(`Disponível com restrição: ${problems.join("; ")}`)
    return ok.length ? `Tradutores disponíveis: ${ok.join(", ")}` : warnResult("Nenhum tradutor externo disponível; use o agente Importador 5etools (IA)")
}

export const INTEGRATION_TESTERS: Record<IntegrationId, IntegrationTester> = {
    google_auth: testGoogleAuth,
    pusher: testPusher,
    internal_api: testInternalApi,
    crons: testCrons,
    ai: testAiHub,
    ai_opencode: testOpencode,
    ai_gemini: testGemini,
    ai_anthropic: testAnthropic,
    ai_openai: testOpenai,
    ai_deepseek: testDeepseek,
    ai_jev: testJev,
    smtp: testSmtp,
    storage_s3: testStorage,
    analytics_umami: testUmami,
    translation: testTranslation,
}
