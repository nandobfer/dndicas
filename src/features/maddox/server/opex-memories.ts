import { DomainError } from "@/lib/api/route"

/**
 * Memórias globais na configuração do Agente Maddox: as do Personagem Opex (DND-26, canal `dndicas/personagem-opex`) e as
 * dos NPCs Opex (DND-27, canal `dndicas/npc-opex`), cada uma com o token do agente dono do canal. Rede fora ou sem token =
 * 409 em pt-BR; recusa da rede = 400 com o motivo.
 */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
    const { OpexGlobalMemoriesUnavailableError } = await import("@/features/engramind/server/global-memories")
    try {
        return await work()
    } catch (error) {
        if (error instanceof DomainError) throw error
        if (error instanceof OpexGlobalMemoriesUnavailableError) throw new DomainError(409, error.message, "ENGRAMIND_UNAVAILABLE")
        const message = error instanceof Error ? error.message : String(error)
        throw new DomainError(400, `A rede de memórias recusou a operação: ${message}`, "ENGRAMIND_REJECTED")
    }
}

export async function withOpexMemories<T>(work: (memories: typeof import("@/features/engramind/server/opex-characters")) => Promise<T>): Promise<T> {
    const memories = await import("@/features/engramind/server/opex-characters")
    return guarded(() => work(memories))
}

export async function withOpexNpcMemories<T>(work: (memories: typeof import("@/features/engramind/server/opex-npcs")) => Promise<T>): Promise<T> {
    const memories = await import("@/features/engramind/server/opex-npcs")
    return guarded(() => work(memories))
}
