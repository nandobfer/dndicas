"use client"

import * as React from "react"
import { Loader2, Link2, Unlink2 } from "lucide-react"
import {
    GlassModal,
    GlassModalContent,
    GlassModalDescription,
    GlassModalHeader,
    GlassModalTitle,
} from "@/components/ui/glass-modal"
import type { CharacterSheetFull } from "@/features/character-sheets/types/character-sheet.types"
import {
    clearTokenSheetLink,
    fetchOwlbearSheetById,
    getOverlayLinkFromItem,
    getTokenLinkFromItem,
    loadOwlbearSdk,
    loadOwlbearSdkModule,
    setTokenSheetLink,
    updateTokenOverlayIds,
} from "./sdk"
import type { OwlbearRuntimeState, OwlbearSceneItem, OwlbearSessionState } from "./types"
import { useRoomLinkedSheets } from "./use-room-linked-sheets"

const LINK_CONTEXT_MENU_ID = "com.dndicas.owlbear.link-sheet"
const UNLINK_CONTEXT_MENU_ID = "com.dndicas.owlbear.unlink-sheet"

function isTokenEligible(item: OwlbearSceneItem | null | undefined) {
    if (!item) return false
    if (getOverlayLinkFromItem(item)) return false
    return ["CHARACTER", "MOUNT", "PROP"].includes(item.layer)
}

function getOverlayPosition(token: OwlbearSceneItem) {
    const scaleMagnitude = Math.max(Math.abs(token.scale.x || 1), Math.abs(token.scale.y || 1), 1)
    return {
        x: token.position.x,
        y: token.position.y - 60 - (scaleMagnitude - 1) * 18,
    }
}

function getOverlayLabel(sheet: CharacterSheetFull) {
    const current = sheet.hpCurrent ?? 0
    const max = sheet.hpMax ?? 0
    const temp = sheet.hpTemp ?? 0
    return temp > 0 ? `HP ${current}/${max}  |  THP +${temp}` : `HP ${current}/${max}`
}

async function buildOverlayItems(token: OwlbearSceneItem, sheet: CharacterSheetFull) {
    const sdkModule = await loadOwlbearSdkModule()
    if (!sdkModule) {
        throw new Error("Owlbear SDK indisponível para criar overlay")
    }

    const position = getOverlayPosition(token)
    const overlayMetadataBase = {
        tokenId: token.id,
        version: 1,
    }

    const backdrop = sdkModule.buildShape()
        .name(`Dndicas HP Backdrop - ${sheet.name}`)
        .attachedTo(token.id)
        .layer("TEXT")
        .disableHit(true)
        .position(position)
        .width(152)
        .height(30)
        .shapeType("RECTANGLE")
        .fillColor("#040712")
        .fillOpacity(0.82)
        .strokeColor("#60a5fa")
        .strokeOpacity(0.4)
        .strokeWidth(2)
        .metadata({
            "com.dndicas.owlbear/overlay": {
                ...overlayMetadataBase,
                role: "backdrop",
            },
        })
        .build()

    const label = sdkModule.buildText()
        .name(`Dndicas HP Label - ${sheet.name}`)
        .attachedTo(token.id)
        .layer("TEXT")
        .disableHit(true)
        .position(position)
        .plainText(getOverlayLabel(sheet))
        .fontSize(16)
        .fontWeight(700)
        .padding(6)
        .textAlign("CENTER")
        .textAlignVertical("MIDDLE")
        .fillColor("#f8fafc")
        .fillOpacity(1)
        .strokeColor("#020617")
        .strokeOpacity(0.75)
        .strokeWidth(3)
        .width(152)
        .height(30)
        .metadata({
            "com.dndicas.owlbear/overlay": {
                ...overlayMetadataBase,
                role: "label",
            },
        })
        .build()

    return [backdrop, label]
}

async function syncTokenOverlay(token: OwlbearSceneItem, sheet: CharacterSheetFull) {
    const sdk = await loadOwlbearSdk()
    if (!sdk || !sdk.isAvailable || !sdk.isReady) return

    const tokenLink = getTokenLinkFromItem(token)
    if (!tokenLink) return

    const currentItems = await sdk.scene.items.getItems()
    const itemsById = new Map(currentItems.map((item) => [item.id, item]))
    const linkedOverlayItems = tokenLink.overlayIds
        .map((overlayId) => itemsById.get(overlayId))
        .filter((item): item is OwlbearSceneItem => Boolean(item))

    if (linkedOverlayItems.length < 2) {
        if (linkedOverlayItems.length > 0) {
            await sdk.scene.items.deleteItems(linkedOverlayItems.map((item) => item.id))
        }
        const createdOverlays = await buildOverlayItems(token, sheet)
        await sdk.scene.items.addItems(createdOverlays)
        await updateTokenOverlayIds(token.id, createdOverlays.map((item) => item.id))
        return
    }

    const position = getOverlayPosition(token)
    await sdk.scene.items.updateItems(linkedOverlayItems, (draft) => {
        for (const item of draft) {
            item.attachedTo = token.id
            item.position = position
            if (item.type === "TEXT") {
                ;(item as OwlbearSceneItem & { text?: { plainText?: string } }).text = {
                    ...(item as OwlbearSceneItem & { text?: Record<string, unknown> }).text as Record<string, unknown>,
                    plainText: getOverlayLabel(sheet),
                }
            }
        }
    })
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

function TokenLinkDialog({
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
                    <GlassModalTitle>Vincular ficha ao token</GlassModalTitle>
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
                                        Nível {sheet.level} · {sheet.class || "Sem classe"} {sheet.race ? `· ${sheet.race}` : ""}
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

export function OwlbearGmSceneController({
    runtime,
    session,
    isAuthenticated,
}: {
    runtime: OwlbearRuntimeState
    session: OwlbearSessionState
    isAuthenticated: boolean
}) {
    const { sheets } = useRoomLinkedSheets(session.sessionToken, runtime.role === "GM" && isAuthenticated && session.sessionStatus === "ready")
    const [selectedToken, setSelectedToken] = React.useState<OwlbearSceneItem | null>(null)
    const [linkingSheetId, setLinkingSheetId] = React.useState<string | null>(null)

    const syncScene = React.useCallback(async () => {
        if (runtime.role !== "GM" || session.sessionStatus !== "ready" || !session.sessionToken) return

        try {
            const sdk = await loadOwlbearSdk()
            if (!sdk || !sdk.isAvailable || !sdk.isReady) return

            const items = await sdk.scene.items.getItems()
            await cleanupOrphanOverlays(items)

            const linkedTokens = items.filter((item) => isTokenEligible(item) && getTokenLinkFromItem(item))
            const uniqueSheetIds = Array.from(new Set(linkedTokens.map((item) => getTokenLinkFromItem(item)?.refId).filter((id): id is string => Boolean(id))))
            const sheetMap = new Map<string, CharacterSheetFull>()

            await Promise.all(uniqueSheetIds.map(async (sheetId) => {
                try {
                    const sheet = await fetchOwlbearSheetById(sheetId, session.sessionToken!)
                    sheetMap.set(sheetId, sheet)
                } catch (error) {
                    console.error("Failed to fetch Owlbear sheet for overlay sync", error)
                }
            }))

            for (const token of linkedTokens) {
                const tokenLink = getTokenLinkFromItem(token)
                if (!tokenLink) continue

                const sheet = sheetMap.get(tokenLink.refId)
                if (!sheet) continue
                await syncTokenOverlay(token, sheet)
            }
        } catch (error) {
            console.error("Failed to sync Owlbear token overlays", error)
        }
    }, [runtime.role, session.sessionStatus, session.sessionToken])

    React.useEffect(() => {
        if (runtime.role !== "GM" || !isAuthenticated || session.sessionStatus !== "ready") return

        let active = true
        let unsubscribeItems: (() => void) | undefined

        void (async () => {
            const sdk = await loadOwlbearSdk()
            if (!sdk || !sdk.isAvailable || !sdk.isReady || !active) return

            unsubscribeItems = sdk.scene.items.onChange(() => {
                void syncScene()
            }) || (() => undefined)
        })()

        const intervalId = window.setInterval(() => {
            void syncScene()
        }, 2000)

        void syncScene()

        return () => {
            active = false
            window.clearInterval(intervalId)
            unsubscribeItems?.()
        }
    }, [isAuthenticated, runtime.role, session.sessionStatus, syncScene])

    React.useEffect(() => {
        if (runtime.role !== "GM" || !isAuthenticated || session.sessionStatus !== "ready") return

        let active = true

        void (async () => {
            const sdk = await loadOwlbearSdk()
            if (!sdk || !sdk.isAvailable || !sdk.isReady || !active) return

            await sdk.contextMenu.create({
                id: LINK_CONTEXT_MENU_ID,
                icons: [{
                    icon: "/icon-96.png",
                    label: "Vincular ficha",
                    filter: {
                        min: 1,
                        max: 1,
                        roles: ["GM"],
                    },
                }],
                onClick: (context) => {
                    const token = context.items.find((item) => isTokenEligible(item))
                    if (!token) return
                    setSelectedToken(token)
                },
            })

            await sdk.contextMenu.create({
                id: UNLINK_CONTEXT_MENU_ID,
                icons: [{
                    icon: "/icon-96.png",
                    label: "Desvincular ficha",
                    filter: {
                        min: 1,
                        max: 1,
                        roles: ["GM"],
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
        })().catch((error) => {
            console.error("Failed to register Owlbear context menus", error)
        })

        return () => {
            active = false
            void (async () => {
                const sdk = await loadOwlbearSdk()
                if (!sdk || !sdk.isAvailable || !sdk.isReady) return
                await Promise.allSettled([
                    sdk.contextMenu.remove(LINK_CONTEXT_MENU_ID),
                    sdk.contextMenu.remove(UNLINK_CONTEXT_MENU_ID),
                ])
            })()
        }
    }, [isAuthenticated, runtime.role, session.sessionStatus])

    const handleLinkSheet = React.useCallback(async (sheet: CharacterSheetFull) => {
        if (!selectedToken) return

        setLinkingSheetId(sheet._id)
        try {
            const sdk = await loadOwlbearSdk()
            if (!sdk || !sdk.isAvailable || !sdk.isReady) return

            const currentLink = getTokenLinkFromItem(selectedToken)
            if (currentLink?.overlayIds.length) {
                await sdk.scene.items.deleteItems(currentLink.overlayIds)
            }

            await setTokenSheetLink(selectedToken.id, sheet._id, [])
            await syncScene()
            setSelectedToken(null)
        } catch (error) {
            console.error("Failed to link token to sheet", error)
        } finally {
            setLinkingSheetId(null)
        }
    }, [selectedToken, syncScene])

    if (runtime.role !== "GM") return null

    return (
        <TokenLinkDialog
            isOpen={selectedToken !== null}
            sheets={sheets}
            tokenName={selectedToken?.name ?? null}
            linkingSheetId={linkingSheetId}
            onClose={() => {
                if (linkingSheetId) return
                setSelectedToken(null)
            }}
            onLink={(sheet) => void handleLinkSheet(sheet)}
        />
    )
}
