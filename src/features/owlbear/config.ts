export const OWLBEAR_ACTION_SIZE = { width: 900, height: 900 } as const
export const OWLBEAR_SESSION_INVALID_EVENT = "dndicas:owlbear-session-invalid"

export const OWLBEAR_ACTIONS = {
    catalog: {
        title: "Dndicas - catalogo",
        iconPath: "/owlbear/icons/catalog.svg",
        manifestPath: "/owlbear/catalog/manifest.json",
        actionPath: "/owlbear/catalog/action",
    },
    sheet: {
        title: "Dndicas - ficha",
        iconPath: "/owlbear/icons/sheet.svg",
        manifestPath: "/owlbear/sheet/manifest.json",
        actionPath: "/owlbear/sheet/action",
        backgroundPath: "/owlbear/sheet/background",
        actionSize: { width: 1024, height: OWLBEAR_ACTION_SIZE.height },
    },
    npcs: {
        title: "Dndicas - npcs",
        iconPath: "/owlbear/icons/npcs.svg",
        manifestPath: "/owlbear/npcs/manifest.json",
        actionPath: "/owlbear/npcs/action",
        backgroundPath: "/owlbear/npcs/background",
        actionSize: { width: 600, height: OWLBEAR_ACTION_SIZE.height },
    },
    dice: {
        title: "Dndicas - dados",
        iconPath: "/owlbear/icons/dice.svg",
        manifestPath: "/owlbear/dice/manifest.json",
        actionPath: "/owlbear/dice/action",
    },
} as const

export const OWLBEAR_ROOM_METADATA_KEY = "com.dndicas.owlbear/room"
export const OWLBEAR_ROOM_METADATA_VERSION = 1
export const OWLBEAR_DICE_HISTORY_LIMIT = 13
export const OWLBEAR_TOKEN_METADATA_KEY = "com.dndicas.owlbear/token"
export const OWLBEAR_OVERLAY_METADATA_KEY = "com.dndicas.owlbear/overlay"
export const OWLBEAR_PENDING_TOKEN_LINK_METADATA_KEY = "com.dndicas.owlbear/pending-token-link"
export const OWLBEAR_TOKEN_METADATA_VERSION = 1
export const OWLBEAR_OVERLAY_METADATA_VERSION = 1
