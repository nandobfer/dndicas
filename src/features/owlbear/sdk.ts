import {
    OWLBEAR_OVERLAY_METADATA_KEY,
    OWLBEAR_OVERLAY_METADATA_VERSION,
    OWLBEAR_POPOVER_SIZES,
    OWLBEAR_ROOM_METADATA_KEY,
    OWLBEAR_ROOM_METADATA_VERSION,
    OWLBEAR_TOKEN_METADATA_KEY,
    OWLBEAR_TOKEN_METADATA_VERSION,
} from "./config"
import type {
    OwlbearOverlayMetadata,
    OwlbearRoomMetadataState,
    OwlbearRuntimeState,
    OwlbearSdkLike,
    OwlbearSceneItem,
    OwlbearTheme,
    OwlbearTokenLinkMetadata,
} from "./types"

const READY_TIMEOUT_MS = 4000

function getThemeMode(theme: OwlbearTheme | null | undefined): OwlbearRuntimeState["themeMode"] {
    return theme?.mode === "LIGHT" ? "light" : "dark"
}

function getEmptyRoomMetadata(): OwlbearRoomMetadataState {
    return {
        version: OWLBEAR_ROOM_METADATA_VERSION,
        playerLinks: {},
    }
}

export async function loadOwlbearSdk(): Promise<OwlbearSdkLike | null> {
    if (typeof window === "undefined") return null

    const module = await import("@owlbear-rodeo/sdk")
    return module.default as OwlbearSdkLike
}

export async function loadOwlbearSdkModule() {
    if (typeof window === "undefined") return null
    return import("@owlbear-rodeo/sdk")
}

function waitForOwlbearReady(sdk: OwlbearSdkLike, timeoutMs = READY_TIMEOUT_MS) {
    return new Promise<void>((resolve, reject) => {
        if (!sdk.isAvailable) {
            reject(new Error("Owlbear SDK unavailable in this context"))
            return
        }

        if (sdk.isReady) {
            resolve()
            return
        }

        const timeoutId = window.setTimeout(() => {
            reject(new Error("Timed out waiting for Owlbear SDK ready event"))
        }, timeoutMs)

        sdk.onReady(() => {
            window.clearTimeout(timeoutId)
            resolve()
        })
    })
}

export async function bootstrapOwlbearRuntime(): Promise<OwlbearRuntimeState> {
    try {
        const sdk = await loadOwlbearSdk()
        if (!sdk) {
            throw new Error("Owlbear SDK unavailable during SSR")
        }

        await waitForOwlbearReady(sdk)

        const [role, playerId, theme, sceneReady] = await Promise.all([
            sdk.player.getRole(),
            sdk.player.getId(),
            sdk.theme.getTheme(),
            sdk.scene.isReady(),
        ])

        return {
            status: "ready",
            role,
            roomId: sdk.room.id ?? null,
            playerId,
            themeMode: getThemeMode(theme),
            sceneReady,
        }
    } catch (error) {
        console.error("Failed to bootstrap Owlbear runtime", error)

        return {
            status: "unavailable",
            role: null,
            roomId: null,
            playerId: null,
            themeMode: "dark",
            sceneReady: false,
        }
    }
}

export async function setActionPopoverSize(tabId: keyof typeof OWLBEAR_POPOVER_SIZES) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return

    const size = OWLBEAR_POPOVER_SIZES[tabId]
    await Promise.all([sdk.action.setWidth(size.width), sdk.action.setHeight(size.height)])
}

export async function openOwlbearBackendSession(input: {
    roomId: string
    owlbearPlayerId: string
    owlbearRole: "GM" | "PLAYER"
}) {
    const response = await fetch("/api/owlbear/session", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Erro desconhecido" }))
        const nextError = new Error(error.error ?? `HTTP ${response.status}`) as Error & { status?: number }
        nextError.status = response.status
        throw nextError
    }

    return response.json() as Promise<{ token: string; expiresAt: string }>
}

export function parseRoomMetadata(metadata: Record<string, unknown> | null | undefined): OwlbearRoomMetadataState {
    const value = metadata?.[OWLBEAR_ROOM_METADATA_KEY]
    if (!value || typeof value !== "object") {
        return getEmptyRoomMetadata()
    }

    const parsed = value as Partial<OwlbearRoomMetadataState>
    return {
        version: typeof parsed.version === "number" ? parsed.version : OWLBEAR_ROOM_METADATA_VERSION,
        playerLinks: parsed.playerLinks && typeof parsed.playerLinks === "object" ? parsed.playerLinks : {},
        lastSyncAt: typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : undefined,
    }
}

export async function getRoomMetadataState() {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) {
        throw new Error("Owlbear SDK indisponível para metadata da sala")
    }

    return parseRoomMetadata(await sdk.room.getMetadata())
}

async function updateRoomMetadata(mutator: (current: OwlbearRoomMetadataState) => OwlbearRoomMetadataState) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) {
        throw new Error("Owlbear SDK indisponível para atualizar metadata da sala")
    }

    const currentMetadata = await sdk.room.getMetadata()
    const nextValue = mutator(parseRoomMetadata(currentMetadata))
    await sdk.room.setMetadata({
        ...currentMetadata,
        [OWLBEAR_ROOM_METADATA_KEY]: nextValue,
    })

    return nextValue
}

export async function setPlayerSheetLink(owlbearPlayerId: string, sheetId: string) {
    return updateRoomMetadata((current) => ({
        ...current,
        version: OWLBEAR_ROOM_METADATA_VERSION,
        playerLinks: {
            ...current.playerLinks,
            [owlbearPlayerId]: sheetId,
        },
        lastSyncAt: new Date().toISOString(),
    }))
}

export async function clearPlayerSheetLink(owlbearPlayerId: string) {
    return updateRoomMetadata((current) => {
        const nextLinks = { ...current.playerLinks }
        delete nextLinks[owlbearPlayerId]

        return {
            ...current,
            version: OWLBEAR_ROOM_METADATA_VERSION,
            playerLinks: nextLinks,
            lastSyncAt: new Date().toISOString(),
        }
    })
}

export async function subscribeToRoomMetadata(callback: (state: OwlbearRoomMetadataState) => void) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) {
        return () => undefined
    }

    return sdk.room.onMetadataChange((metadata) => {
        callback(parseRoomMetadata(metadata))
    }) || (() => undefined)
}

export function parseTokenLinkMetadata(metadata: Record<string, unknown> | null | undefined): OwlbearTokenLinkMetadata | null {
    const value = metadata?.[OWLBEAR_TOKEN_METADATA_KEY]
    if (!value || typeof value !== "object") {
        return null
    }

    const parsed = value as Partial<OwlbearTokenLinkMetadata>
    if (parsed.kind !== "player" || typeof parsed.refId !== "string" || typeof parsed.tokenId !== "string") {
        return null
    }

    return {
        version: typeof parsed.version === "number" ? parsed.version : OWLBEAR_TOKEN_METADATA_VERSION,
        kind: "player",
        refId: parsed.refId,
        tokenId: parsed.tokenId,
        overlayIds: Array.isArray(parsed.overlayIds) ? parsed.overlayIds.filter((id): id is string => typeof id === "string") : [],
        linkedAt: typeof parsed.linkedAt === "string" ? parsed.linkedAt : undefined,
    }
}

export function parseOverlayMetadata(metadata: Record<string, unknown> | null | undefined): OwlbearOverlayMetadata | null {
    const value = metadata?.[OWLBEAR_OVERLAY_METADATA_KEY]
    if (!value || typeof value !== "object") {
        return null
    }

    const parsed = value as Partial<OwlbearOverlayMetadata>
    if (typeof parsed.tokenId !== "string" || (parsed.role !== "backdrop" && parsed.role !== "label")) {
        return null
    }

    return {
        version: typeof parsed.version === "number" ? parsed.version : OWLBEAR_OVERLAY_METADATA_VERSION,
        tokenId: parsed.tokenId,
        role: parsed.role,
    }
}

export function getTokenLinkFromItem(item: OwlbearSceneItem | null | undefined) {
    return parseTokenLinkMetadata(item?.metadata)
}

export function getOverlayLinkFromItem(item: OwlbearSceneItem | null | undefined) {
    return parseOverlayMetadata(item?.metadata)
}

export async function setTokenSheetLink(tokenId: string, sheetId: string, overlayIds: string[] = []) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) {
        throw new Error("Owlbear SDK indisponível para vincular token")
    }

    await sdk.scene.items.updateItems([tokenId], (draft) => {
        const item = draft[0]
        if (!item) return
        item.metadata = {
            ...item.metadata,
            [OWLBEAR_TOKEN_METADATA_KEY]: {
                version: OWLBEAR_TOKEN_METADATA_VERSION,
                kind: "player",
                refId: sheetId,
                tokenId,
                overlayIds,
                linkedAt: new Date().toISOString(),
            } satisfies OwlbearTokenLinkMetadata,
        }
    })
}

export async function updateTokenOverlayIds(tokenId: string, overlayIds: string[]) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) {
        throw new Error("Owlbear SDK indisponível para atualizar overlays do token")
    }

    await sdk.scene.items.updateItems([tokenId], (draft) => {
        const item = draft[0]
        if (!item) return
        const current = parseTokenLinkMetadata(item.metadata)
        if (!current) return
        item.metadata = {
            ...item.metadata,
            [OWLBEAR_TOKEN_METADATA_KEY]: {
                ...current,
                overlayIds,
            } satisfies OwlbearTokenLinkMetadata,
        }
    })
}

export async function clearTokenSheetLink(tokenId: string) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) {
        throw new Error("Owlbear SDK indisponível para desvincular token")
    }

    await sdk.scene.items.updateItems([tokenId], (draft) => {
        const item = draft[0]
        if (!item) return
        const nextMetadata = { ...item.metadata }
        delete nextMetadata[OWLBEAR_TOKEN_METADATA_KEY]
        item.metadata = nextMetadata
    })
}

export async function fetchOwlbearSheetById(sheetId: string, sessionToken: string) {
    const response = await fetch(`/api/owlbear/character-sheets/${sheetId}`, {
        headers: {
            Authorization: `Bearer ${sessionToken}`,
        },
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Erro desconhecido" }))
        throw new Error(error.error ?? `HTTP ${response.status}`)
    }

    return response.json()
}
