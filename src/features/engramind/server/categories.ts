import { engramindCodeOf, type EngramindClient } from "@engramind/client/server"
import { ENGRAMIND_CATEGORY_LIST, CATEGORY_KEY_PATTERN, OPEX_MEMORY_FALLBACK_CATEGORY, type CategoryDef } from "../constants"
import { engramindAppClient } from "./client"
import { engramindLog, messageOf } from "./shared"

/**
 * Categorias da rede (globais no Engramind). `create_category` só acrescenta (repetir igual → `200
 * created: false`); editar e remover continuam com o admin no Opex. A lista fica 60 s em cache e o
 * webhook `settings.updated` a invalida.
 */

const TTL_MS = 60_000
const cache = globalThis as typeof globalThis & { __engramindCategories?: { at: number; keys: string[] } | null }

export function invalidateCategoryCache(): void {
    cache.__engramindCategories = null
}

/** Chaves das categorias (na ordem da rede; a primeira é a padrão) ou `null` sem Engramind. */
export async function listCategoryKeys(client?: EngramindClient | null): Promise<string[] | null> {
    const hit = cache.__engramindCategories
    if (hit && Date.now() - hit.at < TTL_MS) return hit.keys
    const api = client ?? (await engramindAppClient())
    if (!api) return null
    try {
        const { categories } = await api.categories.list()
        const keys = categories.map((item) => item.key)
        cache.__engramindCategories = { at: Date.now(), keys }
        return keys
    } catch (error) {
        engramindLog.warn({ err: messageOf(error) }, "[engramind] categorias indisponíveis")
        return null
    }
}

export type CategoryOutcome = { key: string; status: "exists" | "created" | "conflict" | "limit" | "invalid" | "error"; message: string }

const OUTCOME_MESSAGES = {
    conflict: (key: string) => `A categoria ${key} já existe com outro rótulo ou prioridade: ela é usada como está.`,
    limit: (key: string) => `A lista de categorias do Engramind está cheia: ${key} não foi criada (crie espaço no Opex).`,
    invalid: (key: string) => `Chave de categoria inválida (${key}): use maiúsculas, dígitos e _, começando por letra.`,
}

/** Cria uma categoria (idempotente). Conflito e lista cheia voltam como resultado, sem lançar. */
export async function createCategory(client: EngramindClient, def: CategoryDef): Promise<CategoryOutcome> {
    if (!CATEGORY_KEY_PATTERN.test(def.key)) return { key: def.key, status: "invalid", message: OUTCOME_MESSAGES.invalid(def.key) }
    try {
        const result = (await client.call("POST", "/v1/categories", { body: def, idempotencyKey: `dndicas-category-${def.key}-${def.priority}` })) as { created?: boolean } | null
        invalidateCategoryCache()
        return { key: def.key, status: result?.created === false ? "exists" : "created", message: result?.created === false ? `${def.key} já existia` : `${def.key} criada` }
    } catch (error) {
        const code = engramindCodeOf(error)
        if (code === "CATEGORY_CONFLICT") return { key: def.key, status: "conflict", message: OUTCOME_MESSAGES.conflict(def.key) }
        if (code === "CATEGORY_LIMIT_REACHED") return { key: def.key, status: "limit", message: OUTCOME_MESSAGES.limit(def.key) }
        return { key: def.key, status: "error", message: messageOf(error) }
    }
}

/** Garante as categorias (só cria as que faltam). */
export async function ensureCategories(defs: readonly CategoryDef[] = ENGRAMIND_CATEGORY_LIST, client?: EngramindClient | null): Promise<CategoryOutcome[]> {
    const api = client ?? (await engramindAppClient())
    if (!api) return defs.map((def) => ({ key: def.key, status: "error" as const, message: "Engramind não configurado" }))
    invalidateCategoryCache()
    const existing = await listCategoryKeys(api)
    if (!existing) return defs.map((def) => ({ key: def.key, status: "error" as const, message: "Não foi possível listar as categorias do Engramind" }))
    const outcomes: CategoryOutcome[] = []
    for (const def of defs) {
        if (existing.includes(def.key)) outcomes.push({ key: def.key, status: "exists", message: `${def.key} já existia` })
        else outcomes.push(await createCategory(api, def))
    }
    invalidateCategoryCache()
    return outcomes
}

/**
 * `POST /v1/memories` que não se perde por categoria (DND-57): `CATEGORY_NOT_FOUND` (categoria removida ou ainda não
 * criada) grava de novo como OUTRO e, sem OUTRO, na categoria padrão da rede.
 */
export async function postWithCategoryFallback(client: EngramindClient, body: Record<string, unknown>): Promise<unknown> {
    try {
        return await client.call("POST", "/v1/memories", { body })
    } catch (error) {
        if (engramindCodeOf(error) !== "CATEGORY_NOT_FOUND" || body.category === undefined) throw error
        invalidateCategoryCache()
        const rest = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "category"))
        if (body.category !== OPEX_MEMORY_FALLBACK_CATEGORY) {
            try {
                return await client.call("POST", "/v1/memories", { body: { ...rest, category: OPEX_MEMORY_FALLBACK_CATEGORY } })
            } catch (retryError) {
                if (engramindCodeOf(retryError) !== "CATEGORY_NOT_FOUND") throw retryError
            }
        }
        return client.call("POST", "/v1/memories", { body: rest })
    }
}
