import { dbConnect } from "@/lib/db"
import { Integration } from "@/lib/db/models/Integration"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import type { IntegrationEnvironment, PublicFieldValue } from "./catalog"

/**
 * Acesso ao Mongo das configurações de integração, isolado do resolvedor para que os testes
 * possam substituí-lo (o setup do Vitest faz mock deste módulo e todos os consumidores caem
 * no fallback do `.env`, sem tentar conectar ao banco).
 */

export interface StoredIntegration {
    integrationId: string
    environment: IntegrationEnvironment
    debugMode: boolean
    swaggerUrl?: string | null
    publicValues: Record<string, PublicFieldValue>
    secretValues: Record<string, EncryptedSecret | null>
    updatedAt?: Date
    updatedBy?: string
}

/**
 * Tempo máximo que uma instância pode usar uma configuração velha. Quem salva invalida o
 * cache da própria instância na hora; as demais instâncias convergem dentro deste prazo.
 */
export const INTEGRATION_CACHE_TTL_MS = 30_000

let cache: { at: number; docs: Map<string, StoredIntegration> } | null = null
let inflight: Promise<Map<string, StoredIntegration>> | null = null

async function fetchAll(): Promise<Map<string, StoredIntegration>> {
    await dbConnect()
    const docs = (await Integration.find({}).lean()) as unknown as StoredIntegration[]
    return new Map(docs.map((doc) => [doc.integrationId, doc]))
}

export async function loadStoredIntegrations(): Promise<Map<string, StoredIntegration>> {
    // Durante o `next build` não há banco: o layout raiz e afins usam o `.env`.
    if (process.env.NEXT_PHASE === "phase-production-build") return new Map()
    if (cache && Date.now() - cache.at < INTEGRATION_CACHE_TTL_MS) return cache.docs
    if (!inflight) {
        inflight = fetchAll()
            .then((docs) => {
                cache = { at: Date.now(), docs }
                return docs
            })
            .finally(() => {
                inflight = null
            })
    }
    return inflight
}

export async function loadStoredIntegration(id: string): Promise<StoredIntegration | null> {
    const docs = await loadStoredIntegrations()
    return docs.get(id) ?? null
}

export function invalidateStoredIntegrations(): void {
    cache = null
}
