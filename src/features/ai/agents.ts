/**
 * Listas de memórias dos agentes de IA do DnDicas (módulo PURO: tela e servidor). Copiado do
 * catálogo de agentes do Opex: uma lista nova entra aqui e ganha, sem código novo, a API, as
 * ferramentas de memória do Agente Opex (`agent`) e o card na aba de configuração do agente (`tab`).
 *
 * O Agente Opex tem três listas: as **globais** valem em toda conversa; as **de administradores**, só
 * nos turnos de administradores; as **de usuários**, só nos turnos de usuários comuns e visitantes.
 * Cada agente do app (Gerador de imagens, Entender com IA, Importador 5etools) tem uma lista própria,
 * que entra nas instruções de toda geração dele. O Agente Maddox (Campanhas Maddox) também tem a sua.
 */

export const AI_AGENT_IDS = ["opex-global", "opex-admin", "opex-user", "image-generator", "entity-understanding", "entity-import", "maddox"] as const
export type AiAgentId = (typeof AI_AGENT_IDS)[number]

export const AI_AGENTS: Record<AiAgentId, { label: string; title: string; description: string; tab: string }> = {
    "opex-global": {
        label: "Agente Opex (global)",
        title: "Memórias globais",
        description: "Instruções permanentes que o Agente Opex segue em toda conversa, de administradores, usuários e visitantes.",
        tab: "agente-opex",
    },
    "opex-admin": {
        label: "Agente Opex de administradores",
        title: "Memórias de administradores",
        description: "Instruções permanentes que o Agente Opex segue só nas conversas de administradores.",
        tab: "agente-opex",
    },
    "opex-user": {
        label: "Agente Opex de usuários",
        title: "Memórias de usuários",
        description: "Instruções permanentes que o Agente Opex segue só nas conversas de usuários comuns e visitantes.",
        tab: "agente-opex",
    },
    "image-generator": {
        label: "Gerador de imagens",
        title: "Memórias do Gerador de imagens",
        description: "Instruções permanentes que entram em toda imagem gerada a partir do contexto da ficha ou do formulário (ex.: \"evite fundos brancos\").",
        tab: "gerador-imagens",
    },
    "entity-understanding": {
        label: "Entender com IA",
        title: "Memórias do Entender com IA",
        description: "Instruções permanentes que o chat \"Entender com IA\" segue ao explicar magias, classes, itens e demais entidades.",
        tab: "entender-com-ia",
    },
    "entity-import": {
        label: "Importador 5etools",
        title: "Memórias do Importador 5etools",
        description: "Instruções permanentes de tradução e adaptação usadas ao importar entidades do 5etools (ex.: glossário preferido).",
        tab: "importador-5etools",
    },
    maddox: {
        label: "Agente Maddox",
        title: "Memórias do Maddox",
        description: "Instruções permanentes que o Maddox segue como mestre e entrevistador em todas as campanhas (ex.: \"descreva os cenários com os cinco sentidos\").",
        tab: "agente-maddox",
    },
}

/** Listas exibidas numa aba de `/integracoes/ia` (cada agente mostra só as suas). */
export function aiAgentsOfTab(tab: string): AiAgentId[] {
    return AI_AGENT_IDS.filter((id) => AI_AGENTS[id].tab === tab)
}

export function isAiAgentId(value: string): value is AiAgentId {
    return (AI_AGENT_IDS as readonly string[]).includes(value)
}

/** Papel do turno do Agente Opex: administrador, usuário logado ou visitante anônimo. */
export type OpexTurnRole = "admin" | "user" | "anonymous"

/** Listas de memórias que entram no prompt do Agente Opex, conforme o papel do turno. */
export function opexMemoryAgentsFor(role: OpexTurnRole): AiAgentId[] {
    return role === "admin" ? ["opex-global", "opex-admin"] : ["opex-global", "opex-user"]
}
