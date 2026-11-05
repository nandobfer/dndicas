import type { MemoryIdentity } from "@/features/engramind/constants"

/**
 * Listas de memórias dos agentes de IA do dndicas (módulo PURO: tela e servidor). Desde a DND-21 as
 * memórias ficam no Engramind: cada lista antiga de `agent_memories` é um canal da rede, assinado pelo
 * agente que a consome (`src/features/engramind`). Este catálogo só mapeia lista → agente/canal (usado
 * pela migração e pelo contexto dos turnos).
 *
 * O Agente Opex tem três canais: os **globais** valem em toda conversa; os **de administradores**, só nos
 * turnos de administradores; os **de usuários**, só nos turnos de usuários comuns e visitantes. Cada
 * outro agente (Gerador de imagens, Entender com IA, Importador 5etools e Maddox) tem o seu.
 */

export const AI_AGENT_IDS = ["opex-global", "opex-admin", "opex-user", "image-generator", "entity-understanding", "entity-import", "maddox"] as const
export type AiAgentId = (typeof AI_AGENT_IDS)[number]

export const AI_AGENTS: Record<AiAgentId, { label: string; title: string; description: string; identity: MemoryIdentity; channel: string }> = {
    "opex-global": {
        label: "Agente Opex (global)",
        title: "Memórias globais",
        description: "Instruções permanentes que o Agente Opex segue em toda conversa, de administradores, usuários e visitantes.",
        identity: "opex",
        channel: "dndicas/opex/global",
    },
    "opex-admin": {
        label: "Agente Opex de administradores",
        title: "Memórias de administradores",
        description: "Instruções permanentes que o Agente Opex segue só nas conversas de administradores.",
        identity: "opex",
        channel: "dndicas/opex/admin",
    },
    "opex-user": {
        label: "Agente Opex de usuários",
        title: "Memórias de usuários",
        description: "Instruções permanentes que o Agente Opex segue só nas conversas de usuários comuns e visitantes.",
        identity: "opex",
        channel: "dndicas/opex/user",
    },
    "image-generator": {
        label: "Gerador de imagens",
        title: "Memórias do Gerador de imagens",
        description: "Instruções permanentes que entram em toda imagem gerada a partir do contexto da ficha ou do formulário (ex.: \"evite fundos brancos\").",
        identity: "image-generator",
        channel: "dndicas/image-generator",
    },
    "entity-understanding": {
        label: "Entender com IA",
        title: "Memórias do Entender com IA",
        description: "Instruções permanentes que o chat \"Entender com IA\" segue ao explicar magias, classes, itens e demais entidades.",
        identity: "entity-understanding",
        channel: "dndicas/entity-understanding",
    },
    "entity-import": {
        label: "Importador 5etools",
        title: "Memórias do Importador 5etools",
        description: "Instruções permanentes de tradução e adaptação usadas ao importar entidades do 5etools (ex.: glossário preferido).",
        identity: "entity-import",
        channel: "dndicas/entity-import",
    },
    maddox: {
        label: "Agente Maddox",
        title: "Memórias do Maddox",
        description: "Instruções permanentes que o Maddox segue como mestre e entrevistador em todas as campanhas (ex.: \"descreva os cenários com os cinco sentidos\").",
        identity: "maddox",
        channel: "dndicas/maddox",
    },
}

export function isAiAgentId(value: string): value is AiAgentId {
    return (AI_AGENT_IDS as readonly string[]).includes(value)
}

/** Canal da lista (o destino da migração). */
export function memoryChannelOf(list: AiAgentId): string {
    return AI_AGENTS[list].channel
}

/** Lista de um canal fixo (`null` para os demais, como os das campanhas). */
export function listOfChannel(slug: string): AiAgentId | null {
    return AI_AGENT_IDS.find((id) => AI_AGENTS[id].channel === slug) ?? null
}

/** Papel do turno do Agente Opex: administrador, usuário logado ou visitante anônimo. */
export type OpexTurnRole = "admin" | "user" | "anonymous"

/** Listas de memórias que entram no prompt do Agente Opex, conforme o papel do turno. */
export function opexMemoryAgentsFor(role: OpexTurnRole): AiAgentId[] {
    return role === "admin" ? ["opex-global", "opex-admin"] : ["opex-global", "opex-user"]
}

/** Canais do contexto de um agente no turno (o Agente Opex depende do papel; os demais, o próprio canal). */
export function contextChannelsFor(identity: MemoryIdentity, role: OpexTurnRole = "anonymous"): string[] {
    if (identity === "opex") return opexMemoryAgentsFor(role).map((list) => AI_AGENTS[list].channel)
    return AI_AGENT_IDS.filter((id) => AI_AGENTS[id].identity === identity).map((id) => AI_AGENTS[id].channel)
}
