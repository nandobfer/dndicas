import { User } from "@/features/users/models/user"
import { logger } from "@/lib/logger"

/** Código do Mongo para "a coleção não existe" (namespace not found). */
const NAMESPACE_NOT_FOUND = 26
/** Código do Mongo para "o índice não existe". */
const INDEX_NOT_FOUND = 27

/** Chave do índice único do Clerk removido do schema: `clerkId` não é mais campo do usuário. */
const LEGACY_CLERK_INDEX_KEY = "clerkId"

interface CollectionIndex {
    name?: string
    key?: Record<string, unknown>
}

/**
 * Remove o índice `clerkId_1` que ficou da migração do Clerk. O campo não existe mais no schema,
 * então todo usuário novo é gravado sem `clerkId` — e, num índice `unique` sem `sparse`, a ausência
 * conta como `null`: a partir do primeiro usuário sem o campo, qualquer criação falha com E11000.
 *
 * Idempotente e roda a cada boot: procura o índice pela chave (não pelo nome), ignora coleção ou
 * índice já ausentes e não toca em nenhum outro índice. Nenhum documento é alterado — o `clerkId`
 * dos usuários legados continua gravado, apenas sem índice.
 */
export async function dropLegacyClerkIndex(): Promise<void> {
    let indexes: CollectionIndex[]
    try {
        indexes = await User.collection.indexes()
    } catch (error) {
        if (mongoErrorCode(error) === NAMESPACE_NOT_FOUND) return
        throw error
    }

    for (const index of indexes.filter(isLegacyClerkIndex)) {
        if (!index.name) continue
        try {
            await User.collection.dropIndex(index.name)
            logger.warn({ collection: "users", index: index.name }, "[migration] Índice legado do Clerk removido")
        } catch (error) {
            // Outra instância pode ter removido entre a listagem e o drop.
            if (mongoErrorCode(error) === INDEX_NOT_FOUND) continue
            throw error
        }
    }
}

function isLegacyClerkIndex(index: CollectionIndex): boolean {
    const keys = Object.keys(index.key ?? {})
    return keys.length === 1 && keys[0] === LEGACY_CLERK_INDEX_KEY && index.key?.[LEGACY_CLERK_INDEX_KEY] === 1
}

function mongoErrorCode(error: unknown): unknown {
    return error && typeof error === "object" ? (error as { code?: unknown }).code : undefined
}
