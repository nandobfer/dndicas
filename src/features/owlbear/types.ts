import type { ContextMenuIconFilter, Metadata } from "@owlbear-rodeo/sdk"
import type { DiceRollResponse } from "@/features/dice-roller/types"

export type OwlbearRole = "GM" | "PLAYER"

export type OwlbearThemeMode = "light" | "dark"

export type OwlbearRuntimeStatus = "booting" | "ready" | "unavailable"

export type OwlbearTabId = "ficha" | "fichas" | "npcs" | "iniciativa" | "catalogo" | "dados"

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

export interface OwlbearNpcInitiativeEntry {
    initiative: number
    roll: number
    dexModifier: number
    addedAt: string
}

export interface OwlbearPlayerInitiativeEntry {
    initiative: number
    updatedAt: string
}

export interface OwlbearInitiativeState {
    npcs: Record<string, OwlbearNpcInitiativeEntry>
    players: Record<string, OwlbearPlayerInitiativeEntry>
}

export interface OwlbearRoomMetadataState {
    version: number
    playerLinks: Record<string, string>
    diceHistory: OwlbearDiceHistoryEntry[]
    initiative: OwlbearInitiativeState
    lastSyncAt?: string
}

export interface OwlbearSessionState {
    sessionStatus: "idle" | "loading" | "ready" | "error"
    sessionToken: string | null
    sessionExpiresAt: string | null
}

export interface OwlbearTokenLinkMetadata {
    version: number
    /**
     * "player" → vínculo com ficha de personagem (CharacterSheet).
     * "npc"    → vínculo com NPC/monstro da sala (OwlbearRoomNpc).
     * No futuro, o fluxo "npc" repetirá o de "player" mas sincronizando
     * com a ficha local do NPC em vez de uma CharacterSheet.
     */
    kind: "player" | "npc"
    /** _id da CharacterSheet (kind=player) ou id do OwlbearRoomNpc (kind=npc). */
    refId: string
    tokenId: string
    overlayIds: string[]
    linkedAt?: string
}

export interface OwlbearOverlayMetadata {
    version: number
    tokenId: string
    /** "label" é legado do overlay textual antigo e deve ser removido no próximo sync. */
    role: "backdrop" | "bar" | "label"
    barWidth?: number
    barColor?: string
}

export interface OwlbearPendingTokenLinkMetadata {
    version: number
    kind: "player" | "npc"
    tokenId: string
    tokenName?: string
    createdAt: string
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

export interface OwlbearSceneItemBounds {
    min: OwlbearPoint
    max: OwlbearPoint
    width: number
    height: number
    center: OwlbearPoint
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
    action: {
        open: () => Promise<void>
        close: () => Promise<void>
    }
    player: {
        getId: () => Promise<string>
        getName: () => Promise<string>
        getRole: () => Promise<OwlbearRole>
        getMetadata: () => Promise<Metadata>
        setMetadata: (update: Partial<Metadata>) => Promise<void>
        deselect: (items?: string[]) => Promise<void>
        onChange?: (callback: (player: { metadata?: Metadata }) => void) => void | (() => void)
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
        local: {
            addItems: (items: OwlbearSceneItem[]) => Promise<void>
            deleteItems: (ids: string[]) => Promise<void>
        }
        items: {
            getItems: () => Promise<OwlbearSceneItem[]>
            getItemBounds: (ids: string[]) => Promise<OwlbearSceneItemBounds>
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
