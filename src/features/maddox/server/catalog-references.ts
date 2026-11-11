import { Types } from "mongoose"
import { parseMentionsFromHtml } from "@/features/character-sheets/utils/sheet-rules"
import { normalizeCatalogName } from "../catalog-markup"
import { masteryKeyFromName, type MaddoxMasteryKey } from "../weapon-mastery"

/**
 * "Referências do catálogo" da ficha (DND-49) — SOMENTE servidor. Lista tipo + id + nome de tudo que a ficha cita, sem o
 * texto das regras (o Maddox lê as regras pelas ferramentas). Só entidades `status: "active"`; o que não está no catálogo
 * (ou está inativo, ou o id da menção não existe mais) aparece como "sem correspondência no catálogo".
 */

export interface CatalogReferenceCandidate {
    type: string
    id: string | null
    name: string
}

export interface CatalogReference {
    type: string
    id: string | null
    name: string
    found: boolean
}

type NamedDoc = { _id: Types.ObjectId; name?: string; originalName?: string | null }
type Finder = { find(query: Record<string, unknown>): { select(fields: string): { lean<T>(): Promise<T> } } }

async function modelOf(type: string): Promise<Finder | null> {
    const model = await (async () => {
        switch (type) {
            case "Regra":
                return (await import("@/core/database/models/reference")).Reference
            case "Habilidade":
                return (await import("@/features/traits/database/trait")).Trait
            case "Talento":
                return (await import("@/features/feats/models/feat")).Feat
            case "Raça":
                return (await import("@/features/races/models/race")).RaceModel
            case "Classe":
                return (await import("@/features/classes/models/character-class")).CharacterClass
            case "Origem":
                return (await import("@/features/backgrounds/models/background")).BackgroundModel
            case "Magia":
                return (await import("@/features/spells/models/spell")).Spell
            case "Item":
                return (await import("@/features/items/database/item")).ItemModel
            default:
                return null
        }
    })()
    return model as unknown as Finder | null
}

/** Menções (tipo, id, nome) de um HTML da ficha. */
export const mentionCandidates = (html: string | null | undefined): CatalogReferenceCandidate[] => parseMentionsFromHtml(html).map((mention) => ({ type: mention.entityType, id: mention.id, name: mention.label }))

const keyOf = (item: CatalogReferenceCandidate) => (item.id ? `${item.type}:${item.id}` : `${item.type}:#${normalizeCatalogName(item.name)}`)

/** Confere cada candidata no catálogo (por id; sem id, pelo nome ou nome original), sem repetir. */
export async function resolveCatalogReferences(candidates: readonly CatalogReferenceCandidate[]): Promise<CatalogReference[]> {
    const unique = new Map<string, CatalogReferenceCandidate>()
    for (const item of candidates) if (item.name.trim() || item.id) unique.set(keyOf(item), item)
    const byType = new Map<string, CatalogReferenceCandidate[]>()
    for (const item of unique.values()) byType.set(item.type, [...(byType.get(item.type) ?? []), item])
    const found = new Map<string, { id: string; name: string }>()
    for (const [type, items] of byType) {
        if (type === "Subclasse") {
            const { getCatalogEntity } = await import("@/features/mcp/server/catalog-entity-service")
            for (const item of items) {
                if (!item.id) continue
                const entity = (await getCatalogEntity({ type: "Subclasse", id: item.id }).catch(() => null)) as { name?: string } | null
                if (entity) found.set(keyOf(item), { id: item.id, name: entity.name ?? item.name })
            }
            continue
        }
        const model = await modelOf(type)
        if (!model) continue
        const ids = items.map((item) => item.id).filter((id): id is string => Boolean(id && /^[a-f0-9]{24}$/i.test(id)))
        if (ids.length) {
            const docs = await model.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, status: "active" }).select("_id name").lean<NamedDoc[]>()
            const byId = new Map(docs.map((doc) => [String(doc._id), doc]))
            for (const item of items) {
                const doc = item.id ? byId.get(item.id) : undefined
                if (doc) found.set(keyOf(item), { id: String(doc._id), name: doc.name ?? item.name })
            }
        }
        const named = items.filter((item) => !item.id && item.name.trim())
        if (named.length) {
            const all = await model.find({ status: "active" }).select("_id name originalName").lean<NamedDoc[]>()
            for (const item of named) {
                const wanted = normalizeCatalogName(item.name)
                const doc = all.find((entry) => (entry.name && normalizeCatalogName(entry.name) === wanted) || (entry.originalName && normalizeCatalogName(entry.originalName) === wanted))
                if (doc) found.set(keyOf(item), { id: String(doc._id), name: doc.name ?? item.name })
            }
        }
    }
    return [...unique.values()].map((item) => {
        const hit = found.get(keyOf(item))
        return hit ? { type: item.type, id: hit.id, name: hit.name, found: true } : { type: item.type, id: item.id, name: item.name, found: false }
    })
}

/** Seção "Referências do catálogo" (sem o texto das regras). */
export function catalogReferencesText(references: readonly CatalogReference[]): string {
    if (!references.length) return "(nenhuma)"
    return references.map((item) => (item.found ? `- ${item.type}:${item.id} — ${item.name}` : `- ${item.type} "${item.name}" — sem correspondência no catálogo`)).join("\n")
}

/** Maestria do item do catálogo (menção "Maestria: Ágil / Nick" em `ItemModel.mastery`): chave e a menção da Regra. */
export function itemMastery(raw: unknown): { key: MaddoxMasteryKey; rule: CatalogReferenceCandidate | null } | null {
    if (raw === null || raw === undefined) return null
    const html = typeof raw === "string" ? raw : typeof raw === "object" ? String((raw as { name?: unknown; label?: unknown }).name ?? (raw as { label?: unknown }).label ?? "") : ""
    const mention = parseMentionsFromHtml(html)[0]
    const label = mention?.label || html
    const key = masteryKeyFromName(label)
    if (!key) return null
    return { key, rule: mention ? { type: mention.entityType || "Regra", id: mention.id, name: mention.label } : null }
}
