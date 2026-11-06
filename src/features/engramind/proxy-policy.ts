/**
 * Lista de permissão do proxy da rede (`/api/engramind/[...path]`, DND-21; módulo PURO). O dndicas é só
 * leitura na rede: a página `/memorias` lê com o token de app e só importa memórias (`memories.edit`).
 * Qualquer outra operação do modo app (criar, editar, mover, arquivar ou excluir memória, categorias,
 * agentes, tokens, assinaturas, canais e webhook) recebe `403 ENGRAMIND_READ_ONLY` sem chamar o
 * Engramind. Operação nova só passa quando entra aqui de propósito.
 */

export const PROXY_READ_OPERATIONS = [
    "whoami",
    "get_consumer_settings",
    "list_categories",
    "list_agents",
    "get_agent",
    "list_subscriptions",
    "list_channels",
    "get_channel",
    "channel_stats",
    "list_memories",
    "get_memory",
    "memory_history",
    "search_memories",
    "get_hints",
    "get_app",
] as const

export const PROXY_EDIT_OPERATIONS = ["import_memories"] as const

export type ProxyAccess = "view" | "edit" | "blocked"

export function proxyAccessOf(operation: string | null): ProxyAccess {
    if (!operation) return "blocked"
    if ((PROXY_READ_OPERATIONS as readonly string[]).includes(operation)) return "view"
    if ((PROXY_EDIT_OPERATIONS as readonly string[]).includes(operation)) return "edit"
    return "blocked"
}

export const READ_ONLY_MESSAGE = "A rede de memórias do dndicas é só para leitura: edite as memórias pelo Opex."
