"use client"

import { useAuth } from "@/core/hooks/useAuth"
import { ViewAsSelector } from "./ViewAsSelector"

/**
 * "Visualizar como" no header fixo, só para o administrador real. Fica no header (e não numa faixa no topo da
 * página): uma faixa no fluxo ficaria escondida atrás do header fixo e empurraria o conteúdo para baixo.
 */
export function HeaderViewAs() {
    const { realIsAdmin } = useAuth()
    if (!realIsAdmin) return null
    return (
        <div data-testid="header-view-as">
            <ViewAsSelector />
        </div>
    )
}
