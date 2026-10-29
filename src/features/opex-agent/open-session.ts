/**
 * Pedido para abrir o Agente Opex numa sessão (ex.: "Abrir sessão" de um job). O item da barra
 * lateral escuta o evento, abre o painel e ativa a aba da sessão.
 */
export const OPEX_OPEN_SESSION_EVENT = "opex:open-session"

export function requestOpenOpexSession(sessionId: string): void {
    window.dispatchEvent(new CustomEvent<{ sessionId: string }>(OPEX_OPEN_SESSION_EVENT, { detail: { sessionId } }))
}

/** Assina os pedidos; devolve o cancelamento. */
export function onOpenOpexSession(listener: (sessionId: string) => void): () => void {
    const handler = (event: Event) => {
        const sessionId = (event as CustomEvent<{ sessionId?: string }>).detail?.sessionId
        if (sessionId) listener(sessionId)
    }
    window.addEventListener(OPEX_OPEN_SESSION_EVENT, handler)
    return () => window.removeEventListener(OPEX_OPEN_SESSION_EVENT, handler)
}
