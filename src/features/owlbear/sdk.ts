import {
    OWLBEAR_DICE_HISTORY_LIMIT,
    OWLBEAR_OVERLAY_METADATA_KEY,
    OWLBEAR_OVERLAY_METADATA_VERSION,
    OWLBEAR_ROOM_METADATA_KEY,
    OWLBEAR_ROOM_METADATA_VERSION,
    OWLBEAR_SESSION_INVALID_EVENT,
    OWLBEAR_TOKEN_METADATA_KEY,
    OWLBEAR_TOKEN_METADATA_VERSION,
} from "./config"
import { DICE_TYPES, type DiceRollMode, type DiceRollResponse, type DiceRollTermResult, type DiceType } from "@/features/dice-roller/types"
import type {
    OwlbearDiceHistoryEntry,
    OwlbearOverlayMetadata,
    OwlbearRoomMetadataState,
    OwlbearRuntimeState,
    OwlbearSdkLike,
    OwlbearSceneItem,
    OwlbearTheme,
    OwlbearTokenLinkMetadata,
} from "./types"
import { logOwlbearDebug } from "./debug"

const NPC_TOKEN_HIGHLIGHT_PADDING = 28
const NPC_TOKEN_HIGHLIGHT_COLOR = "#f59e0b"

let currentNpcTokenHighlightId: string | null = null
let npcTokenHighlightRequestId = 0

export function notifyOwlbearSessionInvalid() {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent(OWLBEAR_SESSION_INVALID_EVENT))
}

function createOwlbearHttpError(response: Response, error: { error?: string; message?: string }, fallback: string) {
    const nextError = new Error(error.error ?? error.message ?? fallback) as Error & { status?: number }
    nextError.status = response.status
    if (response.status === 401 && nextError.message.toLowerCase().includes("sessão owlbear")) {
        notifyOwlbearSessionInvalid()
    }
    return nextError
}

function getThemeMode(theme: OwlbearTheme | null | undefined): OwlbearRuntimeState["themeMode"] {
    return theme?.mode === "LIGHT" ? "light" : "dark"
}

function getEmptyRoomMetadata(): OwlbearRoomMetadataState {
    return {
        version: OWLBEAR_ROOM_METADATA_VERSION,
        playerLinks: {},
        diceHistory: [],
        initiative: {
            npcs: {},
            players: {},
        },
    }
}

function isDiceType(value: unknown): value is DiceType {
    return typeof value === "string" && DICE_TYPES.includes(value as DiceType)
}

function isDiceRollMode(value: unknown): value is DiceRollMode {
    return value === "normal" || value === "advantage" || value === "disadvantage"
}

function parseDiceRollTermResult(value: unknown): DiceRollTermResult | null {
    if (!value || typeof value !== "object") return null

    const parsed = value as Partial<DiceRollTermResult>
    if (!isDiceType(parsed.dice) || typeof parsed.quantity !== "number" || !Array.isArray(parsed.results)) {
        return null
    }

    const results = parsed.results.filter((result): result is number => typeof result === "number")
    if (results.length !== parsed.results.length) return null

    return {
        dice: parsed.dice,
        quantity: parsed.quantity,
        results,
    }
}

function parseDiceRollResponse(value: unknown): DiceRollResponse | null {
    if (!value || typeof value !== "object") return null

    const parsed = value as Partial<DiceRollResponse>
    if (
        typeof parsed.rollId !== "string"
        || !Array.isArray(parsed.terms)
        || !isDiceRollMode(parsed.mode)
        || typeof parsed.diceTotal !== "number"
        || typeof parsed.modifier !== "number"
        || typeof parsed.total !== "number"
        || typeof parsed.createdAt !== "string"
    ) {
        return null
    }

    const terms = parsed.terms.map(parseDiceRollTermResult)
    if (terms.some((term) => !term)) return null

    return {
        rollId: parsed.rollId,
        label: typeof parsed.label === "string" ? parsed.label : undefined,
        terms: terms.filter((term): term is DiceRollTermResult => Boolean(term)),
        mode: parsed.mode,
        selectedD20: parsed.selectedD20 && typeof parsed.selectedD20 === "object"
            ? {
                kept: typeof parsed.selectedD20.kept === "number" ? parsed.selectedD20.kept : 0,
                discarded: typeof parsed.selectedD20.discarded === "number" ? parsed.selectedD20.discarded : undefined,
                reason: isDiceRollMode(parsed.selectedD20.reason) ? parsed.selectedD20.reason : "normal",
            }
            : undefined,
        diceTotal: parsed.diceTotal,
        modifier: parsed.modifier,
        total: parsed.total,
        createdAt: parsed.createdAt,
    }
}

function parseDiceHistoryEntry(value: unknown): OwlbearDiceHistoryEntry | null {
    if (!value || typeof value !== "object") return null

    const parsed = value as Partial<OwlbearDiceHistoryEntry>
    const result = parseDiceRollResponse(parsed.result)
    if (!result || typeof parsed.id !== "string" || typeof parsed.playerName !== "string" || typeof parsed.createdAt !== "string") {
        return null
    }

    return {
        id: parsed.id,
        playerName: parsed.playerName,
        playerId: typeof parsed.playerId === "string" ? parsed.playerId : undefined,
        playerRole: parsed.playerRole === "GM" || parsed.playerRole === "PLAYER" ? parsed.playerRole : undefined,
        characterName: typeof parsed.characterName === "string" && parsed.characterName.trim() ? parsed.characterName : undefined,
        result,
        createdAt: parsed.createdAt,
    }
}

export async function loadOwlbearSdk(): Promise<OwlbearSdkLike | null> {
    if (typeof window === "undefined") return null

    const sdkModule = await import("@owlbear-rodeo/sdk")
    return sdkModule.default as OwlbearSdkLike
}

export async function loadOwlbearSdkModule() {
    if (typeof window === "undefined") return null
    return import("@owlbear-rodeo/sdk")
}

export async function bootstrapOwlbearRuntime(preloadedSdk?: OwlbearSdkLike | null): Promise<OwlbearRuntimeState> {
    try {
        const sdk = preloadedSdk ?? await loadOwlbearSdk()
        logOwlbearDebug("[Dndicas Owlbear SDK]", "bootstrap loaded sdk", {
            hasSdk: Boolean(sdk),
            isAvailable: sdk?.isAvailable ?? null,
            isReady: sdk?.isReady ?? null,
            roomId: sdk?.room?.id ?? null,
        })
        if (!sdk) {
            throw new Error("Owlbear SDK unavailable during SSR")
        }

        if (!sdk.isAvailable) {
            throw new Error("Owlbear SDK unavailable in this context")
        }

        if (!sdk.isReady) {
            throw new Error("Owlbear SDK is not ready yet")
        }

        const [role, playerId, theme, sceneReady] = await Promise.all([
            sdk.player.getRole(),
            sdk.player.getId(),
            sdk.theme.getTheme(),
            sdk.scene.isReady(),
        ])

        logOwlbearDebug("[Dndicas Owlbear SDK]", "bootstrap resolved context", {
            role,
            playerId,
            roomId: sdk.room.id ?? null,
            themeMode: getThemeMode(theme),
            sceneReady,
        })

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

export async function openOwlbearBackendSession(input: {
    roomId: string
    owlbearPlayerId: string
    owlbearRole: "GM" | "PLAYER"
    bridgeToken?: string
}) {
    logOwlbearDebug("[Dndicas Owlbear Session]", "opening backend session", {
        ...input,
        bridgeToken: input.bridgeToken ? "[present]" : undefined,
    })
    const response = await fetch("/api/owlbear/session", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
    })

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Erro desconhecido" }))
        console.error("[Dndicas Owlbear Session] backend session failed", {
            roomId: input.roomId,
            owlbearPlayerId: input.owlbearPlayerId,
            owlbearRole: input.owlbearRole,
            bridgeToken: input.bridgeToken ? "[present]" : undefined,
            status: response.status,
            error,
        })
        throw createOwlbearHttpError(response, error, `HTTP ${response.status}`)
    }

    const payload = await response.json() as { token: string; expiresAt: string; isAuthenticated?: boolean }
    logOwlbearDebug("[Dndicas Owlbear Session]", "backend session opened", {
        roomId: input.roomId,
        owlbearPlayerId: input.owlbearPlayerId,
        owlbearRole: input.owlbearRole,
        expiresAt: payload.expiresAt,
        hasToken: Boolean(payload.token),
        isAuthenticated: Boolean(payload.isAuthenticated),
    })
    return payload
}

export async function getOwlbearPlayerName() {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) {
        throw new Error("Owlbear SDK indisponível para obter o nome do jogador")
    }

    return sdk.player.getName()
}

export function parseRoomMetadata(metadata: Record<string, unknown> | null | undefined): OwlbearRoomMetadataState {
    const value = metadata?.[OWLBEAR_ROOM_METADATA_KEY]
    if (!value || typeof value !== "object") {
        return getEmptyRoomMetadata()
    }

    const parsed = value as Partial<OwlbearRoomMetadataState>
    const initiative = parsed.initiative && typeof parsed.initiative === "object" ? parsed.initiative : undefined
    return {
        version: typeof parsed.version === "number" ? parsed.version : OWLBEAR_ROOM_METADATA_VERSION,
        playerLinks: parsed.playerLinks && typeof parsed.playerLinks === "object" ? parsed.playerLinks : {},
        diceHistory: Array.isArray(parsed.diceHistory)
            ? parsed.diceHistory
                .map(parseDiceHistoryEntry)
                .filter((entry): entry is OwlbearDiceHistoryEntry => Boolean(entry))
            : [],
        initiative: {
            npcs: initiative?.npcs && typeof initiative.npcs === "object" ? initiative.npcs : {},
            players: initiative?.players && typeof initiative.players === "object" ? initiative.players : {},
        },
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
        const sheetId = current.playerLinks[owlbearPlayerId]
        const nextLinks = { ...current.playerLinks }
        delete nextLinks[owlbearPlayerId]
        const nextPlayerInitiatives = { ...current.initiative.players }
        if (sheetId) delete nextPlayerInitiatives[sheetId]

        return {
            ...current,
            version: OWLBEAR_ROOM_METADATA_VERSION,
            playerLinks: nextLinks,
            initiative: {
                ...current.initiative,
                players: nextPlayerInitiatives,
            },
            lastSyncAt: new Date().toISOString(),
        }
    })
}

export async function setNpcInitiative(input: {
    npcId: string
    initiative: number
    roll: number
    dexModifier: number
}) {
    return updateRoomMetadata((current) => ({
        ...current,
        version: OWLBEAR_ROOM_METADATA_VERSION,
        initiative: {
            ...current.initiative,
            npcs: {
                ...current.initiative.npcs,
                [input.npcId]: {
                    initiative: input.initiative,
                    roll: input.roll,
                    dexModifier: input.dexModifier,
                    addedAt: new Date().toISOString(),
                },
            },
        },
        lastSyncAt: new Date().toISOString(),
    }))
}

export async function removeNpcInitiative(npcId: string) {
    return updateRoomMetadata((current) => {
        const nextNpcs = { ...current.initiative.npcs }
        delete nextNpcs[npcId]

        return {
            ...current,
            version: OWLBEAR_ROOM_METADATA_VERSION,
            initiative: {
                ...current.initiative,
                npcs: nextNpcs,
            },
            lastSyncAt: new Date().toISOString(),
        }
    })
}

export async function setPlayerInitiative(sheetId: string, initiative: number) {
    return updateRoomMetadata((current) => ({
        ...current,
        version: OWLBEAR_ROOM_METADATA_VERSION,
        initiative: {
            ...current.initiative,
            players: {
                ...current.initiative.players,
                [sheetId]: {
                    initiative,
                    updatedAt: new Date().toISOString(),
                },
            },
        },
        lastSyncAt: new Date().toISOString(),
    }))
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

export async function appendRoomDiceHistoryEntry(entry: OwlbearDiceHistoryEntry) {
    return updateRoomMetadata((current) => ({
        ...current,
        version: OWLBEAR_ROOM_METADATA_VERSION,
        diceHistory: [entry, ...current.diceHistory.filter((currentEntry) => currentEntry.id !== entry.id)].slice(0, OWLBEAR_DICE_HISTORY_LIMIT),
        lastSyncAt: new Date().toISOString(),
    }))
}

export function parseTokenLinkMetadata(metadata: Record<string, unknown> | null | undefined): OwlbearTokenLinkMetadata | null {
    const value = metadata?.[OWLBEAR_TOKEN_METADATA_KEY]
    if (!value || typeof value !== "object") {
        return null
    }

    const parsed = value as Partial<OwlbearTokenLinkMetadata>
    if ((parsed.kind !== "player" && parsed.kind !== "npc") || typeof parsed.refId !== "string" || typeof parsed.tokenId !== "string") {
        return null
    }

    return {
        version: typeof parsed.version === "number" ? parsed.version : OWLBEAR_TOKEN_METADATA_VERSION,
        kind: parsed.kind,
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
    if (typeof parsed.tokenId !== "string" || (parsed.role !== "backdrop" && parsed.role !== "bar" && parsed.role !== "label")) {
        return null
    }

    return {
        version: typeof parsed.version === "number" ? parsed.version : OWLBEAR_OVERLAY_METADATA_VERSION,
        tokenId: parsed.tokenId,
        role: parsed.role,
        barWidth: typeof parsed.barWidth === "number" ? parsed.barWidth : undefined,
        barColor: typeof parsed.barColor === "string" ? parsed.barColor : undefined,
    }
}

export function getTokenLinkFromItem(item: OwlbearSceneItem | null | undefined) {
    return parseTokenLinkMetadata(item?.metadata)
}

export function getOverlayLinkFromItem(item: OwlbearSceneItem | null | undefined) {
    return parseOverlayMetadata(item?.metadata)
}

async function deleteCurrentNpcTokenHighlight() {
    if (!currentNpcTokenHighlightId) return

    const highlightId = currentNpcTokenHighlightId
    currentNpcTokenHighlightId = null

    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return

    await sdk.scene.local.deleteItems([highlightId])
}

export async function clearOwlbearNpcTokenHighlight() {
    npcTokenHighlightRequestId += 1
    await deleteCurrentNpcTokenHighlight()
}

export async function highlightOwlbearNpcToken(npcId: string) {
    const requestId = npcTokenHighlightRequestId + 1
    npcTokenHighlightRequestId = requestId
    await deleteCurrentNpcTokenHighlight()

    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return

    const sdkModule = await loadOwlbearSdkModule()
    if (!sdkModule) return

    const items = await sdk.scene.items.getItems()
    const token = items.find((item) => {
        const link = getTokenLinkFromItem(item)
        return link?.kind === "npc" && link.refId === npcId
    })
    if (!token) return

    const bounds = await sdk.scene.items.getItemBounds([token.id])
    if (npcTokenHighlightRequestId !== requestId) return

    const size = Math.max(bounds.width, bounds.height) + NPC_TOKEN_HIGHLIGHT_PADDING
    const highlight = sdkModule.buildShape()
        .name(`Dndicas Highlight - ${token.name}`)
        .attachedTo(token.id)
        .layer("CHARACTER")
        .zIndex(token.zIndex + 1)
        .disableHit(true)
        .position(bounds.center)
        .width(size)
        .height(size)
        .shapeType("CIRCLE")
        .fillColor(NPC_TOKEN_HIGHLIGHT_COLOR)
        .fillOpacity(0.08)
        .strokeColor(NPC_TOKEN_HIGHLIGHT_COLOR)
        .strokeOpacity(0.95)
        .strokeWidth(8)
        .strokeDash([12, 8])
        .metadata({
            "com.dndicas.owlbear/local-highlight": {
                version: 1,
                kind: "npc",
                refId: npcId,
                tokenId: token.id,
            },
        })
        .build() as OwlbearSceneItem

    await sdk.scene.local.addItems([highlight])
    if (npcTokenHighlightRequestId !== requestId) {
        await sdk.scene.local.deleteItems([highlight.id])
        return
    }
    currentNpcTokenHighlightId = highlight.id
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
        throw createOwlbearHttpError(response, error, `HTTP ${response.status}`)
    }

    return response.json()
}

/**
 * Busca um NPC específico da sala pelo seu id.
 * Internamente lista todos os NPCs da sala e filtra pelo id,
 * pois a API atual não tem rota de detalhe individual.
 */
export async function fetchOwlbearRoomNpcById(
    roomId: string,
    npcId: string,
    sessionToken: string,
): Promise<{ hpCurrent: number; hpMax: number; name: string } | null> {
    const response = await fetch(`/api/owlbear/rooms/${encodeURIComponent(roomId)}/npcs`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
    })
    if (!response.ok) return null
    const data = await response.json()
    const items: Array<{ id: string; hpCurrent: number; hpMax: number; source: { name: string } | null }> = data.items ?? []
    const found = items.find((item) => item.id === npcId)
    if (!found) return null
    return {
        hpCurrent: found.hpCurrent,
        hpMax: found.hpMax,
        name: found.source?.name ?? "NPC",
    }
}

/**
 * Vincula um token de cena a um NPC da sala (kind="npc").
 * O fluxo futuro de sincronização de HP fará o mesmo que o de personagem,
 * mas usando os dados de hpCurrent/hpMax do OwlbearRoomNpc em vez da CharacterSheet.
 */
export async function setTokenNpcLink(tokenId: string, roomNpcId: string, overlayIds: string[] = []) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) {
        throw new Error("Owlbear SDK indisponível para vincular token a NPC")
    }

    await sdk.scene.items.updateItems([tokenId], (draft) => {
        const item = draft[0]
        if (!item) return
        item.metadata = {
            ...item.metadata,
            [OWLBEAR_TOKEN_METADATA_KEY]: {
                version: OWLBEAR_TOKEN_METADATA_VERSION,
                kind: "npc",
                refId: roomNpcId,
                tokenId,
                overlayIds,
                linkedAt: new Date().toISOString(),
            } satisfies OwlbearTokenLinkMetadata,
        }
    })
}
