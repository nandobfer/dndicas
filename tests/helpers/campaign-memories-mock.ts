/**
 * Substituto em memória de `@/features/engramind/server/campaign-memories` para os testes do Maddox (narrador,
 * ferramentas, Diário): mesma interface e mesmas regras de chave/tags (usa o formato real), sem Engramind nem
 * Mongo. A lógica real da rede é coberta em `tests/backend/engramind/campaign-memories.test.ts`.
 *
 * Uso: `vi.mock("@/features/engramind/server/campaign-memories", async () => (await import("../../helpers/campaign-memories-mock")).campaignMemoriesModule)`
 * e `campaignMemoriesStore.reset()` no `beforeEach`.
 */
import { normalizeCatalogName } from "@/features/maddox/catalog-markup"
import { memoryKeyOf, readTags, tagsOf, type CampaignMemoryView } from "@/features/engramind/campaign-memory-format"
import type { MaddoxCampaignMemoryKind, MaddoxQuestStatus, MaddoxVisibility } from "@/features/maddox/constants"

type Stored = CampaignMemoryView & { key: string; seq: number }

const state = { items: [] as Stored[], seq: 0, down: false }

class Unavailable extends Error {
    readonly status = 503
    readonly code = "ENGRAMIND_UNAVAILABLE"
}

function guard() {
    if (state.down) throw new Unavailable("As anotações da campanha estão indisponíveis no momento: a rede de memórias não respondeu.")
}

export const campaignMemoriesStore = {
    reset() {
        state.items = []
        state.seq = 0
        state.down = false
    },
    setDown(down: boolean) {
        state.down = down
    },
    all: (campaignId?: string) => state.items.filter((item) => !campaignId || item.campaignId === campaignId),
    archive(id: string) {
        const item = state.items.find((entry) => entry.id === id)
        if (item) item.archived = true
    },
}

const now = () => new Date(Date.UTC(2026, 10, 6, 0, 0, state.seq)).toISOString()
const matches = (item: Stored, query: string) => {
    const needle = normalizeCatalogName(query)
    return [item.title, item.text, ...item.tags].some((value) => normalizeCatalogName(value).includes(needle))
}

interface SaveInput {
    kind: MaddoxCampaignMemoryKind
    title: string
    text: string
    visibility?: MaddoxVisibility
    tags?: string[]
    status?: MaddoxQuestStatus
    turnNumber?: number | null
    key?: string
}

async function saveCampaignMemory(campaignId: string, input: SaveInput) {
    guard()
    const key = input.key ?? memoryKeyOf(input.kind, input.title)
    const existing = state.items.find((item) => item.campaignId === campaignId && item.key === key)
    state.seq++
    const previous = existing ? { tags: existing.tags, status: existing.status, turnNumber: existing.turnNumber } : null
    const read = readTags(tagsOf({ kind: input.kind, tags: input.tags ?? previous?.tags, status: input.status ?? previous?.status, turnNumber: input.turnNumber ?? previous?.turnNumber }), input.kind)
    if (existing) {
        const restored = existing.archived
        Object.assign(existing, { title: input.title, text: input.text, visibility: input.visibility ?? existing.visibility, ...read, archived: false, updatedAt: now(), seq: state.seq })
        return { saved: true as const, created: false, ...(restored ? { restored: true as const } : {}) }
    }
    const at = now()
    state.items.push({ id: `m_${String(state.seq).padStart(6, "0")}`, campaignId, key, kind: input.kind, title: input.title, text: input.text, visibility: input.visibility ?? "players", ...read, archived: false, createdAt: at, updatedAt: at, seq: state.seq })
    return { saved: true as const, created: true }
}

interface Query {
    scope: "players" | "all"
    reader: "app" | "maddox"
    kind?: MaddoxCampaignMemoryKind
    status?: MaddoxQuestStatus
    limit: number
    cursor?: string
}

const visible = (campaignId: string, query: Pick<Query, "scope" | "kind" | "status">) =>
    state.items
        .filter((item) => item.campaignId === campaignId && !item.archived && (query.scope === "all" || item.visibility === "players") && (!query.kind || item.kind === query.kind) && (!query.status || item.status === query.status))
        .sort((a, b) => b.seq - a.seq)

const strip = ({ key: _key, seq: _seq, ...view }: Stored): CampaignMemoryView => view

async function listCampaignMemories(campaignId: string, query: Query) {
    guard()
    const all = visible(campaignId, query)
    const start = Number(query.cursor ?? 0) || 0
    const items = all.slice(start, start + query.limit)
    return { items: items.map(strip), nextCursor: start + query.limit < all.length ? String(start + query.limit) : null }
}

async function searchCampaignMemories(campaignId: string, input: { query: string } & Omit<Query, "cursor" | "status">) {
    guard()
    return visible(campaignId, input)
        .filter((item) => matches(item, input.query))
        .slice(0, input.limit)
        .map(strip)
}

async function activeQuests(campaignId: string, scope: Query["scope"], reader: Query["reader"], limit: number) {
    return (await listCampaignMemories(campaignId, { scope, reader, kind: "missao", status: "ativa", limit })).items
}

async function countPlayerMemories(campaignId: string) {
    guard()
    const counts: Record<MaddoxCampaignMemoryKind, number> = { fato: 0, evento: 0, local: 0, missao: 0, relacao: 0, outro: 0 }
    for (const item of visible(campaignId, { scope: "players" })) counts[item.kind]++
    return counts
}

async function narratorMemoryIndex(campaignId: string, limit: number) {
    if (state.down) return []
    const quests = await activeQuests(campaignId, "all", "maddox", limit)
    const ids = new Set(quests.map((item) => item.id))
    const recent = visible(campaignId, { scope: "all" }).map(strip)
    return [...quests, ...recent.filter((item) => !ids.has(item.id)).slice(0, Math.max(0, limit - quests.length))]
}

export const campaignMemoriesModule = {
    saveCampaignMemory,
    listCampaignMemories,
    searchCampaignMemories,
    activeQuests,
    countPlayerMemories,
    narratorMemoryIndex,
    notifyJournalChanged: async () => undefined,
    campaignOfPlayersChannel: () => null,
    CampaignMemoriesUnavailableError: Unavailable,
}
