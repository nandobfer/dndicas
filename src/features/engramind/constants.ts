import type { MaddoxCampaignMemoryKind, MaddoxVisibility } from "@/features/maddox/constants"

/**
 * Rede de memórias do dndicas no Engramind (DND-21; módulo PURO: tela e servidor). O dndicas é um app
 * consumidor (`@engramind/client`, modo `app`): agentes, canais, assinaturas e tokens de agente nascem
 * no bootstrap pelo token de app; a gestão da rede fica no Opex.
 */

export const ENGRAMIND_APP = "dndicas"
export const ENGRAMIND_INTEGRATION_ID = "engramind"

/** Identidades (agentes) do app: `dndicas/<identidade>`. */
export const MEMORY_IDENTITIES = ["opex", "image-generator", "entity-understanding", "entity-import", "maddox", "personagem-opex"] as const
export type MemoryIdentity = (typeof MEMORY_IDENTITIES)[number]

export const IDENTITY_LABELS: Record<MemoryIdentity, { name: string; description: string }> = {
    opex: { name: "Agente Opex", description: "Assistente do dndicas (chat do Agente Opex)." },
    "image-generator": { name: "Gerador de imagens", description: "Gera as artes das fichas e dos cadastros." },
    "entity-understanding": { name: "Entender com IA", description: "Explica magias, classes, itens e demais entidades." },
    "entity-import": { name: "Importador 5etools", description: "Traduz e adapta as entidades importadas do 5etools." },
    maddox: { name: "Agente Maddox", description: "Mestre e entrevistador das Campanhas Maddox." },
    "personagem-opex": { name: "Personagem Opex", description: "Dono do canal global lido por todos os Personagens Opex das Campanhas Maddox." },
}

/** Campo privado da integração com o token cifrado de cada agente. */
export const AGENT_TOKEN_FIELDS: Record<MemoryIdentity, string> = {
    opex: "agentTokenOpex",
    "image-generator": "agentTokenImageGenerator",
    "entity-understanding": "agentTokenEntityUnderstanding",
    "entity-import": "agentTokenEntityImport",
    maddox: "agentTokenMaddox",
    "personagem-opex": "agentTokenPersonagemOpex",
}

export const agentSlug = (identity: MemoryIdentity) => `${ENGRAMIND_APP}/${identity}`

/** Escopos de cada token de agente (reemitido quando diverge). */
export const AGENT_TOKEN_SCOPES = ["read", "write", "delete"] as const

export interface FixedChannel {
    slug: string
    name: string
    description: string
    /** Agente que cria o canal (assinatura exata `inject`). */
    owner: MemoryIdentity
}

/** Os 7 canais fixos (as 7 listas antigas de `agent_memories`). */
export const FIXED_CHANNELS: readonly FixedChannel[] = [
    { slug: "dndicas/opex/global", name: "Agente Opex · global", description: "Instruções que o Agente Opex segue em toda conversa (administradores, usuários e visitantes).", owner: "opex" },
    { slug: "dndicas/opex/admin", name: "Agente Opex · administradores", description: "Instruções que o Agente Opex segue só nos turnos de administradores.", owner: "opex" },
    { slug: "dndicas/opex/user", name: "Agente Opex · usuários", description: "Instruções que o Agente Opex segue só nos turnos de usuários comuns e visitantes.", owner: "opex" },
    { slug: "dndicas/image-generator", name: "Gerador de imagens", description: "Instruções que entram em toda imagem gerada pelo dndicas.", owner: "image-generator" },
    { slug: "dndicas/entity-understanding", name: "Entender com IA", description: "Instruções do chat \"Entender com IA\".", owner: "entity-understanding" },
    { slug: "dndicas/entity-import", name: "Importador 5etools", description: "Instruções de tradução e adaptação da importação do 5etools.", owner: "entity-import" },
    { slug: "dndicas/maddox", name: "Agente Maddox", description: "Instruções que o Maddox segue como mestre e entrevistador em todas as campanhas.", owner: "maddox" },
    { slug: "dndicas/personagem-opex", name: "Personagem Opex · global", description: "Memórias que todo Personagem Opex lê nas Campanhas Maddox (treino do jeito de jogar).", owner: "personagem-opex" },
] as const

export const CAMPAIGN_CHANNEL_PREFIX = "dndicas/maddox/campanhas/"

export type SubscriptionMode = "inject" | "search" | "manage"

export interface SubscriptionTarget {
    agent: MemoryIdentity
    target: string
    mode: SubscriptionMode
}

/**
 * Assinaturas do bootstrap. As exatas criam os canais fixos (o token de app não tem `create_channel`:
 * o canal nasce quando um alvo exato é assinado). `dndicas/opex` também assina os outros canais fixos em
 * `manage` (busca e grava quando cita o canal, sem entrar no contexto); o Maddox assina as campanhas em
 * `search` (fora do contexto injetado).
 */
export const SUBSCRIPTION_TARGETS: readonly SubscriptionTarget[] = [
    ...FIXED_CHANNELS.map((channel) => ({ agent: channel.owner, target: channel.slug, mode: "inject" as const })),
    { agent: "opex", target: "dndicas/opex/*", mode: "inject" },
    ...FIXED_CHANNELS.filter((channel) => channel.owner !== "opex").map((channel) => ({ agent: "opex" as const, target: channel.slug, mode: "manage" as const })),
    { agent: "maddox", target: `${CAMPAIGN_CHANNEL_PREFIX}*`, mode: "search" },
]

/** O Agente Opex com o mesmo agente assinando o mesmo alvo: a exata `inject` do dono vence a `manage`. */
export function subscriptionsFor(): SubscriptionTarget[] {
    const seen = new Set<string>()
    return SUBSCRIPTION_TARGETS.filter((item) => {
        const key = `${item.agent}|${item.target}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

// ── Personagens Opex (DND-26) ───────────────────────────────────────────────

/** Canal global que todo Personagem Opex lê (dono: o agente fixo `dndicas/personagem-opex`). */
export const OPEX_CHARACTER_GLOBAL_CHANNEL = "dndicas/personagem-opex"
/** Prefixo dos canais individuais: `dndicas/personagem-opex/<campaignId>/<memberId>`. */
export const OPEX_CHARACTER_CHANNEL_PREFIX = `${OPEX_CHARACTER_GLOBAL_CHANNEL}/`
/** Agente próprio de cada Personagem Opex: `dndicas/personagem-opex-<memberId>`. */
export const opexCharacterAgentSlug = (memberId: string) => `personagem-opex-${memberId}`
export const opexCharacterChannel = (campaignId: string, memberId: string) => `${OPEX_CHARACTER_CHANNEL_PREFIX}${campaignId}/${memberId}`

// ── Canais das campanhas ────────────────────────────────────────────────────

const VISIBILITY_SEGMENT: Record<MaddoxVisibility, string> = { players: "jogadores", master: "mestre" }

/** Nome legível de cada visibilidade (nome do canal no Engramind e rótulo na rede de `/memorias`). */
export const CAMPAIGN_VISIBILITY_NAMES: Record<MaddoxVisibility, string> = { players: "Jogadores", master: "Mestre" }

export function campaignChannel(campaignId: string, visibility: MaddoxVisibility): string {
    return `${CAMPAIGN_CHANNEL_PREFIX}${campaignId}/${VISIBILITY_SEGMENT[visibility]}`
}

export function campaignChannels(campaignId: string): [string, string] {
    return [campaignChannel(campaignId, "players"), campaignChannel(campaignId, "master")]
}

/** `dndicas/maddox/campanhas/<id>/jogadores|mestre` → campanha e visibilidade (outro slug → `null`). */
export function parseCampaignChannel(slug: string | null | undefined): { campaignId: string; visibility: MaddoxVisibility } | null {
    if (!slug?.startsWith(CAMPAIGN_CHANNEL_PREFIX)) return null
    const [campaignId, segment, ...rest] = slug.slice(CAMPAIGN_CHANNEL_PREFIX.length).split("/")
    if (!campaignId || rest.length || !/^[a-f0-9]{24}$/i.test(campaignId)) return null
    if (segment === "jogadores") return { campaignId, visibility: "players" }
    if (segment === "mestre") return { campaignId, visibility: "master" }
    return null
}

// ── Categorias ──────────────────────────────────────────────────────────────

export interface CategoryDef {
    key: string
    label: string
    priority: number
}

/**
 * Categorias das memórias de campanha (globais na rede; chave em maiúsculas pelo contrato). Prioridade
 * abaixo das padrão da rede, para não reordenar o contexto dos outros apps.
 */
export const CAMPAIGN_CATEGORIES: Record<MaddoxCampaignMemoryKind, CategoryDef> = {
    fato: { key: "FATO", label: "Fato", priority: -10 },
    evento: { key: "EVENTO", label: "Evento", priority: -11 },
    local: { key: "LOCAL", label: "Local", priority: -12 },
    missao: { key: "MISSAO", label: "Missão", priority: -13 },
    relacao: { key: "RELACAO", label: "Relação", priority: -14 },
    outro: { key: "OUTRO", label: "Outro", priority: -15 },
}

export const CAMPAIGN_CATEGORY_LIST: readonly CategoryDef[] = Object.values(CAMPAIGN_CATEGORIES)

/** Formato da chave de categoria do Engramind: maiúsculas, dígitos e `_`, começando por letra, até 40. */
export const CATEGORY_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/

/** Rótulo livre → chave válida (sem acento, maiúsculas, `_`); `null` quando não sobra uma letra inicial. */
export function normalizeCategoryKey(value: string): string | null {
    const key = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/^[0-9_]+/, "")
        .slice(0, 40)
        .replace(/_+$/, "")
    return CATEGORY_KEY_PATTERN.test(key) ? key : null
}

// ── Tempo real e permissões ────────────────────────────────────────────────

export const MEMORIES_VIEW_PERMISSION = "memories.view"
export const MEMORIES_EDIT_PERMISSION = "memories.edit"

/** Evento Pusher no canal da integração (`private-integration-engramind`): `{ type }`, sem textos. */
export const ENGRAMIND_UPDATED_EVENT = "engramind-updated"

/** Espera máxima de um turno pelo provisionamento sob demanda do token do agente. */
export const LAZY_WAIT_MS = 3_000

/** Layout dos universos (DND-34): `{ type }` no canal da integração (aba Visualização). */
export const UNIVERSE_LAYOUT_EVENT_TYPE = "universe-layout"
/** Layout dos universos (DND-34): evento no SSE da rede (`/api/engramind/events`), que a lib ignora e `/memorias` escuta. */
export const UNIVERSE_LAYOUT_LIVE_EVENT = "universe-layout.updated"
