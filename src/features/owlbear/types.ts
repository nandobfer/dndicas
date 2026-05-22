export type OwlbearRole = "GM" | "PLAYER"

export type OwlbearThemeMode = "light" | "dark"

export type OwlbearRuntimeStatus = "booting" | "ready" | "unavailable"

export type OwlbearTabId = "ficha" | "fichas" | "npcs" | "catalogo"

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
