"use client"

import { configurePusherClient, type PusherClientConfig } from "./client"

interface PusherConfigBridgeProps {
    /** Configuração pública (key, modo, cluster ou URL) vinda da integração "Pusher". */
    config: PusherClientConfig
}

/**
 * Aplica a configuração pública do Pusher vinda do servidor ANTES de qualquer efeito dos
 * filhos: é renderizado no topo do layout raiz, e os `useEffect` que assinam canais só
 * rodam depois do render da árvore inteira.
 */
export function PusherConfigBridge({ config }: PusherConfigBridgeProps) {
    if (typeof window !== "undefined") configurePusherClient(config)
    return null
}
