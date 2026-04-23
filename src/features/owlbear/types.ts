export type OwlbearRole = "GM" | "PLAYER"

export type OwlbearThemeMode = "light" | "dark"

export type OwlbearRuntimeStatus = "booting" | "ready" | "unavailable"

export type OwlbearTabId = "ficha" | "fichas" | "npcs" | "catalogo"

export type OwlbearSheetViewMode = "picker" | "editor"

export interface OwlbearRoomMetadataState {
    version: number
    playerLinks: Record<string, string>
    lastSyncAt?: string
}

export interface OwlbearSessionState {
    sessionStatus: "idle" | "loading" | "ready" | "error"
    sessionToken: string | null
    sessionExpiresAt: string | null
}

export interface OwlbearTokenLinkMetadata {
    version: number
    kind: "player"
    refId: string
    tokenId: string
    overlayIds: string[]
    linkedAt?: string
}

export interface OwlbearOverlayMetadata {
    version: number
    tokenId: string
    role: "backdrop" | "label"
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

export interface OwlbearSdkLike {
    onReady: (callback: () => void) => void | (() => void)
    readonly isReady: boolean
    isAvailable: boolean
    action: {
        setWidth: (width: number) => Promise<unknown>
        setHeight: (height: number) => Promise<unknown>
    }
    player: {
        getId: () => Promise<string>
        getRole: () => Promise<OwlbearRole>
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
                filter?: {
                    min?: number
                    max?: number
                    roles?: OwlbearRole[]
                }
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
