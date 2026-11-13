import { OPEX_MEMORY_CATEGORY_KEYS, OPEX_MEMORY_FALLBACK_CATEGORY, normalizeCategoryKey, type OpexMemoryCategory } from "./constants"

/**
 * Categoria das memórias dos Personagens e NPCs Opex (DND-57) — módulo PURO. O agente escolhe entre
 * `OPEX_MEMORY_CATEGORY_KEYS`; ausente, de regra (PROJECT_RULES e cia.) ou fora da lista vira OUTRO, sem invalidar a
 * decisão do turno.
 */
export function opexMemoryCategoryOf(raw: unknown): OpexMemoryCategory {
    if (typeof raw !== "string") return OPEX_MEMORY_FALLBACK_CATEGORY
    const key = normalizeCategoryKey(raw)
    return (OPEX_MEMORY_CATEGORY_KEYS as readonly string[]).includes(key ?? "") ? (key as OpexMemoryCategory) : OPEX_MEMORY_FALLBACK_CATEGORY
}

/**
 * Categoria que vai na gravação conforme as categorias da rede: a escolhida se existir; senão OUTRO; sem OUTRO,
 * `undefined` (a rede usa a padrão). Sem a lista (`null`), manda a escolhida e o `CATEGORY_NOT_FOUND` cai em OUTRO.
 */
export function resolveOpexCategory(category: string, available: readonly string[] | null): string | undefined {
    if (!available || available.includes(category)) return category
    return available.includes(OPEX_MEMORY_FALLBACK_CATEGORY) ? OPEX_MEMORY_FALLBACK_CATEGORY : undefined
}
