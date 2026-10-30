import { MENTION_HREF_PREFIX } from "@/features/opex-agent/mentions"
import { loggerFor } from "@/lib/logger"

/**
 * Menções do catálogo nas falas do Maddox. O entrevistador não tem ferramentas: ele escreve o nome oficial de
 * raças, classes, magias etc. em **negrito**, e o servidor troca cada negrito que bate exatamente (sem acento e
 * sem caixa) com uma entidade ativa do catálogo pelo link `[Nome](#mention:Tipo:id)`, que a tela mostra como o
 * badge clicável do DnDicas (o mesmo do Agente Opex). Negrito sem correspondência fica como está.
 */

const log = loggerFor({ module: "maddox", feature: "catalog-mentions" })

export interface CatalogMentionCandidate {
    id: string
    name: string
    originalName?: string | null
    type: string
}

/** Busca por nome no catálogo (padrão: o mesmo serviço do `search_catalog` do Opex, só entidades ativas). */
export type CatalogMentionSearch = (query: string) => Promise<CatalogMentionCandidate[]>

const BOLD = /\*\*([^*\n[\]]{2,80}?)\*\*/g
const MENTION_LINK = /\[([^\]\n]+)\]\(#mention:[^)\s]+\)/g
/** Teto de nomes consultados por mensagem (cada um é uma busca). */
const MAX_TERMS = 25

export const normalizeMentionName = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()

/** Import sob demanda (módulo pesado) e único: as buscas de uma mensagem rodam em paralelo e dividem a mesma carga. */
let catalogService: Promise<typeof import("@/features/mcp/server/catalog-entity-service")> | null = null
const loadCatalogService = () => (catalogService ??= import("@/features/mcp/server/catalog-entity-service"))

const defaultSearch: CatalogMentionSearch = async (query) => {
    const { searchCatalogEntities } = await loadCatalogService()
    const result = await searchCatalogEntities({ query, limit: 10, offset: 0 })
    return result.items.map((item) => ({ id: String(item.id), name: String(item.name ?? ""), originalName: (item.originalName as string | null | undefined) ?? null, type: String(item.type) }))
}

const labelOf = (value: string) => value.replace(/[[\]]/g, " ").replace(/\s+/g, " ").trim()

/** Troca `**Nome**` por menções do catálogo quando o nome existe. Falha da busca mantém o negrito (com log). */
export async function linkCatalogMentions(text: string, search: CatalogMentionSearch = defaultSearch): Promise<string> {
    if (!text.includes("**")) return text
    const terms = [...new Set([...text.matchAll(BOLD)].map((match) => match[1]!.trim()).filter((term) => term.length >= 2))].slice(0, MAX_TERMS)
    if (!terms.length) return text

    const found = new Map<string, CatalogMentionCandidate>()
    const results = await Promise.allSettled(
        terms.map(async (term) => {
            const wanted = normalizeMentionName(term)
            const candidates = await search(term)
            const match = candidates.find((item) => normalizeMentionName(item.name) === wanted || (item.originalName && normalizeMentionName(item.originalName) === wanted))
            if (match) found.set(wanted, match)
        }),
    )
    const failed = results.filter((result) => result.status === "rejected")
    if (failed.length) log.warn({ failed: failed.length, err: (failed[0] as PromiseRejectedResult).reason }, "[maddox] busca de menções do catálogo falhou; os nomes ficam em negrito")
    if (!found.size) return text

    return text.replace(BOLD, (whole, inner: string) => {
        const match = found.get(normalizeMentionName(inner))
        if (!match) return whole
        return `[${labelOf(inner)}](${MENTION_HREF_PREFIX}${encodeURIComponent(match.type)}:${encodeURIComponent(match.id)})`
    })
}

/** Volta as menções para `**Nome**` (histórico enviado ao modelo: ele continua escrevendo só negrito). */
export function mentionsToBold(text: string): string {
    return text.includes("#mention:") ? text.replace(MENTION_LINK, (_whole, label: string) => `**${label}**`) : text
}
