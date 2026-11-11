import { catalogPlainText } from "./catalog-tools"

/**
 * Registro das consultas ao catálogo numa execução da preparação do combate ou de um pedido de ajuste (DND-49) —
 * SOMENTE servidor. Cada entidade lida por `get_catalog_entity` (AI SDK ou MCP) entra com o texto que o modelo viu,
 * normalizado. Uma alteração de regra só passa com `source.ref` lido nesta execução e `source.quote` presente nesse
 * texto (`checkCatalogSource`). O registro vive em memória do processo (o app roda numa instância só).
 */

export interface CatalogSource {
    ref: string
    quote: string
}

export interface CatalogReadLog {
    /** `tipo:id` (tipo normalizado) → texto normalizado da entidade lida. */
    reads: Map<string, string>
    /** Nomes legíveis das refs lidas (`Tipo:id`), na ordem da leitura. */
    refs: string[]
    /** Consultas que falharam (a entidade não chegou ao modelo). */
    failures: number
}

export const createCatalogReadLog = (): CatalogReadLog => ({ reads: new Map(), refs: [], failures: 0 })

/** Sem acento, minúsculo, pontuação como espaço e espaços colapsados: a comparação do `quote` não depende de formatação. */
export function normalizeCatalogQuote(value: string): string {
    return catalogPlainText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

const typeKey = (value: string) => normalizeCatalogQuote(value).replace(/\s+/g, "")

/** `Tipo:id` → chave do registro (o id pode ter `:`, como `subclass:ladino:assassino`). */
export function catalogRefKey(ref: string): string | null {
    const index = ref.indexOf(":")
    if (index <= 0 || index === ref.length - 1) return null
    const type = typeKey(ref.slice(0, index))
    const id = ref.slice(index + 1).trim()
    return type && id ? `${type}:${id}` : null
}

/** Todos os textos da entidade (campos aninhados inclusive), na ordem dos campos. */
function entityStrings(value: unknown, out: string[], depth = 0): void {
    if (depth > 6 || value === null || value === undefined) return
    if (typeof value === "string") out.push(value)
    else if (typeof value === "number") out.push(String(value))
    else if (Array.isArray(value)) for (const item of value) entityStrings(item, out, depth + 1)
    else if (typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) entityStrings(item, out, depth + 1)
}

/** Registra a entidade lida (a forma compacta que o modelo recebeu). */
export function recordCatalogRead(log: CatalogReadLog, type: string, id: string, entity: unknown): void {
    const key = catalogRefKey(`${type}:${id}`)
    if (!key) return
    const parts: string[] = []
    entityStrings(entity, parts)
    const text = normalizeCatalogQuote(parts.join(" \n "))
    const previous = log.reads.get(key)
    log.reads.set(key, previous ? `${previous} ${text}` : text)
    if (!previous) log.refs.push(`${type}:${id}`)
}

/** Saída de uma ferramenta de catálogo: só a leitura completa (`get_catalog_entity`) conta. */
export function recordCatalogToolResult(log: CatalogReadLog, output: unknown): void {
    const result = output as { tipo?: unknown; id?: unknown; entidade?: unknown } | null
    if (!result || typeof result.tipo !== "string" || typeof result.id !== "string" || !result.entidade) return
    recordCatalogRead(log, result.tipo, result.id, result.entidade)
}

export const CATALOG_SOURCE_MISSING = "sem a fonte do catálogo"
export const CATALOG_SOURCE_NOT_READ = "a regra citada não foi consultada no catálogo"
export const CATALOG_SOURCE_QUOTE = "o trecho citado não está no catálogo"
export const CATALOG_SOURCE_SHORT = "o trecho citado é curto demais para confirmar a regra"

/** DND-49 (revisão, F4): o trecho precisa ter pelo menos 3 palavras ou 15 caracteres (normalizados); "d6" ou "dano" não confirmam nada. */
export const CATALOG_QUOTE_MIN_WORDS = 3
export const CATALOG_QUOTE_MIN_CHARS = 15

/** `null` = fonte confirmada; senão, o motivo da recusa (o jogador lê). */
export function checkCatalogSource(source: CatalogSource | null | undefined, log: CatalogReadLog): string | null {
    if (!source?.ref?.trim() || !source.quote?.trim()) return CATALOG_SOURCE_MISSING
    const key = catalogRefKey(source.ref.trim())
    const text = key ? log.reads.get(key) : undefined
    if (text === undefined) return CATALOG_SOURCE_NOT_READ
    const quote = normalizeCatalogQuote(source.quote)
    if (!quote || !text.includes(quote)) return CATALOG_SOURCE_QUOTE
    if (quote.split(" ").length < CATALOG_QUOTE_MIN_WORDS && quote.length < CATALOG_QUOTE_MIN_CHARS) return CATALOG_SOURCE_SHORT
    return null
}

/** Texto lido de uma ref (para regras que conferem o próprio conteúdo, como o limite de maestrias). */
export function catalogReadText(log: CatalogReadLog, ref: string): string | null {
    const key = catalogRefKey(ref)
    return key ? (log.reads.get(key) ?? null) : null
}

// ── Execuções abertas (caminho OpenCode: o MCP registra no log da execução pelo token) ──

const runs = ((globalThis as unknown as { __maddoxCatalogRuns?: Map<string, CatalogReadLog> }).__maddoxCatalogRuns ??= new Map<string, CatalogReadLog>())

export function openCatalogRun(runId: string, log: CatalogReadLog): void {
    runs.set(runId, log)
}

export function closeCatalogRun(runId: string): void {
    runs.delete(runId)
}

export const catalogRunLog = (runId: string): CatalogReadLog | null => runs.get(runId) ?? null
