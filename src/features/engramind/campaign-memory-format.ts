import { createHash } from "node:crypto"
import { normalizeCatalogName } from "@/features/maddox/catalog-markup"
import { MADDOX_CAMPAIGN_MEMORY_KINDS, MADDOX_QUEST_STATUSES, MADDOX_TOOL_TAGS_MAX, type MaddoxCampaignMemoryKind, type MaddoxQuestStatus, type MaddoxVisibility } from "@/features/maddox/constants"
import { CAMPAIGN_CATEGORIES, parseCampaignChannel } from "./constants"

/**
 * Memórias das campanhas Maddox no Engramind (módulo PURO). Desde a revisão da DND-21 a rede é a ÚNICA
 * fonte: nada fica no Mongo.
 *
 * | Jogo | Engramind |
 * |---|---|
 * | campanha + `visibility` | canal `dndicas/maddox/campanhas/<id>/jogadores` ou `…/mestre` |
 * | `kind` | categoria (`FATO`, `EVENTO`, `LOCAL`, `MISSAO`, `RELACAO`, `OUTRO`) |
 * | tipo + título (gravar sem duplicar) | `key` `mx:<tipo>:<título normalizado>` |
 * | marco de um combate | `key` `mx:combate:<combatId>` |
 * | `status` (missão) | tag reservada `status:<situação>` |
 * | `turnNumber` | tag reservada `turno:<n>` |
 * | escondida | memória arquivada |
 */

export const KEY_MAX = 80
export const TAG_MAX = 40
export const TAGS_MAX = 20
const STATUS_TAG = "status:"
const TURN_TAG = "turno:"

const hash8 = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 8)

/** Parte da chave a partir de um título: sem acento, minúsculas e só `a-z 0-9 -`. */
export function slugOfTitle(title: string): string {
    return normalizeCatalogName(title)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
}

function boundedKey(prefix: string, rest: string, source: string): string {
    const key = `${prefix}${rest}`
    if (rest && key.length <= KEY_MAX) return key
    const suffix = `-${hash8(source)}`
    return `${prefix}${rest.slice(0, KEY_MAX - prefix.length - suffix.length).replace(/-+$/, "")}${suffix}`
}

/** Chave da gravação por tipo + título (a mesma do `save_memory`, em qualquer visibilidade). */
export function memoryKeyOf(kind: MaddoxCampaignMemoryKind, title: string): string {
    return boundedKey(`mx:${kind}:`, slugOfTitle(title), normalizeCatalogName(title))
}

export function combatMemoryKey(combatId: string): string {
    return `mx:combate:${combatId}`
}

export function categoryOfKind(kind: MaddoxCampaignMemoryKind): string {
    return CAMPAIGN_CATEGORIES[kind].key
}

/** Categoria da rede → tipo do jogo (desconhecida → `outro`). */
export function kindOfCategory(category: string | null | undefined): MaddoxCampaignMemoryKind {
    const kind = MADDOX_CAMPAIGN_MEMORY_KINDS.find((item) => CAMPAIGN_CATEGORIES[item].key === category?.toUpperCase())
    return kind ?? "outro"
}

/**
 * Categoria a gravar: a do tipo quando existe na rede; senão `OUTRO`; sem `OUTRO`, a primeira da lista.
 * Sem a lista (Engramind não respondeu), manda a do tipo.
 */
export function resolveCategory(kind: MaddoxCampaignMemoryKind, available: readonly string[] | null): string | undefined {
    const wanted = categoryOfKind(kind)
    if (!available) return wanted
    if (available.includes(wanted)) return wanted
    if (available.includes(CAMPAIGN_CATEGORIES.outro.key)) return CAMPAIGN_CATEGORIES.outro.key
    return available[0]
}

export const statusTag = (status: MaddoxQuestStatus) => `${STATUS_TAG}${status}`

const isReserved = (tag: string) => tag.startsWith(STATUS_TAG) || tag.startsWith(TURN_TAG)

/** Tags gravadas: as do narrador (cortadas, sem repetir, sem as reservadas) + status e turno. */
export function tagsOf(input: { kind: MaddoxCampaignMemoryKind; tags?: readonly string[]; status?: MaddoxQuestStatus | null; turnNumber?: number | null }): string[] {
    const free = [...new Set((input.tags ?? []).map((tag) => tag.trim().slice(0, TAG_MAX).trim()).filter((tag) => tag && !isReserved(tag)))].slice(0, MADDOX_TOOL_TAGS_MAX)
    const reserved = [...(input.kind === "missao" ? [statusTag(input.status ?? "ativa")] : []), ...(input.turnNumber ? [`${TURN_TAG}${input.turnNumber}`] : [])]
    return [...free.slice(0, TAGS_MAX - reserved.length), ...reserved]
}

/** Lê as tags da rede: tags livres, status (só missão; ausente/inválido → `ativa`) e turno. */
export function readTags(tags: readonly string[] | null | undefined, kind: MaddoxCampaignMemoryKind): { tags: string[]; status: MaddoxQuestStatus | null; turnNumber: number | null } {
    const list = tags ?? []
    const statusValue = list.find((tag) => tag.startsWith(STATUS_TAG))?.slice(STATUS_TAG.length)
    const turnValue = Number(list.find((tag) => tag.startsWith(TURN_TAG))?.slice(TURN_TAG.length))
    const status = kind === "missao" ? ((MADDOX_QUEST_STATUSES as readonly string[]).includes(statusValue ?? "") ? (statusValue as MaddoxQuestStatus) : "ativa") : null
    return { tags: list.filter((tag) => !isReserved(tag)), status, turnNumber: Number.isInteger(turnValue) && turnValue > 0 ? turnValue : null }
}

/** Título aceito pelo Engramind (3 a 200 caracteres, uma linha); curto demais → `undefined`. */
export function remoteTitle(title: string): string | undefined {
    const clean = title.replace(/\s+/g, " ").trim().slice(0, 200)
    return clean.length >= 3 ? clean : undefined
}

/** Memória como o Engramind devolve (só os campos usados aqui). */
export interface RemoteCampaignMemory {
    id: string
    channel: string
    title: string | null
    text: string
    category: string
    status: "active" | "permanent" | "archived"
    version: number
    key?: string | null
    tags?: string[]
    created_at?: string
    updated_at?: string
}

/** Memória de campanha na forma do jogo (ferramentas, prompt e Diário). */
export interface CampaignMemoryView {
    id: string
    campaignId: string
    visibility: MaddoxVisibility
    kind: MaddoxCampaignMemoryKind
    title: string
    text: string
    tags: string[]
    status: MaddoxQuestStatus | null
    turnNumber: number | null
    archived: boolean
    createdAt: string
    updatedAt: string
}

/** Converte; memória fora dos canais de campanha → `null`. */
export function viewOf(remote: RemoteCampaignMemory): CampaignMemoryView | null {
    const target = parseCampaignChannel(remote.channel)
    if (!target) return null
    const kind = kindOfCategory(remote.category)
    const read = readTags(remote.tags, kind)
    const updatedAt = remote.updated_at ?? new Date(0).toISOString()
    return {
        id: remote.id,
        campaignId: target.campaignId,
        visibility: target.visibility,
        kind,
        title: remote.title?.trim() || remote.text.split("\n")[0]!.slice(0, 120),
        text: remote.text,
        ...read,
        archived: remote.status === "archived",
        createdAt: remote.created_at ?? updatedAt,
        updatedAt,
    }
}
