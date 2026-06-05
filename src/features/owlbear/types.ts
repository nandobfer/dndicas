import type { ContextMenuIconFilter } from "@owlbear-rodeo/sdk"
import type { DiceRollResponse } from "@/features/dice-roller/types"

export type OwlbearRole = "GM" | "PLAYER"

export type OwlbearThemeMode = "light" | "dark"

export type OwlbearRuntimeStatus = "booting" | "ready" | "unavailable"

export type OwlbearTabId = "ficha" | "fichas" | "npcs" | "catalogo" | "dados"

export type OwlbearSheetViewMode = "picker" | "editor"

export interface OwlbearDiceHistoryEntry {
    id: string
    playerName: string
    playerId?: string
    playerRole?: OwlbearRole
    characterName?: string
    result: DiceRollResponse
    createdAt: string
}

export interface OwlbearRoomMetadataState {
    version: number
    playerLinks: Record<string, string>
    diceHistory: OwlbearDiceHistoryEntry[]
    lastSyncAt?: string
}

export interface OwlbearSessionState {
    sessionStatus: "idle" | "loading" | "ready" | "error"
    sessionToken: string | null
    sessionExpiresAt: string | null
}

export interface OwlbearTokenLinkMetadata {
    version: number
    kind: "player" | "npc"
    refId: string
    tokenId: string
    overlayIds: string[]
    linkedAt?: string
}

export interface OwlbearOverlayMetadata {
    version: number
    tokenId: string
    role: "backdrop" | "fill" | "label"
}

export interface OwlbearRuntimeState {
    status: OwlbearRuntimeStatus
    role: OwlbearRole | null
    roomId: string | null
    playerId: string | null
    themeMode: OwlbearThemeMode
    sceneReady: boolean
}

export interface OwlbearTheme {
    mode: "LIGHT" | "DARK"
}

export interface OwlbearPoint {
    x: number
    y: number
}

export interface OwlbearSceneItem {
    id: string
    type: string
    name: string
    visible: boolean
    locked: boolean
    createdUserId: string
    zIndex: number
    lastModified: string
    lastModifiedUserId: string
    position: OwlbearPoint
    rotation: number
    scale: OwlbearPoint
    metadata: Record<string, unknown>
    layer: string
    attachedTo?: string
    disableHit?: boolean
    disableAutoZIndex?: boolean
    disableAttachmentBehavior?: string[]
    description?: string
}

export interface OwlbearContextMenuContext {
    items: OwlbearSceneItem[]
}

export interface OwlbearPartyPlayer {
    id: string
    name: string
    role: OwlbearRole
}

export interface OwlbearSdkLike {
    onReady: (callback: () => void) => void | (() => void)
    readonly isReady: boolean
    isAvailable: boolean
    player: {
        getId: () => Promise<string>
        getName: () => Promise<string>
        getRole: () => Promise<OwlbearRole>
    }
    party: {
        getPlayers: () => Promise<OwlbearPartyPlayer[]>
        onChange: (callback: (players: OwlbearPartyPlayer[]) => void) => void | (() => void)
    }
    room: {
        id?: string
        getMetadata: () => Promise<Record<string, unknown>>
        setMetadata: (update: Record<string, unknown>) => Promise<void>
        onMetadataChange: (callback: (metadata: Record<string, unknown>) => void) => void | (() => void)
    }
    contextMenu: {
        create: (contextMenu: {
            id: string
            icons: Array<{
                icon: string
                label: string
                filter?: ContextMenuIconFilter
            }>
            onClick?: (context: OwlbearContextMenuContext, elementId: string) => void
        }) => Promise<void>
        remove: (id: string) => Promise<void>
    }
    scene: {
        isReady: () => Promise<boolean>
        onReadyChange: (callback: (ready: boolean) => void) => void | (() => void)
        items: {
            getItems: () => Promise<OwlbearSceneItem[]>
            updateItems: (
                filterOrItems: string[] | OwlbearSceneItem[],
                update: (draft: OwlbearSceneItem[]) => void
            ) => Promise<void>
            addItems: (items: OwlbearSceneItem[]) => Promise<void>
            deleteItems: (ids: string[]) => Promise<void>
            onChange: (callback: (items: OwlbearSceneItem[]) => void) => void | (() => void)
        }
    }
    theme: {
        getTheme: () => Promise<OwlbearTheme>
        onChange: (callback: (theme: OwlbearTheme) => void) => void | (() => void)
    }
}
