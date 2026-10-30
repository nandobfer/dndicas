import { MENTION_HREF_PREFIX } from "@/features/opex-agent/mentions"
import type { CatalogEntityType } from "@/features/mcp/server/catalog-schemas"
import { loggerFor } from "@/lib/logger"
import { CATALOG_MARKUP, catalogTypeOf, normalizeCatalogName } from "../catalog-markup"

/**
 * Menções do catálogo nas falas do Maddox. O entrevistador não tem ferramentas: ele cita uma entidade de D&D de
 * forma explícita, com o tipo (`{{Raça:Elfo}}`, ver `../catalog-markup.ts`). O servidor busca o nome **só no tipo
 * declarado** e troca o que bate exatamente (sem acento e sem caixa, nome ou nome original) por
 * `[Nome](#mention:Tipo:id)`, que a tela mostra como o badge clicável do DnDicas. Negrito comum nunca é consultado.
 * Nomes da própria campanha (campanha, personagens, jogadores) nunca viram menção, mesmo se o modelo errar a
 * marcação. Sem correspondência, tipo inválido ou falha da busca: `**Nome**`.
 */

const log = loggerFor({ module: "maddox", feature: "catalog-mentions" })

export const normalizeMentionName = normalizeCatalogName

export interface CatalogMentionCandidate {
    id: string
    name: string
    originalName?: string | null
    type: string
}

/** Busca por nome em um tipo do catálogo (padrão: o mesmo serviço do `search_catalog` do Opex, só entidades ativas). */
export type CatalogMentionSearch = (query: string, type: CatalogEntityType) => Promise<CatalogMentionCandidate[]>

export interface LinkCatalogMentionsOptions {
    /** Nomes da campanha que nunca viram menção (inteiros; cada palavra de 3+ letras também é reservada). */
    reserved?: readonly string[]
    search?: CatalogMentionSearch
}

const MENTION_LINK = /\[([^\]\n]+)\]\(#mention:([^):\s]+):[^)\s]+\)/g
/** Teto de citações consultadas por mensagem (cada uma é uma busca). */
const MAX_TERMS = 25

/** Import sob demanda (módulo pesado) e único: as buscas de uma mensagem rodam em paralelo e dividem a mesma carga. */
let catalogService: Promise<typeof import("@/features/mcp/server/catalog-entity-service")> | null = null
const loadCatalogService = () => (catalogService ??= import("@/features/mcp/server/catalog-entity-service"))

const defaultSearch: CatalogMentionSearch = async (query, type) => {
    const { searchCatalogEntities } = await loadCatalogService()
    const result = await searchCatalogEntities({ query, types: [type], limit: 10, offset: 0 })
    return result.items.map((item) => ({ id: String(item.id), name: String(item.name ?? ""), originalName: (item.originalName as string | null | undefined) ?? null, type: String(item.type) }))
}

const labelOf = (value: string) => value.replace(/[[\]*]/g, " ").replace(/\s+/g, " ").trim()

/** Conjunto normalizado dos nomes reservados: cada nome inteiro e cada palavra com 3+ letras. */
export function reservedNameSet(names: readonly string[]): Set<string> {
    const set = new Set<string>()
    for (const name of names) {
        const full = normalizeCatalogName(name)
        if (!full) continue
        set.add(full)
        for (const word of full.split(/[^a-z0-9]+/)) if (word.length >= 3) set.add(word)
    }
    return set
}

const keyOf = (type: CatalogEntityType, name: string) => `${type}\u0000${normalizeCatalogName(name)}`

/** Resolve as citações `{{Tipo:Nome}}` em menções; o que não resolver vira `**Nome**`. */
export async function linkCatalogMentions(text: string, options: LinkCatalogMentionsOptions = {}): Promise<string> {
    if (!text.includes("{{")) return text
    const search = options.search ?? defaultSearch
    const reserved = reservedNameSet(options.reserved ?? [])

    const wanted = new Map<string, { type: CatalogEntityType; name: string }>()
    for (const match of text.matchAll(CATALOG_MARKUP)) {
        const type = catalogTypeOf(match[1]!)
        const name = labelOf(match[2]!)
        if (!type || name.length < 2 || reserved.has(normalizeCatalogName(name))) continue
        if (wanted.size < MAX_TERMS) wanted.set(keyOf(type, name), { type, name })
    }

    const found = new Map<string, CatalogMentionCandidate>()
    const results = await Promise.allSettled(
        [...wanted.entries()].map(async ([key, { type, name }]) => {
            const target = normalizeCatalogName(name)
            const candidates = await search(name, type)
            const match = candidates.find((item) => item.type === type && (normalizeCatalogName(item.name) === target || (item.originalName && normalizeCatalogName(item.originalName) === target)))
            if (match) found.set(key, match)
        }),
    )
    const failed = results.filter((result) => result.status === "rejected")
    if (failed.length) log.warn({ failed: failed.length, err: (failed[0] as PromiseRejectedResult).reason }, "[maddox] busca de menções do catálogo falhou; os nomes ficam em negrito")

    return text.replace(CATALOG_MARKUP, (_whole, rawType: string, rawName: string) => {
        const name = labelOf(rawName)
        const type = catalogTypeOf(rawType)
        const match = type ? found.get(keyOf(type, name)) : undefined
        if (!match) return `**${name}**`
        return `[${name}](${MENTION_HREF_PREFIX}${encodeURIComponent(match.type)}:${encodeURIComponent(match.id)})`
    })
}

/** Volta as menções para a marcação `{{Tipo:Nome}}` (histórico enviado ao modelo: ele continua citando assim). */
export function mentionsToMarkup(text: string): string {
    return text.includes("#mention:")
        ? text.replace(MENTION_LINK, (_whole, label: string, type: string) => {
              let decoded = type
              try {
                  decoded = decodeURIComponent(type)
              } catch {
                  // tipo malformado: mantém como veio
              }
              return `{{${decoded}:${label}}}`
          })
        : text
}
