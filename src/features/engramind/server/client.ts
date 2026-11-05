import { createEngramindClient, type EngramindClient } from "@engramind/client/server"
import { appendBasePath } from "@/lib/base-path"
import { getIntegration } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { encryptSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox"
import { dbConnect } from "@/lib/db"
import { Integration } from "@/lib/db/models/Integration"
import { invalidateStoredIntegrations } from "@/lib/integrations/store"
import { AGENT_TOKEN_FIELDS, ENGRAMIND_INTEGRATION_ID, LAZY_WAIT_MS, MEMORY_IDENTITIES, type MemoryIdentity } from "../constants"
import { engramindLog } from "./shared"

/**
 * Conexão do dndicas com o Engramind (SOMENTE servidor). A configuração vem da integração `engramind`
 * (`/integracoes/engramind`), lida a cada chamada (regra do projeto: nada lê integração no carregamento
 * do módulo). O token de app e os tokens de agente nunca saem do servidor nem vão para log, auditoria
 * ou resposta; a depuração registra só método, URL (sem texto do usuário), status e duração.
 */

export const ENGRAMIND_USER_AGENT = "dndicas"

export interface EngramindConnection {
    baseUrl: string
    appToken: string
    /** Origem pública do dndicas (com o subcaminho), para o webhook. */
    publicAppUrl: string | null
    webhookSecret: string | null
    agentTokens: Partial<Record<MemoryIdentity, string>>
}

function publicOrigin(value: string | undefined): string | null {
    const raw = value?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (!raw) return null
    try {
        return appendBasePath(new URL(raw).origin)
    } catch {
        return null
    }
}

/** Conexão configurada (URL base + token do app) ou `null`. */
export async function engramindConnection(): Promise<EngramindConnection | null> {
    const { values } = await getIntegration("engramind")
    const baseUrl = values.baseUrl?.trim().replace(/\/+$/, "")
    const appToken = values.appToken?.trim()
    if (!baseUrl || !appToken) return null
    const agentTokens: Partial<Record<MemoryIdentity, string>> = {}
    for (const identity of MEMORY_IDENTITIES) {
        const token = (values as Record<string, string | undefined>)[AGENT_TOKEN_FIELDS[identity]]?.trim()
        if (token) agentTokens[identity] = token
    }
    return { baseUrl, appToken, publicAppUrl: publicOrigin(values.publicAppUrl), webhookSecret: values.webhookSecret?.trim() || null, agentTokens }
}

export function webhookUrlOf(publicAppUrl: string): string {
    return `${publicAppUrl.replace(/\/+$/, "")}/api/engramind/webhook`
}

/** Cliente com um token (o de app ou o de um agente), com a depuração da integração sem texto. */
export function clientFor(baseUrl: string, token: string): EngramindClient {
    const dbg = integrationDebug(ENGRAMIND_INTEGRATION_ID)
    return createEngramindClient({
        baseUrl,
        token,
        userAgent: ENGRAMIND_USER_AGENT,
        onDebug: (entry) => {
            const line = `${entry.method} ${entry.url} → ${entry.status ?? "falha"} em ${entry.durationMs} ms`
            if (entry.error || (entry.status ?? 500) >= 400) dbg.warn(line, entry.error ? { error: entry.error } : undefined)
            else dbg.response(line)
        },
    })
}

export async function engramindAppClient(): Promise<EngramindClient | null> {
    const connection = await engramindConnection()
    return connection ? clientFor(connection.baseUrl, connection.appToken) : null
}

/** Grava (cifrados) campos privados da integração gravados só pela configuração automática. */
export async function writeEngramindSecrets(values: Record<string, string | null>, actorId: string): Promise<void> {
    if (!isSecretBoxConfigured()) throw new Error("INTEGRATIONS_ENCRYPTION_KEY ausente: os segredos do Engramind não podem ser gravados")
    await dbConnect()
    const set: Record<string, unknown> = { updatedBy: actorId, updatedAt: new Date() }
    for (const [key, value] of Object.entries(values)) set[`secretValues.${key}`] = value === null ? null : encryptSecret(value)
    await Integration.updateOne(
        { integrationId: ENGRAMIND_INTEGRATION_ID },
        { $set: set, $setOnInsert: { environment: "externo", debugMode: false, publicValues: {}, createdBy: actorId, createdAt: new Date() } },
        { upsert: true },
    )
    invalidateStoredIntegrations()
}

// ── Token do agente, com provisionamento sob demanda ────────────────────────

const LAZY_INTERVAL_MS = 5 * 60_000
const lazy = globalThis as typeof globalThis & { __engramindLazy?: { lastAt: number; inflight: Promise<void> | null; waitMs: number } }
const lazyState = () => (lazy.__engramindLazy ??= { lastAt: 0, inflight: null, waitMs: LAZY_WAIT_MS })

/**
 * Token do agente. Sem token gravado, dispara a configuração da rede em segundo plano (no máximo uma vez
 * a cada 5 min) e espera até 3 s: com o Engramind lento, o turno segue sem o token.
 */
export async function agentTokenFor(identity: MemoryIdentity): Promise<{ baseUrl: string; token: string } | null> {
    const connection = await engramindConnection()
    if (!connection) return null
    const token = connection.agentTokens[identity]
    if (token) return { baseUrl: connection.baseUrl, token }
    const state = lazyState()
    if (!state.inflight && Date.now() - state.lastAt >= LAZY_INTERVAL_MS) {
        state.lastAt = Date.now()
        state.inflight = import("./bootstrap")
            .then(({ runBootstrap }) => runBootstrap("system:engramind").then(() => undefined))
            .catch((error: unknown) => engramindLog.warn({ err: error instanceof Error ? error.message : String(error) }, "[engramind] provisionamento sob demanda falhou"))
            .finally(() => {
                state.inflight = null
            })
    }
    if (state.inflight) {
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([state.inflight, new Promise<void>((resolve) => (timer = setTimeout(resolve, state.waitMs)))])
        clearTimeout(timer)
        const fresh = await engramindConnection()
        const provisioned = fresh?.agentTokens[identity]
        if (fresh && provisioned) return { baseUrl: fresh.baseUrl, token: provisioned }
    }
    return null
}

export async function engramindAgentClient(identity: MemoryIdentity): Promise<EngramindClient | null> {
    const target = await agentTokenFor(identity)
    return target ? clientFor(target.baseUrl, target.token) : null
}

/** Testes: zera o provisionamento sob demanda e ajusta a espera. */
export function resetEngramindLazyForTests(options: { waitMs?: number } = {}): void {
    lazy.__engramindLazy = { lastAt: 0, inflight: null, waitMs: options.waitMs ?? LAZY_WAIT_MS }
}
