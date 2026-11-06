import { createHash } from "node:crypto"
import { dbConnect } from "@/lib/db"
import { contextChannelsFor, type OpexTurnRole } from "@/features/ai/agents"
import type { MemoryIdentity } from "../constants"
import { agentTokenFor, clientFor, engramindConnection } from "./client"
import { ENGRAMIND_STATE_ID, EngramindContextCache, EngramindState } from "./models"
import { engramindLog, messageOf, publishEngramind } from "./shared"

/**
 * Contexto das memórias de um agente (DND-21): o bloco pronto do Engramind (`GET /v1/context`), pedido
 * com o token do agente, nos canais do turno, com `If-None-Match` (o `304` reaproveita o bloco). Cada
 * resposta boa vira o cache persistente daquele agente + canais (`engramind_context_cache`); com o
 * Engramind fora do ar, sem token ou sem configuração, o turno usa o último bloco em cache (log `warn`)
 * ou segue sem memórias. **Nunca lança** e nunca lê `agent_memories`.
 */

const CONTEXT_TIMEOUT_MS = 5_000

export interface MemoryContextResult {
    block: string
    source: "live" | "cache" | "none"
    cachedAt: string | null
    reason: string | null
}

export const contextCacheKey = (identity: MemoryIdentity, channels: readonly string[]) => createHash("sha256").update(`${identity}|${[...channels].sort().join(",")}`).digest("hex")

async function markHealth(ok: boolean, reason: string | null): Promise<void> {
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ memoryContext: 1 }).lean()
    const wasUnavailable = Boolean(state?.memoryContext?.unavailableSince)
    const now = new Date()
    const next = ok
        ? { lastOkAt: now, unavailableSince: null, lastError: null }
        : { lastOkAt: state?.memoryContext?.lastOkAt ?? null, unavailableSince: state?.memoryContext?.unavailableSince ?? now, lastError: reason }
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { memoryContext: next } }, { upsert: true })
    if (wasUnavailable === ok) await publishEngramind({ type: "memories.context" })
}

export async function getAgentMemoryContext(identity: MemoryIdentity, channels: readonly string[]): Promise<MemoryContextResult> {
    // Integração não configurada: o turno segue sem memórias, sem tocar no banco nem logar aviso.
    if (!(await engramindConnection().catch(() => null))) return { block: "", source: "none", cachedAt: null, reason: "Engramind não configurado" }
    let cached: Awaited<ReturnType<typeof readCache>> = null
    try {
        await dbConnect()
        cached = await readCache(identity, channels)
    } catch (error) {
        engramindLog.warn({ identity, err: messageOf(error) }, "[engramind] cache do contexto das memórias ilegível")
    }
    try {
        const target = await agentTokenFor(identity)
        if (!target) throw new Error("Engramind não configurado ou token do agente indisponível (rode a configuração automática em /integracoes/engramind)")
        const client = clientFor(target.baseUrl, target.token)
        const view = await client.context({ channels: [...channels], ifNoneMatch: cached && !cached.dirty ? cached.version : null }, { timeoutMs: CONTEXT_TIMEOUT_MS })
        const now = new Date()
        if (view === null && cached) {
            await EngramindContextCache.updateOne({ _id: cached._id }, { $set: { fetchedAt: now } })
            await markHealth(true, null).catch(() => undefined)
            return { block: cached.content, source: "live", cachedAt: now.toISOString(), reason: null }
        }
        if (!view) throw new Error("o Engramind respondeu sem o contexto")
        const content = typeof view.content === "string" ? view.content : ""
        await EngramindContextCache.updateOne(
            { _id: contextCacheKey(identity, channels) },
            { $set: { identity, channels: [...channels], content, version: view.version ?? "", dirty: false, fetchedAt: now } },
            { upsert: true },
        )
        await markHealth(true, null).catch(() => undefined)
        return { block: content, source: "live", cachedAt: now.toISOString(), reason: null }
    } catch (error) {
        const reason = messageOf(error)
        engramindLog.warn({ identity, channels, err: reason, cache: Boolean(cached) }, cached ? "[engramind] contexto das memórias indisponível: o turno usa o cache" : "[engramind] contexto das memórias indisponível: turno sem memórias")
        await markHealth(false, reason).catch(() => undefined)
        if (cached) return { block: cached.content, source: "cache", cachedAt: new Date(cached.fetchedAt).toISOString(), reason }
        return { block: "", source: "none", cachedAt: null, reason }
    }
}

async function readCache(identity: MemoryIdentity, channels: readonly string[]) {
    return EngramindContextCache.findById(contextCacheKey(identity, channels)).lean()
}

/** Bloco das memórias do agente para o prompt (vazio sem memórias). Nunca lança. */
export async function agentMemoryBlock(identity: MemoryIdentity, role?: OpexTurnRole): Promise<string> {
    try {
        return (await getAgentMemoryContext(identity, contextChannelsFor(identity, role))).block.trim()
    } catch (error) {
        engramindLog.warn({ identity, err: messageOf(error) }, "[engramind] turno sem memórias")
        return ""
    }
}

/** Webhook: os blocos dos canais alterados voltam a ser pedidos sem `If-None-Match`. */
export async function markContextDirty(channel: string | null | undefined): Promise<void> {
    if (!channel) return
    await dbConnect()
    await EngramindContextCache.updateMany({ channels: channel }, { $set: { dirty: true } })
}

export async function memoryContextHealth(): Promise<{ unavailable: boolean; since: string | null; lastOkAt: string | null; reason: string | null }> {
    await dbConnect()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ memoryContext: 1 }).lean()
    const health = state?.memoryContext
    return {
        unavailable: Boolean(health?.unavailableSince),
        since: health?.unavailableSince ? new Date(health.unavailableSince).toISOString() : null,
        lastOkAt: health?.lastOkAt ? new Date(health.lastOkAt).toISOString() : null,
        reason: health?.lastError ?? null,
    }
}
