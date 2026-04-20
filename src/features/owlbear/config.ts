import type { OwlbearTabId } from "./types"

export const OWLBEAR_POPOVER_SIZES: Record<OwlbearTabId | "fallback", { width: number; height: number }> = {
    ficha: { width: 1180, height: 900 },
    fichas: { width: 920, height: 760 },
    npcs: { width: 920, height: 760 },
    catalogo: { width: 1320, height: 900 },
    fallback: { width: 720, height: 520 },
}

export const OWLBEAR_MANIFEST_ACTION_TITLE = "Dndicas"
