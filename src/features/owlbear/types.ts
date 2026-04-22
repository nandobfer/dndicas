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
    scene: {
        isReady: () => Promise<boolean>
        onReadyChange: (callback: (ready: boolean) => void) => void | (() => void)
    }
    theme: {
        getTheme: () => Promise<OwlbearTheme>
        onChange: (callback: (theme: OwlbearTheme) => void) => void | (() => void)
    }
}
