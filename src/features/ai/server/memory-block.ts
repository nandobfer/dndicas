import type { OpexTurnRole } from "../agents"
import type { MemoryIdentity } from "@/features/engramind/constants"

/**
 * Bloco das memórias de um agente vindo do Engramind (vazio sem memórias; nunca lança). O serviço do
 * Engramind entra sob demanda para não pesar no carregamento das rotas de geração.
 */
export async function memoryBlock(identity: MemoryIdentity, role?: OpexTurnRole): Promise<string> {
    const { agentMemoryBlock } = await import("@/features/engramind/server/memory-context")
    return agentMemoryBlock(identity, role)
}
