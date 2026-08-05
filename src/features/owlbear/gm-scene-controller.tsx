"use client"

import * as React from "react"
import { Link2, Loader2, Skull } from "lucide-react"
import { GlassModal, GlassModalContent, GlassModalDescription, GlassModalHeader, GlassModalTitle } from "@/components/ui/glass-modal"
import type { CharacterSheetFull } from "@/features/character-sheets/types/character-sheet.types"
import { MentionContent } from "@/features/rules/components/mention-badge"
import { OWLBEAR_PENDING_TOKEN_LINK_METADATA_KEY, OWLBEAR_TOKEN_METADATA_KEY } from "./config"
import { getHpBarColor, hpPercent } from "./hp-bar-utils"
import { subscribeOwlbearOverlaySync, type OwlbearOverlaySyncEvent } from "./overlay-sync-events"
import type { OwlbearRoomNpc } from "./room-npcs-api"
import {
    clearTokenSheetLink,
    fetchOwlbearRoomNpcById,
    fetchOwlbearSheetById,
    getOverlayLinkFromItem,
    getTokenLinkFromItem,
    loadOwlbearSdk,
    loadOwlbearSdkModule,
    setTokenNpcLink,
    setTokenSheetLink,
    updateTokenOverlayIds,
} from "./sdk"
import type { OwlbearPendingTokenLinkMetadata, OwlbearRuntimeState, OwlbearSceneItem, OwlbearSessionState } from "./types"
import { useRoomLinkedSheets } from "./use-room-linked-sheets"
import { useRoomNpcs } from "./use-room-npcs"

const LINK_PLAYER_CONTEXT_MENU_ID = "com.dndicas.owlbear.link-player"
const LINK_NPC_CONTEXT_MENU_ID = "com.dndicas.owlbear.link-npc"
const UNLINK_CONTEXT_MENU_ID = "com.dndicas.owlbear.unlink-sheet"
const CONTEXT_MENU_ICON = "/owlbear/icons/context-menu.svg"

const OVERLAY_BAR_HEIGHT = 14
const OVERLAY_TEMP_BAR_HEIGHT = OVERLAY_BAR_HEIGHT / 2
const OVERLAY_TOKEN_OFFSET = 4
const OVERLAY_TEMP_BAR_COLOR = "#eaf8ff"
const SYNC_DEBOUNCE_MS = 400
const SYNC_FALLBACK_INTERVAL_MS = 15000

type OverlayHpSnapshot = {
    hpCurrent: number
    hpMax: number
    hpTemp: number
    name: string
}

type OverlayLayout = {
    position: { x: number; y: number }
    width: number
}

type OverlayLinkMetadata = {
    version: number
    tokenId: string
    role: "backdrop" | "bar" | "tempBar" | "label"
    barWidth?: number
    overlayWidth?: number
    barColor?: string
}

type LinkKind = "player" | "npc"
type ControllerScope = LinkKind | "both" | "none"

function getOverlaySyncCacheKey(kind: "player" | "npc", refId: string) {
    return `${kind}:${refId}`
}

function isTokenEligible(item: OwlbearSceneItem | null | undefined) {
    if (!item) return false
    if (getOverlayLinkFromItem(item)) return false
    return ["CHARACTER", "MOUNT", "PROP"].includes(item.layer)
}

function scopeIncludes(scope: ControllerScope, kind: LinkKind) {
    return scope === "both" || scope === kind
}

function getContextMenuIdsForScope(scope: ControllerScope) {
    const ids: string[] = []
    if (scopeIncludes(scope, "player")) {
        ids.push(LINK_PLAYER_CONTEXT_MENU_ID, UNLINK_CONTEXT_MENU_ID)
    }
    if (scopeIncludes(scope, "npc")) {
        ids.push(LINK_NPC_CONTEXT_MENU_ID)
    }
    return ids
}

function parsePendingTokenLinkMetadata(value: unknown): OwlbearPendingTokenLinkMetadata | null {
    if (!value || typeof value !== "object") return null
    const metadata = value as Partial<OwlbearPendingTokenLinkMetadata>
    if (metadata.version !== 1) return null
    if (metadata.kind !== "player" && metadata.kind !== "npc") return null
    if (typeof metadata.tokenId !== "string" || metadata.tokenId.trim().length === 0) return null

    return {
        version: 1,
        kind: metadata.kind,
        tokenId: metadata.tokenId,
        tokenName: typeof metadata.tokenName === "string" ? metadata.tokenName : undefined,
        createdAt: typeof metadata.createdAt === "string" ? metadata.createdAt : new Date().toISOString(),
    }
}

async function savePendingTokenLink(kind: LinkKind, token: OwlbearSceneItem) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return
    if (typeof sdk.player.setMetadata !== "function") return
    await sdk.player.setMetadata({
        [OWLBEAR_PENDING_TOKEN_LINK_METADATA_KEY]: {
            version: 1,
            kind,
            tokenId: token.id,
            tokenName: token.name,
            createdAt: new Date().toISOString(),
        } satisfies OwlbearPendingTokenLinkMetadata,
    })
}

async function clearPendingTokenLink() {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return
    if (typeof sdk.player.setMetadata !== "function") return
    await sdk.player.setMetadata({ [OWLBEAR_PENDING_TOKEN_LINK_METADATA_KEY]: undefined })
}

async function resolvePendingTokenLink(kind: LinkKind) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return null
    if (typeof sdk.player.getMetadata !== "function") return null

    const playerMetadata = await sdk.player.getMetadata()
    const pending = parsePendingTokenLinkMetadata(playerMetadata[OWLBEAR_PENDING_TOKEN_LINK_METADATA_KEY])
    if (!pending || pending.kind !== kind) return null

    const items = await sdk.scene.items.getItems()
    const token = items.find((item) => item.id === pending.tokenId && isTokenEligible(item)) ?? null
    if (!token) return null

    return { kind, token } satisfies PendingLink
}

export function canManageGmScene(runtime: OwlbearRuntimeState, session: OwlbearSessionState) {
    return runtime.role === "GM" && session.sessionStatus === "ready" && Boolean(session.sessionToken)
}

async function getOverlayLayout(sdk: Awaited<ReturnType<typeof loadOwlbearSdk>>, token: OwlbearSceneItem): Promise<OverlayLayout> {
    if (!sdk || !sdk.isAvailable || !sdk.isReady) {
        return { position: token.position, width: 1 }
    }

    const bounds = await sdk.scene.items.getItemBounds([token.id])
    const width = Math.max(1, Math.round(bounds.width))
    const topY = bounds.center.y - bounds.height / 2
    return {
        position: {
            x: bounds.center.x - width / 2,
            y: Math.round(topY - OVERLAY_BAR_HEIGHT - OVERLAY_TOKEN_OFFSET),
        },
        width,
    }
}

function getTempBarPosition(position: { x: number; y: number }) {
    return { x: position.x, y: position.y + OVERLAY_TEMP_BAR_HEIGHT }
}

function samePosition(a: { x: number; y: number } | undefined, b: { x: number; y: number }) {
    if (!a) return false
    return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y)
}

function getShapeFillColor(item: OwlbearSceneItem) {
    const candidate = item as OwlbearSceneItem & {
        style?: { fillColor?: string }
        fillColor?: string
    }
    return candidate.style?.fillColor ?? candidate.fillColor
}

function getShapeFillOpacity(item: OwlbearSceneItem) {
    const candidate = item as OwlbearSceneItem & {
        style?: { fillOpacity?: number }
        fillOpacity?: number
    }
    return candidate.style?.fillOpacity ?? candidate.fillOpacity
}

function getOverlayMetadata(item: OwlbearSceneItem) {
    return getOverlayLinkFromItem(item) as OverlayLinkMetadata | null
}

function isHtmlContent(value: string) {
    return value.includes("<")
}

function RichFieldValue({ value }: { value: string }) {
    if (isHtmlContent(value)) {
        return <MentionContent html={value} mode="inline" />
    }
    return <span>{value}</span>
}

/** Cria os itens de overlay de barra de HP: fundo, HP atual e HP temporário. */
async function buildOverlayItems(
    token: OwlbearSceneItem,
    layout: OverlayLayout,
    hpCurrent: number,
    hpMax: number,
    hpTemp: number,
    name: string,
) {
    const sdkModule = await loadOwlbearSdkModule()
    if (!sdkModule) {
        throw new Error("Owlbear SDK indisponível para criar overlay")
    }

    const position = layout.position
    const overlayWidth = layout.width
    const overlayMetadataBase = { tokenId: token.id, version: 1 }
    const percent = hpPercent(hpCurrent, hpMax)
    const barWidth = Math.max(1, Math.round((percent / 100) * overlayWidth))
    const tempBarWidth = Math.max(1, Math.round((hpPercent(hpTemp, hpMax) / 100) * overlayWidth))
    const barColor = getHpBarColor(hpCurrent, hpMax)

    const backdrop = sdkModule.buildShape()
        .name(`Dndicas HP Backdrop - ${name}`)
        .attachedTo(token.id)
        .layer("TEXT")
        .disableHit(true)
        .position(position)
        .width(overlayWidth)
        .height(OVERLAY_BAR_HEIGHT)
        .shapeType("RECTANGLE")
        .fillColor("#040712")
        .fillOpacity(0.85)
        .strokeColor("#1e293b")
        .strokeOpacity(0.6)
        .strokeWidth(1)
        .metadata({
            "com.dndicas.owlbear/overlay": {
                ...overlayMetadataBase,
                role: "backdrop",
                overlayWidth,
            },
        })
        .build()

    const bar = sdkModule.buildShape()
        .name(`Dndicas HP Bar - ${name}`)
        .attachedTo(token.id)
        .layer("TEXT")
        .disableHit(true)
        .position(position)
        .width(barWidth)
        .height(OVERLAY_BAR_HEIGHT)
        .shapeType("RECTANGLE")
        .fillColor(barColor)
        .fillOpacity(1)
        .strokeWidth(0)
        .strokeOpacity(0)
        .metadata({
            "com.dndicas.owlbear/overlay": {
                ...overlayMetadataBase,
                role: "bar",
                barWidth,
                overlayWidth,
                barColor,
            },
        })
        .build()

    const tempBar = sdkModule.buildShape()
        .name(`Dndicas HP Temp - ${name}`)
        .attachedTo(token.id)
        .layer("TEXT")
        .disableHit(true)
        .position(getTempBarPosition(position))
        .width(tempBarWidth)
        .height(OVERLAY_TEMP_BAR_HEIGHT)
        .shapeType("RECTANGLE")
        .fillColor(OVERLAY_TEMP_BAR_COLOR)
        .fillOpacity(hpTemp > 0 ? 1 : 0)
        .strokeWidth(0)
        .strokeOpacity(0)
        .metadata({
            "com.dndicas.owlbear/overlay": {
                ...overlayMetadataBase,
                role: "tempBar",
                barWidth: tempBarWidth,
                overlayWidth,
                barColor: OVERLAY_TEMP_BAR_COLOR,
            },
        })
        .build()

    return [backdrop, bar, tempBar]
}

async function recreateTokenOverlay(
    sdk: Awaited<ReturnType<typeof loadOwlbearSdk>>,
    token: OwlbearSceneItem,
    overlayItems: OwlbearSceneItem[],
    layout: OverlayLayout,
    hpCurrent: number,
    hpMax: number,
    hpTemp: number,
    name: string,
) {
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return
    if (overlayItems.length > 0) {
        await sdk.scene.items.deleteItems(overlayItems.map((item) => item.id))
    }
    const createdOverlays = await buildOverlayItems(token, layout, hpCurrent, hpMax, hpTemp, name)
    await sdk.scene.items.addItems(createdOverlays)
    await updateTokenOverlayIds(token.id, createdOverlays.map((item) => item.id))
}

async function syncTokenOverlay(
    sdk: Awaited<ReturnType<typeof loadOwlbearSdk>>,
    itemsById: Map<string, OwlbearSceneItem>,
    token: OwlbearSceneItem,
    hpCurrent: number,
    hpMax: number,
    hpTemp: number,
    name: string,
) {
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return

    const tokenLink = getTokenLinkFromItem(token)
    if (!tokenLink) return

    const linkedOverlayItems = tokenLink.overlayIds
        .map((overlayId) => itemsById.get(overlayId))
        .filter((item): item is OwlbearSceneItem => Boolean(item))
    const overlayRoles = new Set<string>(linkedOverlayItems.flatMap((item) => {
        const role = getOverlayMetadata(item)?.role
        return role ? [role] : []
    }))
    const hasRequiredOverlayShape = overlayRoles.has("backdrop") && overlayRoles.has("bar") && overlayRoles.has("tempBar") && linkedOverlayItems.length === 3
    const layout = await getOverlayLayout(sdk, token)

    if (!hasRequiredOverlayShape) {
        await recreateTokenOverlay(sdk, token, linkedOverlayItems, layout, hpCurrent, hpMax, hpTemp, name)
        return
    }

    const position = layout.position
    const tempPosition = getTempBarPosition(position)
    const percent = hpPercent(hpCurrent, hpMax)
    const overlayWidth = layout.width
    const barWidth = Math.max(1, Math.round((percent / 100) * overlayWidth))
    const tempBarWidth = Math.max(1, Math.round((hpPercent(hpTemp, hpMax) / 100) * overlayWidth))
    const barColor = getHpBarColor(hpCurrent, hpMax)
    const needsUpdate = linkedOverlayItems.some((item) => {
        const overlayMeta = getOverlayMetadata(item)
        if (!overlayMeta) return false
        const expectedPosition = overlayMeta.role === "tempBar" ? tempPosition : position
        if (item.attachedTo !== token.id || !samePosition(item.position, expectedPosition)) return true
        if (overlayMeta.overlayWidth !== overlayWidth) return true
        if (overlayMeta.role === "backdrop") {
            if ((item as OwlbearSceneItem & { width?: number }).width !== overlayWidth) return true
            return (item as OwlbearSceneItem & { height?: number }).height !== OVERLAY_BAR_HEIGHT
        }
        if (overlayMeta.role === "tempBar") {
            if (overlayMeta.barWidth !== tempBarWidth || overlayMeta.barColor !== OVERLAY_TEMP_BAR_COLOR) return true
            if ((item as OwlbearSceneItem & { width?: number }).width !== tempBarWidth) return true
            if ((item as OwlbearSceneItem & { height?: number }).height !== OVERLAY_TEMP_BAR_HEIGHT) return true
            return getShapeFillOpacity(item) !== (hpTemp > 0 ? 1 : 0)
        }
        if (overlayMeta.role !== "bar") return false
        if (overlayMeta.barWidth !== barWidth || overlayMeta.barColor !== barColor) return true
        if ((item as OwlbearSceneItem & { width?: number }).width !== barWidth) return true
        const currentFillColor = getShapeFillColor(item)
        return Boolean(currentFillColor) && currentFillColor !== barColor
    })

    if (!needsUpdate) return

    try {
        await sdk.scene.items.updateItems(linkedOverlayItems, (draft) => {
            for (const item of draft) {
                item.attachedTo = token.id

                const overlayMeta = (item.metadata["com.dndicas.owlbear/overlay"] as { role?: string } | undefined)
                item.position = overlayMeta?.role === "tempBar" ? tempPosition : position

                if (overlayMeta?.role === "backdrop") {
                    ;(item as OwlbearSceneItem & { width?: number }).width = overlayWidth
                    ;(item as OwlbearSceneItem & { height?: number }).height = OVERLAY_BAR_HEIGHT
                    item.metadata = {
                        ...item.metadata,
                        "com.dndicas.owlbear/overlay": {
                            ...overlayMeta,
                            tokenId: token.id,
                            version: 1,
                            role: "backdrop",
                            overlayWidth,
                        },
                    }
                }

                if (overlayMeta?.role === "bar") {
                    ;(item as OwlbearSceneItem & { width?: number }).width = barWidth
                    ;(item as OwlbearSceneItem & { style?: Record<string, unknown> }).style = {
                        ...(item as OwlbearSceneItem & { style?: Record<string, unknown> }).style,
                        fillColor: barColor,
                    }
                    item.metadata = {
                        ...item.metadata,
                        "com.dndicas.owlbear/overlay": {
                            ...overlayMeta,
                            tokenId: token.id,
                            version: 1,
                            role: "bar",
                            barWidth,
                            overlayWidth,
                            barColor,
                        },
                    }
                }

                if (overlayMeta?.role === "tempBar") {
                    ;(item as OwlbearSceneItem & { width?: number }).width = tempBarWidth
                    ;(item as OwlbearSceneItem & { height?: number }).height = OVERLAY_TEMP_BAR_HEIGHT
                    ;(item as OwlbearSceneItem & { style?: Record<string, unknown> }).style = {
                        ...(item as OwlbearSceneItem & { style?: Record<string, unknown> }).style,
                        fillColor: OVERLAY_TEMP_BAR_COLOR,
                        fillOpacity: hpTemp > 0 ? 1 : 0,
                    }
                    item.metadata = {
                        ...item.metadata,
                        "com.dndicas.owlbear/overlay": {
                            ...overlayMeta,
                            tokenId: token.id,
                            version: 1,
                            role: "tempBar",
                            barWidth: tempBarWidth,
                            overlayWidth,
                            barColor: OVERLAY_TEMP_BAR_COLOR,
                        },
                    }
                }
            }
        })
    } catch (error) {
        console.error("Failed to update Owlbear token overlay; recreating overlay items", { tokenId: token.id, error })
        await recreateTokenOverlay(sdk, token, linkedOverlayItems, layout, hpCurrent, hpMax, hpTemp, name)
    }
}

async function cleanupOrphanOverlays(items: OwlbearSceneItem[]) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return

    const tokenIds = new Set(items.map((item) => item.id))
    const linkedOverlayIds = new Set(
        items
            .map((item) => getTokenLinkFromItem(item)?.overlayIds ?? [])
            .flat()
    )

    const orphanOverlayIds = items
        .filter((item) => {
            const overlayLink = getOverlayLinkFromItem(item)
            if (!overlayLink) return false
            if (!tokenIds.has(overlayLink.tokenId)) return true
            return !linkedOverlayIds.has(item.id)
        })
        .map((item) => item.id)

    if (orphanOverlayIds.length > 0) {
        await sdk.scene.items.deleteItems(orphanOverlayIds)
    }
}

// ---------------------------------------------------------------------------
// Dialog: Vincular a personagem
// ---------------------------------------------------------------------------

function PlayerLinkDialog({
    isOpen,
    sheets,
    tokenName,
    linkingSheetId,
    onClose,
    onLink,
}: {
    isOpen: boolean
    sheets: CharacterSheetFull[]
    tokenName: string | null
    linkingSheetId: string | null
    onClose: () => void
    onLink: (sheet: CharacterSheetFull) => void
}) {
    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="lg">
                <GlassModalHeader>
                    <GlassModalTitle>Vincular a personagem</GlassModalTitle>
                    <GlassModalDescription>
                        {tokenName
                            ? `Selecione qual ficha de jogador vinculada à sala deve controlar o token "${tokenName}".`
                            : "Selecione uma ficha de jogador vinculada à sala para este token."}
                    </GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-6 space-y-3">
                    {sheets.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/70">
                            Nenhuma ficha de jogador está vinculada a esta sala no momento.
                        </div>
                    ) : (
                        sheets.map((sheet) => (
                            <button
                                key={sheet._id}
                                type="button"
                                onClick={() => onLink(sheet)}
                                disabled={linkingSheetId === sheet._id}
                                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <div>
                                    <div className="text-base font-semibold text-white">{sheet.name}</div>
                                    <div className="mt-1 text-xs text-white/60">
                                        <span>Nível {sheet.level}</span>
                                        <span> · </span>
                                        <RichFieldValue value={sheet.class || "Sem classe"} />
                                        {sheet.race ? (
                                            <>
                                                <span> · </span>
                                                <RichFieldValue value={sheet.race} />
                                            </>
                                        ) : null}
                                    </div>
                                    <div className="mt-2 text-xs text-white/50">
                                        {sheet.hpCurrent ?? 0}/{sheet.hpMax ?? 0} PV
                                    </div>
                                </div>
                                {linkingSheetId === sheet._id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-white/70" />
                                ) : (
                                    <Link2 className="h-4 w-4 text-white/50" />
                                )}
                            </button>
                        ))
                    )}
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}

// ---------------------------------------------------------------------------
// Dialog: Vincular a NPC
// ---------------------------------------------------------------------------

function NpcLinkDialog({
    isOpen,
    npcs,
    isLoadingNpcs,
    tokenName,
    linkingNpcId,
    onClose,
    onLink,
}: {
    isOpen: boolean
    npcs: OwlbearRoomNpc[]
    isLoadingNpcs: boolean
    tokenName: string | null
    linkingNpcId: string | null
    onClose: () => void
    onLink: (npc: OwlbearRoomNpc) => void
}) {
    return (
        <GlassModal open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <GlassModalContent size="lg">
                <GlassModalHeader>
                    <GlassModalTitle>Vincular a NPC</GlassModalTitle>
                    <GlassModalDescription>
                        {tokenName
                            ? `Selecione qual NPC da sala deve controlar o token "${tokenName}".`
                            : "Selecione um NPC da sala para este token."}
                    </GlassModalDescription>
                </GlassModalHeader>

                <div className="mt-6 space-y-3">
                    {isLoadingNpcs ? (
                        <div className="flex min-h-32 items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                        </div>
                    ) : npcs.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/70">
                            Nenhum NPC adicionado à sala. Adicione NPCs pela aba <strong>NPCs</strong> antes de vincular.
                        </div>
                    ) : (
                        npcs.map((npc) => (
                            <button
                                key={npc.id}
                                type="button"
                                onClick={() => onLink(npc)}
                                disabled={linkingNpcId === npc.id}
                                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                                        <Skull className="h-4 w-4 text-white/35" />
                                    </div>
                                    <div>
                                        <div className="text-base font-semibold text-white">
                                            {npc.source?.name ?? "NPC indisponível"}
                                        </div>
                                        <div className="mt-1 text-xs text-white/50">
                                            {npc.hpCurrent}/{npc.hpMax} PV
                                        </div>
                                    </div>
                                </div>
                                {linkingNpcId === npc.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-white/70" />
                                ) : (
                                    <Link2 className="h-4 w-4 text-white/50" />
                                )}
                            </button>
                        ))
                    )}
                </div>
            </GlassModalContent>
        </GlassModal>
    )
}

// ---------------------------------------------------------------------------
// Controller principal
// ---------------------------------------------------------------------------

type PendingLink = { kind: "player"; token: OwlbearSceneItem } | { kind: "npc"; token: OwlbearSceneItem }

export function OwlbearGmSceneController({
    runtime,
    session,
    contextMenuKind = "both",
    linkDialogKind = "both",
    overlayKinds = ["player", "npc"],
    canUseNpcBackend = true,
}: {
    runtime: OwlbearRuntimeState
    session: OwlbearSessionState
    contextMenuKind?: ControllerScope
    linkDialogKind?: ControllerScope
    overlayKinds?: LinkKind[]
    canUseNpcBackend?: boolean
}) {
    const canManageScene = canManageGmScene(runtime, session)
    const canRegisterContextMenus = runtime.status === "ready" && runtime.role === "GM" && runtime.sceneReady && contextMenuKind !== "none"
    const canOpenPlayerDialog = scopeIncludes(linkDialogKind, "player")
    const canOpenNpcDialog = scopeIncludes(linkDialogKind, "npc")
    const shouldSyncPlayerOverlays = overlayKinds.includes("player")
    const shouldSyncNpcOverlays = overlayKinds.includes("npc") && canUseNpcBackend
    const needsPlayerBackend = canOpenPlayerDialog || shouldSyncPlayerOverlays
    const needsNpcBackend = (canOpenNpcDialog || shouldSyncNpcOverlays) && canUseNpcBackend
    const { sheets } = useRoomLinkedSheets(session.sessionToken, canManageScene && needsPlayerBackend)
    const { items: npcs, isLoading: isLoadingNpcs, reload: reloadNpcs } = useRoomNpcs(
        runtime.roomId,
        session.sessionToken,
        canManageScene && needsNpcBackend,
    )

    const [pendingLink, setPendingLink] = React.useState<PendingLink | null>(null)
    const [linkingId, setLinkingId] = React.useState<string | null>(null)
    const overlayHpCacheRef = React.useRef(new Map<string, OverlayHpSnapshot>())

    const syncScene = React.useCallback(async () => {
        if (runtime.role !== "GM" || session.sessionStatus !== "ready" || !session.sessionToken || !runtime.roomId) return

        try {
            const sdk = await loadOwlbearSdk()
            if (!sdk || !sdk.isAvailable || !sdk.isReady) return

            const items = await sdk.scene.items.getItems()
            const itemsById = new Map(items.map((item) => [item.id, item]))
            await cleanupOrphanOverlays(items)

            const linkedTokens = items.filter((item) => isTokenEligible(item) && getTokenLinkFromItem(item))

            // Agrupa tokens por tipo de vínculo para carregar dados em paralelo
            const playerTokens = shouldSyncPlayerOverlays ? linkedTokens.filter((t) => getTokenLinkFromItem(t)?.kind === "player") : []
            const npcTokens = shouldSyncNpcOverlays ? linkedTokens.filter((t) => getTokenLinkFromItem(t)?.kind === "npc") : []

            // Carrega fichas de personagem
            const uniqueSheetIds = Array.from(new Set(
                playerTokens.map((item) => getTokenLinkFromItem(item)?.refId).filter((id): id is string => Boolean(id))
            ))
            const sheetMap = new Map<string, CharacterSheetFull>()
            await Promise.all(uniqueSheetIds
                .filter((sheetId) => !overlayHpCacheRef.current.has(getOverlaySyncCacheKey("player", sheetId)))
                .map(async (sheetId) => {
                try {
                    const sheet = await fetchOwlbearSheetById(sheetId, session.sessionToken!)
                    sheetMap.set(sheetId, sheet)
                } catch (error) {
                    console.error("Failed to fetch Owlbear sheet for overlay sync", error)
                }
            }))

            // Carrega NPCs da sala (uma única chamada para todos)
            const uniqueNpcIds = Array.from(new Set(
                npcTokens.map((item) => getTokenLinkFromItem(item)?.refId).filter((id): id is string => Boolean(id))
            ))
            const npcMap = new Map<string, { hpCurrent: number; hpMax: number; hpTemp: number; name: string }>()
            await Promise.all(uniqueNpcIds
                .filter((npcId) => !overlayHpCacheRef.current.has(getOverlaySyncCacheKey("npc", npcId)))
                .map(async (npcId) => {
                try {
                    const npc = await fetchOwlbearRoomNpcById(runtime.roomId!, npcId, session.sessionToken!)
                    if (npc) npcMap.set(npcId, npc)
                } catch (error) {
                    console.error("Failed to fetch Owlbear room NPC for overlay sync", error)
                }
            }))

            // Sincroniza overlays de personagem
            for (const token of playerTokens) {
                try {
                    const tokenLink = getTokenLinkFromItem(token)
                    if (!tokenLink) continue
                    const cached = overlayHpCacheRef.current.get(getOverlaySyncCacheKey("player", tokenLink.refId))
                    if (cached) {
                        await syncTokenOverlay(sdk, itemsById, token, cached.hpCurrent, cached.hpMax, cached.hpTemp, cached.name)
                        continue
                    }
                    const sheet = sheetMap.get(tokenLink.refId)
                    if (!sheet) continue
                    await syncTokenOverlay(sdk, itemsById, token, sheet.hpCurrent ?? 0, sheet.hpMax ?? 0, sheet.hpTemp ?? 0, sheet.name)
                } catch (error) {
                    console.error("Failed to sync Owlbear player token overlay", { tokenId: token.id, error })
                }
            }

            // Sincroniza overlays de NPC
            for (const token of npcTokens) {
                try {
                    const tokenLink = getTokenLinkFromItem(token)
                    if (!tokenLink) continue
                    const cached = overlayHpCacheRef.current.get(getOverlaySyncCacheKey("npc", tokenLink.refId))
                    if (cached) {
                        await syncTokenOverlay(sdk, itemsById, token, cached.hpCurrent, cached.hpMax, cached.hpTemp, cached.name)
                        continue
                    }
                    const npc = npcMap.get(tokenLink.refId)
                    if (!npc) continue
                    await syncTokenOverlay(sdk, itemsById, token, npc.hpCurrent, npc.hpMax, npc.hpTemp, npc.name)
                } catch (error) {
                    console.error("Failed to sync Owlbear NPC token overlay", { tokenId: token.id, error })
                }
            }
        } catch (error) {
            console.error("Failed to sync Owlbear token overlays", error)
        }
    }, [runtime.role, runtime.roomId, session.sessionStatus, session.sessionToken, shouldSyncNpcOverlays, shouldSyncPlayerOverlays])

    const syncSceneRef = React.useRef(syncScene)
    const syncTimerRef = React.useRef<number | null>(null)
    const isSyncingRef = React.useRef(false)
    const hasPendingSyncRef = React.useRef(false)
    const syncPromiseRef = React.useRef<Promise<void> | null>(null)

    React.useEffect(() => {
        syncSceneRef.current = syncScene
    }, [syncScene])

    const runQueuedSync = React.useCallback((): Promise<void> => {
        if (isSyncingRef.current) {
            hasPendingSyncRef.current = true
            return syncPromiseRef.current ?? Promise.resolve()
        }

        isSyncingRef.current = true
        const syncPromise = (async () => {
            try {
                do {
                    hasPendingSyncRef.current = false
                    if (syncTimerRef.current !== null) {
                        window.clearTimeout(syncTimerRef.current)
                        syncTimerRef.current = null
                    }
                    await syncSceneRef.current()
                } while (hasPendingSyncRef.current)
            } finally {
                isSyncingRef.current = false
                syncPromiseRef.current = null
            }
        })()
        syncPromiseRef.current = syncPromise
        return syncPromise
    }, [])

    const requestSyncScene = React.useCallback((delayMs = SYNC_DEBOUNCE_MS) => {
        if (syncTimerRef.current !== null) {
            window.clearTimeout(syncTimerRef.current)
        }
        syncTimerRef.current = window.setTimeout(() => {
            syncTimerRef.current = null
            void runQueuedSync()
        }, delayMs)
    }, [runQueuedSync])

    React.useEffect(() => subscribeOwlbearOverlaySync((event: OwlbearOverlaySyncEvent) => {
        const cacheKey = getOverlaySyncCacheKey(event.kind, event.refId)
        const previous = overlayHpCacheRef.current.get(cacheKey)
        overlayHpCacheRef.current.set(cacheKey, {
            hpCurrent: event.hpCurrent,
            hpMax: event.hpMax,
            hpTemp: event.hpTemp ?? previous?.hpTemp ?? 0,
            name: event.name ?? previous?.name ?? (event.kind === "npc" ? "NPC" : "Personagem"),
        })
        requestSyncScene(0)
    }), [requestSyncScene])

    React.useEffect(() => {
        if (pendingLink?.kind !== "npc") return
        void reloadNpcs()
    }, [pendingLink, reloadNpcs])

    // Registra o listener de cena e o polling de sincronização
    React.useEffect(() => {
        if (!canManageScene) return

        let active = true
        let unsubscribeItems: (() => void) | undefined

        void (async () => {
            const sdk = await loadOwlbearSdk()
            if (!sdk || !sdk.isAvailable || !sdk.isReady || !active) return

            unsubscribeItems = sdk.scene.items.onChange(() => {
                requestSyncScene()
            }) || (() => undefined)
        })()

        const intervalId = window.setInterval(() => {
            requestSyncScene(0)
        }, SYNC_FALLBACK_INTERVAL_MS)

        requestSyncScene(0)

        return () => {
            active = false
            window.clearInterval(intervalId)
            if (syncTimerRef.current !== null) {
                window.clearTimeout(syncTimerRef.current)
                syncTimerRef.current = null
            }
            unsubscribeItems?.()
        }
    }, [canManageScene, requestSyncScene])

    // Registra os itens de context menu
    React.useEffect(() => {
        if (!canRegisterContextMenus) {
            if (runtime.status === "ready" && runtime.role === "GM" && contextMenuKind !== "none" && !runtime.sceneReady) {
                console.info("[Dndicas Owlbear] Context menu aguardando scene pronta", {
                    contextMenuKind,
                    roomId: runtime.roomId,
                    sceneReady: runtime.sceneReady,
                })
            }
            return
        }

        let active = true

        void (async () => {
            const sdk = await loadOwlbearSdk()
            if (!sdk || !sdk.isAvailable || !sdk.isReady || !active) return

            console.info("[Dndicas Owlbear] Registrando context menus de vínculo", {
                contextMenuKind,
                role: runtime.role,
                roomId: runtime.roomId,
                sceneReady: runtime.sceneReady,
            })

            // Mantemos o filtro propositalmente mínimo. Filtros de `layer`/`permissions`
            // variam conforme o item real do Owlbear e, quando falham, escondem o menu
            // inteiro. A validação de layer/overlay acontece no onClick com isTokenEligible.
            if (scopeIncludes(contextMenuKind, "player")) {
                await sdk.contextMenu.create({
                    id: LINK_PLAYER_CONTEXT_MENU_ID,
                    icons: [{
                        icon: CONTEXT_MENU_ICON,
                        label: "Vincular a personagem",
                        filter: {
                            min: 1,
                            max: 1,
                            roles: ["GM"],
                        },
                    }],
                    onClick: (context) => {
                        const token = context.items.find((item) => isTokenEligible(item))
                        if (!token) return
                        if (canOpenPlayerDialog) {
                            setPendingLink({ kind: "player", token })
                        }
                        void (async () => {
                            await savePendingTokenLink("player", token)
                            await sdk.action.open()
                            await sdk.player.deselect([token.id])
                        })().catch((error) => {
                            console.error("Failed to open Owlbear action for player link", error)
                        })
                    },
                })
            }

            if (scopeIncludes(contextMenuKind, "npc")) {
                await sdk.contextMenu.create({
                    id: LINK_NPC_CONTEXT_MENU_ID,
                    icons: [{
                        icon: CONTEXT_MENU_ICON,
                        label: "Vincular a NPC",
                        filter: {
                            min: 1,
                            max: 1,
                            roles: ["GM"],
                        },
                    }],
                    onClick: (context) => {
                        const token = context.items.find((item) => isTokenEligible(item))
                        if (!token) return
                        if (canOpenNpcDialog) {
                            setPendingLink({ kind: "npc", token })
                        }
                        void (async () => {
                            await savePendingTokenLink("npc", token)
                            await sdk.action.open()
                            await sdk.player.deselect([token.id])
                        })().catch((error) => {
                            console.error("Failed to open Owlbear action for NPC link", error)
                        })
                    },
                })
            }

            // "Desvincular" — também usa filtro mínimo; o onClick ignora itens sem vínculo.
            if (scopeIncludes(contextMenuKind, "player")) {
                await sdk.contextMenu.create({
                    id: UNLINK_CONTEXT_MENU_ID,
                    icons: [{
                        icon: CONTEXT_MENU_ICON,
                        label: "Desvincular",
                        filter: {
                            min: 1,
                            max: 1,
                            roles: ["GM"],
                            every: [
                                { key: ["metadata", OWLBEAR_TOKEN_METADATA_KEY, "tokenId"], value: undefined, operator: "!=" },
                            ],
                        },
                    }],
                    onClick: (context) => {
                        const token = context.items.find((item) => isTokenEligible(item) && getTokenLinkFromItem(item))
                        if (!token) return

                        void (async () => {
                            const tokenLink = getTokenLinkFromItem(token)
                            const sdk = await loadOwlbearSdk()
                            if (!sdk || !tokenLink) return
                            if (tokenLink.overlayIds.length > 0) {
                                await sdk.scene.items.deleteItems(tokenLink.overlayIds)
                            }
                            await clearTokenSheetLink(token.id)
                        })()
                    },
                })
            }

            console.info("[Dndicas Owlbear] Context menus de vínculo registrados", {
                contextMenuKind,
                playerMenuId: LINK_PLAYER_CONTEXT_MENU_ID,
                npcMenuId: LINK_NPC_CONTEXT_MENU_ID,
                unlinkMenuId: UNLINK_CONTEXT_MENU_ID,
            })
        })().catch((error) => {
            console.error("Failed to register Owlbear context menus", error)
        })

        return () => {
            active = false
            void (async () => {
                const sdk = await loadOwlbearSdk()
                if (!sdk || !sdk.isAvailable || !sdk.isReady) return
                const menuIds = getContextMenuIdsForScope(contextMenuKind)
                console.info("[Dndicas Owlbear] Removendo context menus de vínculo", {
                    contextMenuKind,
                    menuIds,
                    roomId: runtime.roomId,
                    sceneReady: runtime.sceneReady,
                })
                await Promise.allSettled(menuIds.map((id) => sdk.contextMenu.remove(id)))
            })()
        }
    }, [canOpenNpcDialog, canOpenPlayerDialog, canRegisterContextMenus, contextMenuKind, runtime.role, runtime.roomId, runtime.sceneReady])

    React.useEffect(() => {
        if (runtime.status !== "ready" || runtime.role !== "GM" || linkDialogKind === "none") return

        let active = true

        const loadPendingLink = async () => {
            const kind = scopeIncludes(linkDialogKind, "player") ? "player" : "npc"
            const pending = await resolvePendingTokenLink(kind)
            if (!active || !pending) return
            setPendingLink((current) => current ?? pending)
        }

        void loadPendingLink().catch((error) => {
            console.error("Failed to load pending Owlbear token link", error)
        })

        const intervalId = window.setInterval(() => {
            void loadPendingLink().catch((error) => {
                console.error("Failed to refresh pending Owlbear token link", error)
            })
        }, 500)

        return () => {
            active = false
            window.clearInterval(intervalId)
        }
    }, [linkDialogKind, runtime.role, runtime.status])

    // Vincula um personagem ao token selecionado
    const handleLinkPlayer = React.useCallback(async (sheet: CharacterSheetFull) => {
        if (!pendingLink || pendingLink.kind !== "player") return

        const token = pendingLink.token
        setLinkingId(sheet._id)
        try {
            const sdk = await loadOwlbearSdk()
            if (!sdk || !sdk.isAvailable || !sdk.isReady) return

            const currentLink = getTokenLinkFromItem(token)
            if (currentLink?.overlayIds.length) {
                await sdk.scene.items.deleteItems(currentLink.overlayIds)
            }

            await setTokenSheetLink(token.id, sheet._id, [])
            overlayHpCacheRef.current.set(getOverlaySyncCacheKey("player", sheet._id), {
                hpCurrent: sheet.hpCurrent ?? 0,
                hpMax: sheet.hpMax ?? 0,
                hpTemp: sheet.hpTemp ?? 0,
                name: sheet.name,
            })
            await runQueuedSync()
            setPendingLink(null)
            await clearPendingTokenLink()
            await sdk.action.close()
        } catch (error) {
            console.error("Failed to link token to player sheet", error)
        } finally {
            setLinkingId(null)
        }
    }, [pendingLink, runQueuedSync])

    // Vincula um NPC ao token selecionado
    const handleLinkNpc = React.useCallback(async (npc: OwlbearRoomNpc) => {
        if (!pendingLink || pendingLink.kind !== "npc") return

        const token = pendingLink.token
        setLinkingId(npc.id)
        try {
            const sdk = await loadOwlbearSdk()
            if (!sdk || !sdk.isAvailable || !sdk.isReady) return

            const currentLink = getTokenLinkFromItem(token)
            if (currentLink?.overlayIds.length) {
                await sdk.scene.items.deleteItems(currentLink.overlayIds)
            }

            await setTokenNpcLink(token.id, npc.id, [])
            overlayHpCacheRef.current.set(getOverlaySyncCacheKey("npc", npc.id), {
                hpCurrent: npc.hpCurrent,
                hpMax: npc.hpMax,
                hpTemp: npc.hpTemp ?? 0,
                name: npc.source?.name ?? "NPC",
            })
            await runQueuedSync()
            setPendingLink(null)
            await clearPendingTokenLink()
            await sdk.action.close()
        } catch (error) {
            console.error("Failed to link token to NPC", error)
        } finally {
            setLinkingId(null)
        }
    }, [pendingLink, runQueuedSync])

    if (runtime.role !== "GM") return null

    return (
        <>
            <PlayerLinkDialog
                isOpen={pendingLink?.kind === "player"}
                sheets={sheets}
                tokenName={pendingLink?.token.name ?? null}
                linkingSheetId={linkingId}
                onClose={() => {
                    if (linkingId) return
                    setPendingLink(null)
                    void clearPendingTokenLink()
                }}
                onLink={(sheet) => void handleLinkPlayer(sheet)}
            />
            <NpcLinkDialog
                isOpen={pendingLink?.kind === "npc"}
                npcs={npcs}
                isLoadingNpcs={isLoadingNpcs}
                tokenName={pendingLink?.token.name ?? null}
                linkingNpcId={linkingId}
                onClose={() => {
                    if (linkingId) return
                    setPendingLink(null)
                    void clearPendingTokenLink()
                }}
                onLink={(npc) => void handleLinkNpc(npc)}
            />
        </>
    )
}
