import { MADDOX_CAMPAIGN_MEMORY_KINDS, MADDOX_QUEST_STATUSES, type MaddoxCampaignMemoryKind, type MaddoxQuestStatus } from "@/features/maddox/constants"
import { CAMPAIGN_CATEGORIES } from "./constants"

/**
 * Representação de uma memória de campanha (`maddox_campaign_memories`) no Engramind (módulo PURO):
 *
 * | Mongo | Engramind |
 * |---|---|
 * | `kind` | categoria (`FATO`, `EVENTO`, `LOCAL`, `MISSAO`, `RELACAO`, `OUTRO`) |
 * | `visibility` | canal `…/campanhas/<id>/jogadores` ou `…/mestre` |
 * | `status` (missão) | primeira linha `Status: ativa|concluida|falhou|abandonada` |
 * | `title`, `text` | `title` (travado), `text` sem a linha de status |
 * | `hiddenAt` | memória arquivada |
 *
 * A `key` (`mx-<_id>`) liga as duas pontas desde a primeira gravação: um webhook que chegue antes de o
 * `engramindMemoryId` ser salvo acha a memória pela chave, e o upsert não duplica.
 */

export const mirrorKey = (memoryId: string) => `mx-${memoryId}`

export function memoryIdOfKey(key: string | null | undefined): string | null {
    const match = key?.match(/^mx-([a-f0-9]{24})$/i)
    return match ? match[1]! : null
}

const STATUS_LINE = /^\s*Status:\s*(\S+)\s*$/i

/** Texto enviado ao Engramind: a linha de status entra só nas missões. */
export function engramindTextOf(memory: { kind: MaddoxCampaignMemoryKind; text: string; status: MaddoxQuestStatus | null }): string {
    if (memory.kind !== "missao") return memory.text
    return `Status: ${memory.status ?? "ativa"}\n${memory.text}`
}

/**
 * Lê o texto vindo da rede. A primeira linha `Status: …` sai do texto; valor inválido ou linha ausente
 * mantém o status anterior (`previous`). Só missões têm status.
 */
export function parseEngramindText(text: string, kind: MaddoxCampaignMemoryKind, previous: MaddoxQuestStatus | null): { text: string; status: MaddoxQuestStatus | null } {
    const [first, ...rest] = text.split("\n")
    const match = first !== undefined ? first.match(STATUS_LINE) : null
    const body = match ? rest.join("\n").replace(/^\n+/, "") : text
    if (kind !== "missao") return { text: body, status: null }
    const value = match?.[1]?.toLowerCase()
    const status = value && (MADDOX_QUEST_STATUSES as readonly string[]).includes(value) ? (value as MaddoxQuestStatus) : (previous ?? "ativa")
    return { text: body, status }
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
 * Categoria a gravar: a do tipo quando existe na rede; senão `OUTRO`; sem `OUTRO`, a primeira da lista
 * (a padrão do Engramind). Sem a lista (Engramind não respondeu), manda a do tipo.
 */
export function resolveCategory(kind: MaddoxCampaignMemoryKind, available: readonly string[] | null): string | undefined {
    const wanted = categoryOfKind(kind)
    if (!available) return wanted
    if (available.includes(wanted)) return wanted
    if (available.includes(CAMPAIGN_CATEGORIES.outro.key)) return CAMPAIGN_CATEGORIES.outro.key
    return available[0]
}
