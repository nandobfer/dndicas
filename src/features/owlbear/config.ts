import type { OwlbearTabId } from "./types"

export const OWLBEAR_POPOVER_SIZES: Record<OwlbearTabId | "fallback" | "ficha-picker" | "ficha-editor", { width: number; height: number }> = {
    ficha: { width: 1180, height: 900 },
    "ficha-picker": { width: 980, height: 820 },
    "ficha-editor": { width: 1180, height: 900 },
    fichas: { width: 920, height: 760 },
    npcs: { width: 920, height: 760 },
    catalogo: { width: 1320, height: 900 },
    fallback: { width: 720, height: 520 },
}

export const OWLBEAR_MANIFEST_ACTION_TITLE = "Dndicas"
export const OWLBEAR_ROOM_METADATA_KEY = "com.dndicas.owlbear/room"
export const OWLBEAR_ROOM_METADATA_VERSION = 1
