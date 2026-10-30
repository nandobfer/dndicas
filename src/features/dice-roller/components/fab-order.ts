"use client"

import * as React from "react"

/** Botões flutuantes do canto inferior direito. */
export const FAB_IDS = ["dice", "opex", "search"] as const
export type FabId = (typeof FAB_IDS)[number]

export const DEFAULT_FAB_ORDER: readonly FabId[] = ["dice", "opex", "search"]
export const FAB_ORDER_STORAGE_KEY = "dndicas:fab-order"

/** Mouse: o arraste só começa depois de alguns pixels (clique simples abre o botão). */
export const FAB_MOUSE_ACTIVATION = { distance: 6 } as const
/** Toque: segurar um instante e não mover mais que a tolerância (rolar a página não arrasta). */
export const FAB_TOUCH_ACTIVATION = { delay: 250, tolerance: 8 } as const

function isFabId(value: unknown): value is FabId {
    return typeof value === "string" && (FAB_IDS as readonly string[]).includes(value)
}

/** Aceita só uma permutação exata dos botões; qualquer outro valor (antigo, inválido) volta ao padrão. */
export function normalizeFabOrder(value: unknown): FabId[] {
    if (!Array.isArray(value) || value.length !== FAB_IDS.length) return [...DEFAULT_FAB_ORDER]
    if (!value.every(isFabId) || new Set(value).size !== FAB_IDS.length) return [...DEFAULT_FAB_ORDER]
    return [...value]
}

export function parseStoredFabOrder(raw: string | null): FabId[] {
    if (!raw) return [...DEFAULT_FAB_ORDER]
    try {
        return normalizeFabOrder(JSON.parse(raw))
    } catch {
        return [...DEFAULT_FAB_ORDER]
    }
}

/**
 * Move `activeId` para a posição de `overId` entre os botões visíveis e projeta o resultado na ordem
 * completa: os ocultos ficam nas posições que já tinham. Sem destino (`overId` nulo, solto fora da
 * linha) ou destino igual, a ordem não muda.
 */
export function moveFab(order: readonly FabId[], visible: readonly FabId[], activeId: FabId, overId: FabId | null): FabId[] {
    const current = [...order]
    if (!overId || activeId === overId) return current
    const visibleOrder = current.filter((id) => visible.includes(id))
    const from = visibleOrder.indexOf(activeId)
    const to = visibleOrder.indexOf(overId)
    if (from < 0 || to < 0) return current
    visibleOrder.splice(to, 0, ...visibleOrder.splice(from, 1))
    let next = 0
    return current.map((id) => (visible.includes(id) ? visibleOrder[next++] : id))
}

function readStoredOrder(): FabId[] {
    try {
        return parseStoredFabOrder(window.localStorage.getItem(FAB_ORDER_STORAGE_KEY))
    } catch {
        return [...DEFAULT_FAB_ORDER]
    }
}

/**
 * Ordem dos botões salva no navegador (vale para visitante, em todas as telas e ao recarregar).
 * `ready` só fica verdadeiro depois de ler o `localStorage`, para não mostrar a ordem padrão e
 * reordenar logo em seguida.
 */
export function useFabOrder() {
    const [order, setOrder] = React.useState<FabId[]>(() => [...DEFAULT_FAB_ORDER])
    const [ready, setReady] = React.useState(false)

    React.useEffect(() => {
        setOrder(readStoredOrder())
        setReady(true)
    }, [])

    const saveOrder = React.useCallback((next: FabId[]) => {
        const normalized = normalizeFabOrder(next)
        setOrder(normalized)
        try {
            window.localStorage.setItem(FAB_ORDER_STORAGE_KEY, JSON.stringify(normalized))
        } catch {
            // Armazenamento bloqueado: a ordem vale até recarregar.
        }
    }, [])

    return { order, saveOrder, ready }
}
