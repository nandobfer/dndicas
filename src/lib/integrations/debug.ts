import { hostname } from "os"
import { logger } from "@/lib/logger"
import { getIntegrationDef, integrationDebugChannel, INTEGRATION_DEBUG_EVENT, type IntegrationId } from "./catalog"
import { getIntegration } from "./config"
import { formatLogLine, maskSensitive, type IntegrationLogLevel, type IntegrationLogLine } from "./log-format"

/**
 * Debug estruturado das integrações.
 *
 * Só atua com `debugMode` ligado na integração. Cada evento:
 *   1. vai para o console do servidor, colorido e com data/hora;
 *   2. é persistido em `integration_logs` (TTL de 48h) — é o que o botão "Atualizar" lê;
 *   3. é retransmitido pelo Pusher em `private-integration-{id}`, agrupado a cada 500 ms.
 *
 * Segredos da integração e chaves sensíveis são mascarados ANTES de qualquer destino.
 * Todas as chamadas são fire-and-forget: debug nunca pode quebrar nem atrasar a integração.
 */

const INSTANCE = `${hostname()}#${process.env.NODE_APP_INSTANCE ?? process.pid}`
const FLUSH_MS = 500
/** Pusher recusa mensagens acima de 10 KB. */
const PUSHER_MAX_BYTES = 9000

export interface IntegrationDebugger {
    info(message: string, data?: unknown): void
    step(message: string, data?: unknown): void
    request(message: string, data?: unknown): void
    response(message: string, data?: unknown): void
    success(message: string, data?: unknown): void
    warn(message: string, data?: unknown): void
    error(message: string, error?: unknown, data?: unknown): void
}

const buffers = new Map<IntegrationId, IntegrationLogLine[]>()
const timers = new Map<IntegrationId, ReturnType<typeof setTimeout>>()

function knownSecretsOf(values: Record<string, unknown>, secretKeys: readonly string[]): string[] {
    return secretKeys.map((key) => values[key]).filter((v): v is string => typeof v === "string" && v.length > 0)
}

/** Divide as linhas em lotes que cabem numa mensagem do Pusher. */
export function chunkForPusher(lines: IntegrationLogLine[], maxBytes = PUSHER_MAX_BYTES): IntegrationLogLine[][] {
    const chunks: IntegrationLogLine[][] = []
    let current: IntegrationLogLine[] = []
    let size = 2
    for (const original of lines) {
        let line = original
        let lineSize = Buffer.byteLength(JSON.stringify(line))
        if (lineSize > maxBytes - 100) {
            line = { ...original, data: "[dados omitidos no tempo real — use Atualizar para ver o log completo]" }
            lineSize = Buffer.byteLength(JSON.stringify(line))
        }
        if (current.length > 0 && size + lineSize + 1 > maxBytes) {
            chunks.push(current)
            current = []
            size = 2
        }
        current.push(line)
        size += lineSize + 1
    }
    if (current.length > 0) chunks.push(current)
    return chunks
}

async function flush(id: IntegrationId): Promise<void> {
    timers.delete(id)
    const lines = buffers.get(id) ?? []
    buffers.delete(id)
    if (lines.length === 0) return
    try {
        const { getRawPusherServer } = await import("@/lib/pusher/server")
        const client = await getRawPusherServer()
        for (const chunk of chunkForPusher(lines)) {
            await client.trigger(integrationDebugChannel(id), INTEGRATION_DEBUG_EVENT, { entries: chunk })
        }
    } catch {
        // Pusher indisponível: o log continua no console e no Mongo.
    }
}

function enqueueForPusher(id: IntegrationId, line: IntegrationLogLine): void {
    const list = buffers.get(id) ?? []
    list.push(line)
    buffers.set(id, list)
    if (!timers.has(id)) {
        const timer = setTimeout(() => void flush(id), FLUSH_MS)
        timer.unref?.()
        timers.set(id, timer)
    }
}

async function persist(line: IntegrationLogLine): Promise<void> {
    try {
        const { IntegrationLog } = await import("@/lib/db/models/IntegrationLog")
        await IntegrationLog.create({ ...line, ts: new Date(line.ts) })
    } catch (error) {
        logger.warn({ err: error instanceof Error ? error.message : error }, "[integrations] Falha ao gravar log de debug")
    }
}

async function emit(id: IntegrationId, level: IntegrationLogLevel, message: string, data: unknown, always: boolean): Promise<void> {
    const def = getIntegrationDef(id)
    const resolved = await getIntegration(id)
    if (!resolved.debugMode && !always) return

    const secrets = knownSecretsOf(resolved.values as Record<string, unknown>, def.secretFields.map((f) => f.key))
    const line: IntegrationLogLine = {
        integrationId: id,
        level,
        message: String(maskSensitive(message, secrets)),
        data: data === undefined ? undefined : maskSensitive(data, secrets),
        ts: new Date().toISOString(),
        instance: INSTANCE,
    }

    const text = formatLogLine(line, { tag: def.name.toUpperCase() })
    if (level === "error") console.error(text)
    else if (level === "warn") console.warn(text)
    else console.log(text)

    await persist(line)
    if (def.streamsDebugOverPusher) enqueueForPusher(id, line)
}

const pending = new Set<Promise<void>>()

function fire(id: IntegrationId, level: IntegrationLogLevel, message: string, data: unknown, always: boolean): void {
    const task = emit(id, level, message, data, always).catch(() => undefined)
    pending.add(task)
    void task.finally(() => pending.delete(task))
}

/** Espera os eventos de debug em andamento serem gravados (scripts, antes de desconectar do banco). */
export async function drainIntegrationDebug(): Promise<void> {
    await Promise.allSettled([...pending])
}

function describeError(error: unknown): unknown {
    if (error instanceof Error) {
        const cause = (error as { cause?: unknown }).cause
        return { name: error.name, message: error.message, ...(cause ? { cause: describeError(cause) } : {}) }
    }
    return error
}

/**
 * `always`: grava mesmo com o debug desligado (logs operacionais que a tela sempre mostra, ex.: as
 * centrais de desenvolvimento agêntico).
 */
export function integrationDebug(id: IntegrationId, options: { always?: boolean } = {}): IntegrationDebugger {
    const always = options.always === true
    return {
        info: (message, data) => fire(id, "info", message, data, always),
        step: (message, data) => fire(id, "step", message, data, always),
        request: (message, data) => fire(id, "request", message, data, always),
        response: (message, data) => fire(id, "response", message, data, always),
        success: (message, data) => fire(id, "success", message, data, always),
        warn: (message, data) => fire(id, "warn", message, data, always),
        error: (message, error, data) =>
            fire(id, "error", message, error === undefined ? data : { error: describeError(error), ...(data ? { context: data } : {}) }, always),
    }
}

/**
 * `fetch` instrumentado: loga requisição (método, URL, cabeçalhos mascarados) e resposta
 * (status, duração). O corpo da resposta não é lido aqui para não consumir o stream.
 */
export async function debugFetch(
    dbg: IntegrationDebugger,
    label: string,
    url: string,
    init: RequestInit & { next?: { revalidate?: number } } = {},
): Promise<Response> {
    const startedAt = Date.now()
    const headers = Object.fromEntries(new Headers(init.headers ?? {}).entries())
    dbg.request(`${label}: ${init.method ?? "GET"} ${url}`, {
        headers,
        ...(typeof init.body === "string" ? { body: init.body.slice(0, 2000) } : {}),
    })
    try {
        const response = await fetch(url, init)
        dbg.response(`${label}: HTTP ${response.status} em ${Date.now() - startedAt} ms`, {
            status: response.status,
            requestId: response.headers?.get?.("x-request-id") ?? undefined,
        })
        return response
    } catch (error) {
        dbg.error(`${label}: falha de rede após ${Date.now() - startedAt} ms`, error, { url })
        throw error
    }
}
