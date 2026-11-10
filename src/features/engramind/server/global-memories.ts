import type { EngramindClient } from "@engramind/client/server"
import type { MemoryIdentity } from "../constants"
import { engramindAgentClient } from "./client"
import { AcaoAuditoria, auditEngramind } from "./shared"

/**
 * Memórias globais de um canal fixo editadas na configuração do Agente Maddox (só administradores) — SOMENTE servidor.
 * Uma fábrica por canal: o global dos Personagens Opex (DND-26) e o dos NPCs Opex (DND-27). Tudo com o token do agente
 * dono do canal; sem ele (rede fora ou ainda sem bootstrap), `OpexGlobalMemoriesUnavailableError`.
 */

export interface OpexGlobalMemory {
    id: string
    title: string
    text: string
    updatedAt: string | null
}

export interface OpexGlobalMemoryInput {
    title: string
    text: string
}

export class OpexGlobalMemoriesUnavailableError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "OpexGlobalMemoriesUnavailableError"
    }
}

interface RemoteMemory {
    id: string
    title?: string | null
    text?: string | null
    updated_at?: string | null
}

const globalView = (memory: RemoteMemory): OpexGlobalMemory => ({ id: memory.id, title: memory.title ?? "", text: memory.text ?? "", updatedAt: memory.updated_at ?? null })

export interface GlobalMemories {
    list(): Promise<OpexGlobalMemory[]>
    create(input: OpexGlobalMemoryInput, actorId: string): Promise<OpexGlobalMemory>
    update(memoryId: string, input: OpexGlobalMemoryInput, actorId: string): Promise<OpexGlobalMemory>
    remove(memoryId: string, actorId: string): Promise<void>
}

/** Operações do canal global `channel` com o token do agente `identity`; `unavailable` é a mensagem do 409. */
export function globalMemoriesFor(identity: MemoryIdentity, channel: string, unavailable: string): GlobalMemories {
    async function client(): Promise<EngramindClient> {
        const found = await engramindAgentClient(identity)
        if (!found) throw new OpexGlobalMemoriesUnavailableError(unavailable)
        return found
    }
    return {
        async list() {
            const api = await client()
            const all: OpexGlobalMemory[] = []
            let cursor: string | null = null
            for (let page = 0; page < 20; page++) {
                const result = (await api.call("GET", "/v1/memories", { query: { channels: channel, limit: 100, ...(cursor ? { cursor } : {}) } })) as { memories: RemoteMemory[]; next_cursor: string | null }
                all.push(...result.memories.map(globalView))
                cursor = result.next_cursor
                if (!cursor) break
            }
            return all
        },
        async create(input, actorId) {
            const api = await client()
            const written = (await api.call("POST", "/v1/memories", { body: { channel, title: input.title, text: input.text, origin: { source: "dndicas", label: "Configuração do Agente Maddox" } } })) as { memory?: RemoteMemory; id?: string }
            const memory = written.memory ?? (written as RemoteMemory)
            await auditEngramind(actorId, "create_memory", AcaoAuditoria.CRIAR, { canal: channel, memoria: memory.id ?? null, titulo: input.title })
            return globalView({ ...memory, title: memory.title ?? input.title, text: memory.text ?? input.text })
        },
        async update(memoryId, input, actorId) {
            const api = await client()
            const written = (await api.call("PATCH", `/v1/memories/${encodeURIComponent(memoryId)}`, { body: { title: input.title, text: input.text } })) as { memory?: RemoteMemory }
            const memory = written.memory ?? (written as RemoteMemory)
            await auditEngramind(actorId, "update_memory", AcaoAuditoria.ATUALIZAR, { canal: channel, memoria: memoryId, titulo: input.title })
            return globalView({ ...memory, id: memory.id ?? memoryId, title: memory.title ?? input.title, text: memory.text ?? input.text })
        },
        async remove(memoryId, actorId) {
            const api = await client()
            await api.memories.delete(memoryId)
            await auditEngramind(actorId, "delete_memory", AcaoAuditoria.EXCLUIR, { canal: channel, memoria: memoryId })
        },
    }
}
