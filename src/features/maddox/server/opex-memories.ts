import { DomainError } from "@/lib/api/route"

/**
 * Memórias globais do Personagem Opex (DND-26) na configuração do Agente Maddox: as operações do canal
 * `dndicas/personagem-opex` com o token do agente dono do canal. Rede fora ou sem token = 409 em pt-BR; recusa da rede =
 * 400 com o motivo.
 */
export async function withOpexMemories<T>(work: (memories: typeof import("@/features/engramind/server/opex-characters")) => Promise<T>): Promise<T> {
    const memories = await import("@/features/engramind/server/opex-characters")
    try {
        return await work(memories)
    } catch (error) {
        if (error instanceof DomainError) throw error
        if (error instanceof memories.OpexGlobalMemoriesUnavailableError) throw new DomainError(409, error.message, "ENGRAMIND_UNAVAILABLE")
        const message = error instanceof Error ? error.message : String(error)
        throw new DomainError(400, `A rede de memórias recusou a operação: ${message}`, "ENGRAMIND_REJECTED")
    }
}
