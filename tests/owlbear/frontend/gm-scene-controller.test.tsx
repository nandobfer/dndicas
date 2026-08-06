import * as React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { canManageGmScene, OwlbearGmSceneController } from "@/features/owlbear/gm-scene-controller"

const OVERLAY_TEMP_BAR_COLOR = "#eaf8ff"
const LEGACY_TEMP_BAR_COLOR = "#7dd3fc"

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const useRoomLinkedSheetsMock = vi.hoisted(() => vi.fn())
const useRoomNpcsMock = vi.hoisted(() => vi.fn())

const pusherMock = vi.hoisted(() => {
    type Handler = (payload: unknown) => void
    type TestChannel = {
        name: string
        handlers: Map<string, Handler>
        bind: ReturnType<typeof vi.fn>
        unbind: ReturnType<typeof vi.fn>
    }

    const channels = new Map<string, TestChannel>()
    const getChannel = (channelName: string) => {
        const existing = channels.get(channelName)
        if (existing) return existing

        const channel: TestChannel = {
            name: channelName,
            handlers: new Map(),
            bind: vi.fn((eventName: string, handler: Handler) => {
                channel.handlers.set(eventName, handler)
            }),
            unbind: vi.fn((eventName: string) => {
                channel.handlers.delete(eventName)
            }),
        }
        channels.set(channelName, channel)
        return channel
    }

    return {
        channels,
        getChannel,
        subscribe: vi.fn((_config: unknown, channelName: string) => getChannel(channelName)),
        unsubscribe: vi.fn((channelName: string) => {
            channels.delete(channelName)
        }),
    }
})

const sdkMock = vi.hoisted(() => {
    const callbacks: Array<() => void> = []
    return {
        callbacks,
        onReady: vi.fn((callback: () => void) => {
            callbacks.push(callback)
            return () => undefined
        }),
        action: {
            open: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
        },
        player: {
            getId: vi.fn().mockResolvedValue("player-1"),
            getName: vi.fn().mockResolvedValue("Mestre"),
            getRole: vi.fn<() => Promise<"GM" | "PLAYER">>(),
            deselect: vi.fn().mockResolvedValue(undefined),
        },
        party: {
            getPlayers: vi.fn().mockResolvedValue([]),
            onChange: vi.fn(() => () => undefined),
        },
        room: {
            id: "room-1",
            getMetadata: vi.fn().mockResolvedValue({}),
            setMetadata: vi.fn().mockResolvedValue(undefined),
            onMetadataChange: vi.fn(() => () => undefined),
        },
        contextMenu: {
            create: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined),
        },
        scene: {
            isReady: vi.fn().mockResolvedValue(true),
            onReadyChange: vi.fn(() => () => undefined),
            items: {
                getItems: vi.fn().mockResolvedValue([]),
                getItemBounds: vi.fn().mockResolvedValue({ width: 140, height: 140, center: { x: 100, y: 100 } }),
                updateItems: vi.fn().mockResolvedValue(undefined),
                addItems: vi.fn().mockResolvedValue(undefined),
                deleteItems: vi.fn().mockResolvedValue(undefined),
                onChange: vi.fn(() => () => undefined),
            },
        },
        theme: {
            getTheme: vi.fn().mockResolvedValue({ mode: "DARK" as const }),
            onChange: vi.fn(() => () => undefined),
        },
        isAvailable: true,
        isReady: true,
    }
})

const createShapeBuilder = vi.hoisted(() => {
    let counter = 0
    return () => {
        const shape: Record<string, unknown> = { id: `overlay-mock-${++counter}`, type: "SHAPE" }
        const builder = {
            name: vi.fn((value: string) => { shape.name = value; return builder }),
            attachedTo: vi.fn((value: string) => { shape.attachedTo = value; return builder }),
            layer: vi.fn((value: string) => { shape.layer = value; return builder }),
            disableHit: vi.fn((value: boolean) => { shape.disableHit = value; return builder }),
            position: vi.fn((value: { x: number; y: number }) => { shape.position = value; return builder }),
            width: vi.fn((value: number) => { shape.width = value; return builder }),
            height: vi.fn((value: number) => { shape.height = value; return builder }),
            shapeType: vi.fn((value: string) => { shape.shapeType = value; return builder }),
            fillColor: vi.fn((value: string) => { shape.fillColor = value; return builder }),
            fillOpacity: vi.fn((value: number) => { shape.fillOpacity = value; return builder }),
            strokeColor: vi.fn((value: string) => { shape.strokeColor = value; return builder }),
            strokeOpacity: vi.fn((value: number) => { shape.strokeOpacity = value; return builder }),
            strokeWidth: vi.fn((value: number) => { shape.strokeWidth = value; return builder }),
            metadata: vi.fn((value: Record<string, unknown>) => { shape.metadata = value; return builder }),
            build: vi.fn(() => ({ ...shape })),
        }
        return builder
    }
})

vi.mock("@owlbear-rodeo/sdk", () => ({
    default: sdkMock,
    buildShape: vi.fn(createShapeBuilder),
}))

vi.mock("@/core/realtime/pusher-browser-config", () => ({
    getPusherBrowserConfig: vi.fn(async () => ({
        key: "pusher-key",
        cluster: "mt1",
        wsHost: "localhost",
        wsPort: 6001,
        wssPort: 6001,
        forceTLS: false,
        enabledTransports: ["ws"],
    })),
}))

vi.mock("@/core/realtime/pusher-browser-service", () => ({
    PusherBrowserService: {
        getInstance: vi.fn(() => pusherMock),
    },
}))

vi.mock("@/features/owlbear/sdk", async () => {
    const actual = await vi.importActual<typeof import("@/features/owlbear/sdk")>("@/features/owlbear/sdk")
    return {
        ...actual,
        loadOwlbearSdk: vi.fn(async () => sdkMock),
        loadOwlbearSdkModule: vi.fn(async () => ({
            buildShape: vi.fn(createShapeBuilder),
        })),
        fetchOwlbearSheetById: vi.fn(async () => ({
            _id: "sheet-1",
            name: "Kael",
            hpCurrent: 38,
            hpMax: 45,
            hpTemp: 0,
        })),
        fetchOwlbearRoomNpcById: vi.fn(async () => ({
            name: "Goblin",
            hpCurrent: 7,
            hpMax: 7,
            hpTemp: 0,
        })),
        setTokenSheetLink: vi.fn(async (tokenId: string, sheetId: string, overlayIds: string[] = []) => {
            await sdkMock.scene.items.updateItems([tokenId], (draft: Array<{ metadata: Record<string, unknown> }>) => {
                const item = draft[0]
                if (!item) return
                item.metadata = {
                    ...item.metadata,
                    "com.dndicas.owlbear/token": {
                        version: 1,
                        kind: "player",
                        refId: sheetId,
                        tokenId,
                        overlayIds,
                        linkedAt: "2026-01-01T00:00:00.000Z",
                    },
                }
            })
        }),
        setTokenNpcLink: vi.fn(async (tokenId: string, npcId: string, overlayIds: string[] = []) => {
            await sdkMock.scene.items.updateItems([tokenId], (draft: Array<{ metadata: Record<string, unknown> }>) => {
                const item = draft[0]
                if (!item) return
                item.metadata = {
                    ...item.metadata,
                    "com.dndicas.owlbear/token": {
                        version: 1,
                        kind: "npc",
                        refId: npcId,
                        tokenId,
                        overlayIds,
                        linkedAt: "2026-01-01T00:00:00.000Z",
                    },
                }
            })
        }),
        updateTokenOverlayIds: vi.fn(async () => undefined),
        clearTokenSheetLink: vi.fn(async () => undefined),
    }
})

vi.mock("@/features/owlbear/use-room-linked-sheets", () => ({
    useRoomLinkedSheets: (...args: unknown[]) => useRoomLinkedSheetsMock(...args),
}))

vi.mock("@/features/owlbear/use-room-npcs", () => ({
    useRoomNpcs: (...args: unknown[]) => useRoomNpcsMock(...args),
}))

vi.mock("@/features/rules/components/mention-badge", () => ({
    MentionContent: ({ html }: { html: string }) => (
        <span data-testid="mention-content">{html.replace(/<[^>]*>/g, "")}</span>
    ),
}))

vi.mock("@/components/ui/glass-modal", () => ({
    GlassModal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
        open ? <div>{children}</div> : null,
    GlassModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassModalDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    GlassModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassModalTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const readyGmRuntime = {
    status: "ready" as const,
    role: "GM" as const,
    roomId: "room-1",
    playerId: "player-1",
    themeMode: "dark" as const,
    sceneReady: true,
}

const readyPlayerRuntime = { ...readyGmRuntime, role: "PLAYER" as const }

const readySession = {
    sessionStatus: "ready" as const,
    sessionToken: "token-1",
    sessionExpiresAt: "2099-04-20T10:15:00.000Z",
    isAuthenticated: true,
}

const kaelSheet = {
    _id: "sheet-1",
    name: "Kael",
    level: 5,
    class: "Guerreiro",
    race: "Humano",
    slug: "kael",
    userId: "user-1",
    hpCurrent: 38,
    hpMax: 45,
}

const goblinNpc = {
    id: "npc-1",
    _id: "npc-1",
    roomId: "room-1",
    sourceKind: "monster" as const,
    sourceId: "monster-goblin",
    hpCurrent: 7,
    hpMax: 7,
    hpTemp: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    source: { name: "Goblin" } as never,
}

type RegisteredContextMenu = {
    id: string
    icons: Array<{ icon: string; label: string }>
    onClick?: (context: { items: Array<Record<string, unknown>> }) => void
}

function getRegisteredContextMenus() {
    return sdkMock.contextMenu.create.mock.calls.map((call) => call[0] as RegisteredContextMenu)
}

function getRegisteredContextMenu(id: string) {
    return getRegisteredContextMenus().find((menu) => menu.id === id)
}

// ─────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks()
    sdkMock.isAvailable = true
    sdkMock.isReady = true
    sdkMock.room.id = "room-1"
    sdkMock.room.getMetadata.mockResolvedValue({})
    sdkMock.scene.items.getItems.mockResolvedValue([])
    sdkMock.scene.items.getItemBounds.mockResolvedValue({ width: 140, height: 140, center: { x: 100, y: 100 } })
    sdkMock.scene.items.updateItems.mockResolvedValue(undefined)
    sdkMock.scene.items.addItems.mockResolvedValue(undefined)
    sdkMock.scene.items.deleteItems.mockResolvedValue(undefined)
    sdkMock.scene.items.onChange.mockReturnValue(() => undefined)
    sdkMock.contextMenu.create.mockResolvedValue(undefined)
    sdkMock.contextMenu.remove.mockResolvedValue(undefined)
    sdkMock.action.open.mockResolvedValue(undefined)
    sdkMock.action.close.mockResolvedValue(undefined)
    sdkMock.player.deselect.mockResolvedValue(undefined)
    pusherMock.channels.clear()
    pusherMock.subscribe.mockClear()
    pusherMock.unsubscribe.mockClear()

    useRoomLinkedSheetsMock.mockReturnValue({
        entries: [],
        sheets: [],
        isLoading: false,
        errorMessage: null,
        reload: vi.fn(),
        unlinkSheet: vi.fn(),
    })

    useRoomNpcsMock.mockReturnValue({
        items: [],
        isLoading: false,
        errorMessage: null,
        reload: vi.fn(),
        linkNpc: vi.fn(),
        updateNpc: vi.fn(),
        removeNpc: vi.fn(),
    })

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token: "token-1", expiresAt: "2099-04-20T10:15:00Z" }), {
            status: 201,
            headers: { "content-type": "application/json" },
        })
    ))
})

// ─────────────────────────────────────────────
// Testes
// ─────────────────────────────────────────────

describe("canManageGmScene", () => {
    it("retorna true para GM com sessão pronta", () => {
        expect(canManageGmScene(readyGmRuntime, readySession)).toBe(true)
    })

    it("retorna false para PLAYER mesmo com sessão pronta", () => {
        expect(canManageGmScene(readyPlayerRuntime, readySession)).toBe(false)
    })

    it("retorna false para GM sem token de sessão", () => {
        expect(canManageGmScene(readyGmRuntime, { ...readySession, sessionToken: null })).toBe(false)
    })

    it("retorna false para GM com sessão em loading", () => {
        expect(canManageGmScene(readyGmRuntime, { ...readySession, sessionStatus: "loading" })).toBe(false)
    })
})

describe("OwlbearGmSceneController — context menus", () => {
    it("registra os dois itens de context menu para o GM", async () => {
        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3)
        })

        const ids = getRegisteredContextMenus().map((menu) => menu.id)
        expect(ids).toContain("com.dndicas.owlbear.link-player")
        expect(ids).toContain("com.dndicas.owlbear.link-npc")
        expect(ids).toContain("com.dndicas.owlbear.unlink-sheet")
    })

    it("usa o label 'Vincular a personagem' no menu de player", async () => {
        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3)
        })

        const playerMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-player")
        expect(playerMenu?.icons[0].label).toBe("Vincular a personagem")
    })

    it("usa o label 'Vincular a NPC' no menu de NPC", async () => {
        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3)
        })

        const npcMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-npc")
        expect(npcMenu?.icons[0].label).toBe("Vincular a NPC")
    })

    it("usa a rota CORS do ícone nos context menus", async () => {
        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3)
        })

        for (const menu of getRegisteredContextMenus()) {
            expect(menu.icons[0].icon).toBe("/owlbear/icons/context-menu.svg")
        }
    })

    it("não registra context menus para PLAYER", async () => {
        render(<OwlbearGmSceneController runtime={readyPlayerRuntime} session={readySession} />)

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).not.toHaveBeenCalled()
        })
    })

    it("não registra context menus enquanto a scene não está pronta", async () => {
        render(
            <OwlbearGmSceneController
                runtime={{ ...readyGmRuntime, sceneReady: false }}
                session={readySession}
            />
        )

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).not.toHaveBeenCalled()
        })
    })

    it("registra context menus quando a scene volta a ficar pronta", async () => {
        const { rerender } = render(
            <OwlbearGmSceneController
                runtime={{ ...readyGmRuntime, sceneReady: false }}
                session={readySession}
            />
        )

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).not.toHaveBeenCalled()
        })

        rerender(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3)
        })
    })

    it("remove os context menus ao desmontar", async () => {
        const { unmount } = render(
            <OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />
        )

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3)
        })

        unmount()

        await waitFor(() => {
            expect(sdkMock.contextMenu.remove).toHaveBeenCalledWith("com.dndicas.owlbear.link-player")
            expect(sdkMock.contextMenu.remove).toHaveBeenCalledWith("com.dndicas.owlbear.link-npc")
            expect(sdkMock.contextMenu.remove).toHaveBeenCalledWith("com.dndicas.owlbear.unlink-sheet")
        })
    })

    it("remove apenas o menu de NPC no cleanup do background de NPC", async () => {
        const { unmount } = render(
            <OwlbearGmSceneController
                runtime={readyGmRuntime}
                session={{ sessionStatus: "idle", sessionToken: null, sessionExpiresAt: null, isAuthenticated: false }}
                contextMenuKind="npc"
                linkDialogKind="none"
                overlayKinds={[]}
            />
        )

        await waitFor(() => {
            expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(1)
        })

        expect(getRegisteredContextMenus().map((menu) => menu.id)).toEqual(["com.dndicas.owlbear.link-npc"])

        unmount()

        await waitFor(() => {
            expect(sdkMock.contextMenu.remove).toHaveBeenCalledWith("com.dndicas.owlbear.link-npc")
        })
        expect(sdkMock.contextMenu.remove).not.toHaveBeenCalledWith("com.dndicas.owlbear.link-player")
        expect(sdkMock.contextMenu.remove).not.toHaveBeenCalledWith("com.dndicas.owlbear.unlink-sheet")
    })
})

describe("OwlbearGmSceneController — dialog de personagem", () => {
    it("exibe o dialog de personagem com lista de fichas da sala", async () => {
        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [{ playerId: "p1", sheetId: "sheet-1" }],
            sheets: [kaelSheet],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        // Aguarda o registro dos menus e dispara o onClick do menu de player manualmente
        await waitFor(() => expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3))

        const playerMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-player")
        const token = {
            id: "token-1",
            name: "Goblin",
            layer: "CHARACTER",
            type: "IMAGE",
            visible: true,
            locked: false,
            createdUserId: "u1",
            zIndex: 1,
            lastModified: "",
            lastModifiedUserId: "u1",
            position: { x: 0, y: 0 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            metadata: {},
        }
        playerMenu?.onClick?.({ items: [token] })

        expect(await screen.findByRole("heading", { name: "Vincular a personagem" })).toBeInTheDocument()
        await waitFor(() => {
            expect(sdkMock.action.open).toHaveBeenCalled()
            expect(sdkMock.player.deselect).toHaveBeenCalledWith(["token-1"])
        })
        expect(screen.getByText("Kael")).toBeInTheDocument()
        expect(screen.getByText("38/45 PV")).toBeInTheDocument()
    })

    it("renderiza campos HTML da ficha com MentionContent", async () => {
        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [{ playerId: "p1", sheetId: "sheet-1" }],
            sheets: [{ ...kaelSheet, class: "<span data-type='mention'>Guerreiro</span>" }],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3))

        const playerMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-player")
        playerMenu?.onClick?.({
            items: [{
                id: "token-1", name: "Token", layer: "CHARACTER", type: "IMAGE",
                visible: true, locked: false, createdUserId: "u1", zIndex: 1,
                lastModified: "", lastModifiedUserId: "u1",
                position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, metadata: {},
            }],
        })

        expect(await screen.findByTestId("mention-content")).toHaveTextContent("Guerreiro")
    })

    it("exibe estado vazio quando não há fichas vinculadas à sala", async () => {
        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [],
            sheets: [],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3))

        const playerMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-player")
        const token = {
            id: "token-1", name: "Goblin", layer: "CHARACTER", type: "IMAGE",
            visible: true, locked: false, createdUserId: "u1", zIndex: 1,
            lastModified: "", lastModifiedUserId: "u1",
            position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, metadata: {},
        }
        playerMenu?.onClick?.({ items: [token] })

        expect(await screen.findByText("Nenhuma ficha de jogador está vinculada a esta sala no momento.")).toBeInTheDocument()
    })

    it("salva kind='player' no metadata ao vincular personagem", async () => {
        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [{ playerId: "p1", sheetId: "sheet-1" }],
            sheets: [kaelSheet],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })

        vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
            if (typeof url === "string" && url.includes("character-sheets")) {
                return Promise.resolve(new Response(JSON.stringify({
                    ...kaelSheet, hpCurrent: 38, hpMax: 45,
                }), { status: 200, headers: { "content-type": "application/json" } }))
            }
            return Promise.resolve(new Response(JSON.stringify({
                token: "token-1", expiresAt: "2099-04-20T10:15:00Z",
            }), { status: 201, headers: { "content-type": "application/json" } }))
        }))

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3))

        const playerMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-player")
        const token = {
            id: "token-1", name: "Herói", layer: "CHARACTER", type: "IMAGE",
            visible: true, locked: false, createdUserId: "u1", zIndex: 1,
            lastModified: "", lastModifiedUserId: "u1",
            position: { x: 100, y: 100 }, rotation: 0, scale: { x: 1, y: 1 }, metadata: {},
        }
        playerMenu?.onClick?.({ items: [token] })

        await screen.findByRole("heading", { name: "Vincular a personagem" })
        fireEvent.click(screen.getByText("Kael"))

        await waitFor(() => {
            expect(sdkMock.scene.items.updateItems).toHaveBeenCalledWith(
                ["token-1"],
                expect.any(Function),
            )
        })

        // Verifica que a função de update salva kind="player"
        const updateCall = sdkMock.scene.items.updateItems.mock.calls.find(
            (call: unknown[]) => Array.isArray(call[0]) && call[0].includes("token-1")
        )
        const draft: Array<typeof token & { metadata: Record<string, unknown> }> = [{ ...token, metadata: {} }]
        updateCall?.[1](draft)
        expect(draft[0].metadata["com.dndicas.owlbear/token"]).toMatchObject({
            kind: "player",
            refId: "sheet-1",
            tokenId: "token-1",
        })
        await waitFor(() => {
            expect(sdkMock.action.close).toHaveBeenCalled()
        })
    })
})

describe("OwlbearGmSceneController — dialog de NPC", () => {
    it("exibe o dialog de NPC com lista de NPCs da sala", async () => {
        useRoomNpcsMock.mockReturnValue({
            items: [goblinNpc],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            linkNpc: vi.fn(),
            updateNpc: vi.fn(),
            removeNpc: vi.fn(),
        })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3))

        const npcMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-npc")
        const token = {
            id: "token-2", name: "Token Goblin", layer: "CHARACTER", type: "IMAGE",
            visible: true, locked: false, createdUserId: "u1", zIndex: 1,
            lastModified: "", lastModifiedUserId: "u1",
            position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, metadata: {},
        }
        npcMenu?.onClick?.({ items: [token] })

        expect(await screen.findByRole("heading", { name: "Vincular a NPC" })).toBeInTheDocument()
        await waitFor(() => {
            expect(sdkMock.action.open).toHaveBeenCalled()
            expect(sdkMock.player.deselect).toHaveBeenCalledWith(["token-2"])
        })
        expect(screen.getByText("Goblin")).toBeInTheDocument()
        expect(screen.getByText("7/7 PV")).toBeInTheDocument()
    })

    it("recarrega os NPCs da sala ao abrir o dialog de vínculo", async () => {
        const reload = vi.fn().mockResolvedValue(undefined)
        useRoomNpcsMock.mockReturnValue({
            items: [goblinNpc],
            isLoading: false,
            errorMessage: null,
            reload,
            linkNpc: vi.fn(),
            updateNpc: vi.fn(),
            removeNpc: vi.fn(),
        })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3))

        const npcMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-npc")
        npcMenu?.onClick?.({
            items: [{
                id: "token-2", name: "Token Goblin", layer: "CHARACTER", type: "IMAGE",
                visible: true, locked: false, createdUserId: "u1", zIndex: 1,
                lastModified: "", lastModifiedUserId: "u1",
                position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, metadata: {},
            }],
        })

        expect(await screen.findByRole("heading", { name: "Vincular a NPC" })).toBeInTheDocument()
        await waitFor(() => expect(reload).toHaveBeenCalled())
    })

    it("exibe estado vazio quando não há NPCs na sala", async () => {
        useRoomNpcsMock.mockReturnValue({
            items: [],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            linkNpc: vi.fn(),
            updateNpc: vi.fn(),
            removeNpc: vi.fn(),
        })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3))

        const npcMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-npc")
        const token = {
            id: "token-2", name: "Token", layer: "CHARACTER", type: "IMAGE",
            visible: true, locked: false, createdUserId: "u1", zIndex: 1,
            lastModified: "", lastModifiedUserId: "u1",
            position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, metadata: {},
        }
        npcMenu?.onClick?.({ items: [token] })

        expect(await screen.findByText(/Nenhum NPC adicionado à sala/)).toBeInTheDocument()
    })

    it("salva kind='npc' no metadata ao vincular NPC", async () => {
        useRoomNpcsMock.mockReturnValue({
            items: [goblinNpc],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            linkNpc: vi.fn(),
            updateNpc: vi.fn(),
            removeNpc: vi.fn(),
        })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3))

        const npcMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-npc")
        const token = {
            id: "token-2", name: "Token Goblin", layer: "CHARACTER", type: "IMAGE",
            visible: true, locked: false, createdUserId: "u1", zIndex: 1,
            lastModified: "", lastModifiedUserId: "u1",
            position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, metadata: {},
        }
        npcMenu?.onClick?.({ items: [token] })

        await screen.findByRole("heading", { name: "Vincular a NPC" })
        fireEvent.click(screen.getByText("Goblin"))

        await waitFor(() => {
            expect(sdkMock.scene.items.updateItems).toHaveBeenCalledWith(
                ["token-2"],
                expect.any(Function),
            )
        })

        // Verifica que a função de update salva kind="npc"
        const updateCall = sdkMock.scene.items.updateItems.mock.calls.find(
            (call: unknown[]) => Array.isArray(call[0]) && call[0].includes("token-2")
        )
        const draft: Array<typeof token & { metadata: Record<string, unknown> }> = [{ ...token, metadata: {} }]
        updateCall?.[1](draft)
        expect(draft[0].metadata["com.dndicas.owlbear/token"]).toMatchObject({
            kind: "npc",
            refId: "npc-1",
            tokenId: "token-2",
        })
        await waitFor(() => {
            expect(sdkMock.action.close).toHaveBeenCalled()
        })
    })
})

describe("OwlbearGmSceneController — SDK parse de metadata", () => {
    it("parseTokenLinkMetadata aceita kind='npc'", async () => {
        const { parseTokenLinkMetadata } = await import("@/features/owlbear/sdk")
        const result = parseTokenLinkMetadata({
            "com.dndicas.owlbear/token": {
                version: 1,
                kind: "npc",
                refId: "npc-1",
                tokenId: "token-1",
                overlayIds: [],
            },
        })
        expect(result).not.toBeNull()
        expect(result?.kind).toBe("npc")
        expect(result?.refId).toBe("npc-1")
    })

    it("parseTokenLinkMetadata aceita kind='player'", async () => {
        const { parseTokenLinkMetadata } = await import("@/features/owlbear/sdk")
        const result = parseTokenLinkMetadata({
            "com.dndicas.owlbear/token": {
                version: 1,
                kind: "player",
                refId: "sheet-1",
                tokenId: "token-1",
                overlayIds: ["ov-1", "ov-2"],
            },
        })
        expect(result?.kind).toBe("player")
        expect(result?.overlayIds).toEqual(["ov-1", "ov-2"])
    })

    it("parseTokenLinkMetadata rejeita kind inválido", async () => {
        const { parseTokenLinkMetadata } = await import("@/features/owlbear/sdk")
        const result = parseTokenLinkMetadata({
            "com.dndicas.owlbear/token": {
                version: 1,
                kind: "unknown",
                refId: "x",
                tokenId: "y",
            },
        })
        expect(result).toBeNull()
    })

    it("parseOverlayMetadata aceita role='bar'", async () => {
        const { parseOverlayMetadata } = await import("@/features/owlbear/sdk")
        const result = parseOverlayMetadata({
            "com.dndicas.owlbear/overlay": {
                version: 1,
                tokenId: "token-1",
                role: "bar",
            },
        })
        expect(result?.role).toBe("bar")
    })

    it("parseOverlayMetadata aceita role='backdrop'", async () => {
        const { parseOverlayMetadata } = await import("@/features/owlbear/sdk")
        const result = parseOverlayMetadata({
            "com.dndicas.owlbear/overlay": {
                version: 1,
                tokenId: "token-1",
                role: "backdrop",
            },
        })
        expect(result?.role).toBe("backdrop")
    })

    it("parseOverlayMetadata aceita role='tempBar'", async () => {
        const { parseOverlayMetadata } = await import("@/features/owlbear/sdk")
        const result = parseOverlayMetadata({
            "com.dndicas.owlbear/overlay": {
                version: 1,
                tokenId: "token-1",
                role: "tempBar",
                overlayWidth: 140,
            },
        })
        expect(result?.role).toBe("tempBar")
        expect((result as { overlayWidth?: number } | null)?.overlayWidth).toBe(140)
    })

    it("parseOverlayMetadata aceita role='label' como overlay legado removível", async () => {
        const { parseOverlayMetadata } = await import("@/features/owlbear/sdk")
        const result = parseOverlayMetadata({
            "com.dndicas.owlbear/overlay": {
                version: 1,
                tokenId: "token-1",
                role: "label",
            },
        })
        expect(result?.role).toBe("label")
    })
})

describe("OwlbearGmSceneController — HP overlay", () => {
    it("syncs player token overlay from sheet.patched without opening the GM sheets tab", async () => {
        const { fetchOwlbearSheetById } = await import("@/features/owlbear/sdk")
        const token = {
            id: "token-realtime-player",
            name: "Herói",
            layer: "CHARACTER",
            type: "IMAGE",
            visible: true,
            locked: false,
            createdUserId: "u1",
            zIndex: 1,
            lastModified: "",
            lastModifiedUserId: "u1",
            position: { x: 100, y: 100 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            attachedTo: undefined,
            metadata: {
                "com.dndicas.owlbear/token": {
                    version: 1,
                    kind: "player",
                    refId: "sheet-1",
                    tokenId: "token-realtime-player",
                    overlayIds: [],
                    linkedAt: "2026-01-01T00:00:00.000Z",
                },
            },
        }

        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [{ playerId: "p1", sheetId: "sheet-1" }],
            sheets: [{ ...kaelSheet, hpCurrent: 38, hpMax: 45, hpTemp: 0 }],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })
        sdkMock.scene.items.getItems
            .mockResolvedValueOnce([])
            .mockResolvedValue([token])
        sdkMock.scene.items.getItemBounds.mockResolvedValue({ width: 140, height: 140, center: { x: 100, y: 100 } })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(pusherMock.subscribe).toHaveBeenCalledWith(expect.any(Object), "sheet.sheet-1"))
        await waitFor(() => expect(sdkMock.scene.items.getItems).toHaveBeenCalledTimes(1))
        const channel = pusherMock.getChannel("sheet.sheet-1")
        const handler = channel.handlers.get("sheet.patched")
        expect(handler).toBeDefined()

        handler?.({
            sheetId: "sheet-1",
            action: "patched",
            sheet: {
                _id: "sheet-1",
                name: "Kael Ferido",
                slug: "kael",
                userId: "user-1",
                hpCurrent: 10,
                hpMax: 40,
                hpTemp: 5,
            },
            serverTimestamp: "2026-01-01T00:00:00.000Z",
        })

        await waitFor(() => expect(sdkMock.scene.items.addItems).toHaveBeenCalled())
        expect(fetchOwlbearSheetById).not.toHaveBeenCalled()

        const createdItems = sdkMock.scene.items.addItems.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
        const byRole = new Map(createdItems.map((item) => [
            ((item.metadata as Record<string, Record<string, unknown>>)["com.dndicas.owlbear/overlay"].role),
            item,
        ]))

        expect(byRole.get("bar")).toMatchObject({ width: 35 })
        expect(byRole.get("tempBar")).toMatchObject({ fillOpacity: 1, width: 18 })
    })

    it("waits for queued overlay sync before closing the action after linking an NPC", async () => {
        const { updateTokenOverlayIds } = await import("@/features/owlbear/sdk")
        const token = {
            id: "token-queued-sync",
            name: "Token Goblin",
            layer: "CHARACTER",
            type: "IMAGE",
            visible: true,
            locked: false,
            createdUserId: "u1",
            zIndex: 1,
            lastModified: "",
            lastModifiedUserId: "u1",
            position: { x: 100, y: 100 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            metadata: {},
        }
        const sceneItems: Array<typeof token & { metadata: Record<string, unknown> }> = [{ ...token, metadata: {} }]
        let resolveInitialSyncItems: () => void = () => {
            throw new Error("Initial sync resolver was not registered")
        }

        useRoomNpcsMock.mockReturnValue({
            items: [{ ...goblinNpc, hpCurrent: 6, hpMax: 12, hpTemp: 3 }],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            linkNpc: vi.fn(),
            updateNpc: vi.fn(),
            removeNpc: vi.fn(),
        })
        sdkMock.scene.items.getItems
            .mockImplementationOnce(() => new Promise<Array<typeof token>>((resolve) => {
                resolveInitialSyncItems = () => resolve([{ ...token, metadata: {} }])
            }))
            .mockImplementation(() => Promise.resolve(sceneItems))
        sdkMock.scene.items.updateItems.mockImplementation(async (ids: string[], updater: (draft: Array<typeof token & { metadata: Record<string, unknown> }>) => void) => {
            const draft = sceneItems.filter((item) => ids.includes(item.id))
            updater(draft)
        })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.scene.items.getItems).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(sdkMock.contextMenu.create).toHaveBeenCalledTimes(3))

        const npcMenu = getRegisteredContextMenu("com.dndicas.owlbear.link-npc")
        npcMenu?.onClick?.({ items: [token] })

        await screen.findByRole("heading", { name: "Vincular a NPC" })
        fireEvent.click(screen.getByText("Goblin"))

        await waitFor(() => {
            expect(sceneItems[0].metadata["com.dndicas.owlbear/token"]).toMatchObject({
                kind: "npc",
                refId: "npc-1",
                tokenId: "token-queued-sync",
            })
        })
        expect(sdkMock.action.close).not.toHaveBeenCalled()

        resolveInitialSyncItems()

        await waitFor(() => expect(sdkMock.scene.items.addItems).toHaveBeenCalled())
        await waitFor(() => expect(updateTokenOverlayIds).toHaveBeenCalledWith(
            "token-queued-sync",
            expect.arrayContaining([expect.any(String)]),
        ))
        expect(sdkMock.action.close).toHaveBeenCalled()

        const addItemsOrder = sdkMock.scene.items.addItems.mock.invocationCallOrder[0]
        const closeOrder = sdkMock.action.close.mock.invocationCallOrder[0]
        expect(addItemsOrder).toBeLessThan(closeOrder)
    })

    it("renders temporary HP over the lower half of the main HP bar", async () => {
        const { fetchOwlbearSheetById } = await import("@/features/owlbear/sdk")
        const token = {
            id: "token-1",
            name: "Herói",
            layer: "CHARACTER",
            type: "IMAGE",
            visible: true,
            locked: false,
            createdUserId: "u1",
            zIndex: 1,
            lastModified: "",
            lastModifiedUserId: "u1",
            position: { x: 100, y: 100 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            attachedTo: undefined,
            metadata: {
                "com.dndicas.owlbear/token": {
                    version: 1,
                    kind: "player",
                    refId: "sheet-1",
                    tokenId: "token-1",
                    overlayIds: [],
                    linkedAt: "2026-01-01T00:00:00.000Z",
                },
            },
        }

        useRoomLinkedSheetsMock.mockReturnValue({
            entries: [{ playerId: "p1", sheetId: "sheet-1" }],
            sheets: [{ ...kaelSheet, hpCurrent: 20, hpMax: 40, hpTemp: 10 }],
            isLoading: false,
            errorMessage: null,
            reload: vi.fn(),
            unlinkSheet: vi.fn(),
        })
        sdkMock.scene.items.getItems.mockResolvedValue([token])
        sdkMock.scene.items.getItemBounds.mockResolvedValue({ width: 140, height: 140, center: { x: 100, y: 100 } })
        vi.mocked(fetchOwlbearSheetById).mockResolvedValueOnce({
            _id: "sheet-1",
            name: "Kael",
            hpCurrent: 20,
            hpMax: 40,
            hpTemp: 10,
        } as never)

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.scene.items.addItems).toHaveBeenCalled())

        const createdItems = sdkMock.scene.items.addItems.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
        const byRole = new Map(createdItems.map((item) => [
            ((item.metadata as Record<string, Record<string, unknown>>)["com.dndicas.owlbear/overlay"].role),
            item,
        ]))

        expect(byRole.get("backdrop")).toMatchObject({ height: 14, position: { x: 30, y: 12 }, width: 140 })
        expect(byRole.get("bar")).toMatchObject({ height: 14, position: { x: 30, y: 12 }, width: 70 })
        expect(byRole.get("tempBar")).toMatchObject({
            fillColor: OVERLAY_TEMP_BAR_COLOR,
            fillOpacity: 1,
            height: 7,
            position: { x: 30, y: 19 },
            width: 35,
        })
    })

    it("updates temporary HP opacity through style instead of top-level fillOpacity", async () => {
        const { fetchOwlbearSheetById } = await import("@/features/owlbear/sdk")
        const token = {
            id: "token-existing-overlay",
            name: "Herói",
            layer: "CHARACTER",
            type: "IMAGE",
            visible: true,
            locked: false,
            createdUserId: "u1",
            zIndex: 1,
            lastModified: "",
            lastModifiedUserId: "u1",
            position: { x: 100, y: 100 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            metadata: {
                "com.dndicas.owlbear/token": {
                    version: 1,
                    kind: "player",
                    refId: "sheet-1",
                    tokenId: "token-existing-overlay",
                    overlayIds: ["overlay-backdrop", "overlay-bar", "overlay-temp"],
                    linkedAt: "2026-01-01T00:00:00.000Z",
                },
            },
        }
        const overlays = [
            {
                id: "overlay-backdrop", name: "Backdrop", type: "SHAPE", layer: "TEXT", visible: true, locked: false,
                createdUserId: "u1", zIndex: 1, lastModified: "", lastModifiedUserId: "u1", position: { x: 30, y: 12 }, rotation: 0, scale: { x: 1, y: 1 }, attachedTo: token.id,
                width: 140, height: 26, metadata: { "com.dndicas.owlbear/overlay": { version: 1, tokenId: token.id, role: "backdrop", overlayWidth: 140 } },
            },
            {
                id: "overlay-bar", name: "Bar", type: "SHAPE", layer: "TEXT", visible: true, locked: false,
                createdUserId: "u1", zIndex: 2, lastModified: "", lastModifiedUserId: "u1", position: { x: 30, y: 12 }, rotation: 0, scale: { x: 1, y: 1 }, attachedTo: token.id,
                width: 70, height: 14, style: { fillColor: "#00ff00" }, metadata: { "com.dndicas.owlbear/overlay": { version: 1, tokenId: token.id, role: "bar", barWidth: 70, overlayWidth: 140, barColor: "#00ff00" } },
            },
            {
                id: "overlay-temp", name: "Temp", type: "SHAPE", layer: "TEXT", visible: true, locked: false,
                createdUserId: "u1", zIndex: 3, lastModified: "", lastModifiedUserId: "u1", position: { x: 30, y: 30 }, rotation: 0, scale: { x: 1, y: 1 }, attachedTo: token.id,
                width: 35, height: 8, fillOpacity: 1, style: { fillColor: LEGACY_TEMP_BAR_COLOR }, metadata: { "com.dndicas.owlbear/overlay": { version: 1, tokenId: token.id, role: "tempBar", barWidth: 35, overlayWidth: 140, barColor: LEGACY_TEMP_BAR_COLOR } },
            },
        ]

        vi.mocked(fetchOwlbearSheetById).mockResolvedValueOnce({
            _id: "sheet-1",
            name: "Kael",
            hpCurrent: 20,
            hpMax: 40,
            hpTemp: 0,
        } as never)
        sdkMock.scene.items.getItems.mockResolvedValue([token, ...overlays])
        sdkMock.scene.items.getItemBounds.mockResolvedValue({ width: 140, height: 140, center: { x: 100, y: 100 } })
        sdkMock.scene.items.updateItems.mockImplementation(async (items: Array<Record<string, unknown>>, updater: (draft: Array<Record<string, unknown>>) => void) => {
            updater(items)
        })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.scene.items.updateItems).toHaveBeenCalledWith(overlays, expect.any(Function)))
        const tempBar = overlays[2] as Record<string, unknown> & { style?: Record<string, unknown> }
        expect(tempBar.fillOpacity).toBe(1)
        expect(tempBar.style?.fillOpacity).toBe(0)
        expect(tempBar.style?.fillColor).toBe(OVERLAY_TEMP_BAR_COLOR)
        expect(tempBar.height).toBe(7)
        expect(tempBar.position).toEqual({ x: 30, y: 19 })
    })

    it("recreates linked overlays when Owlbear rejects an overlay update", async () => {
        const { fetchOwlbearSheetById, updateTokenOverlayIds } = await import("@/features/owlbear/sdk")
        const token = {
            id: "token-recreate-overlay",
            name: "Herói",
            layer: "CHARACTER",
            type: "IMAGE",
            visible: true,
            locked: false,
            createdUserId: "u1",
            zIndex: 1,
            lastModified: "",
            lastModifiedUserId: "u1",
            position: { x: 100, y: 100 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            metadata: {
                "com.dndicas.owlbear/token": {
                    version: 1,
                    kind: "player",
                    refId: "sheet-1",
                    tokenId: "token-recreate-overlay",
                    overlayIds: ["overlay-backdrop", "overlay-bar", "overlay-temp"],
                    linkedAt: "2026-01-01T00:00:00.000Z",
                },
            },
        }
        const overlays = [
            { id: "overlay-backdrop", name: "Backdrop", type: "SHAPE", layer: "TEXT", visible: true, locked: false, createdUserId: "u1", zIndex: 1, lastModified: "", lastModifiedUserId: "u1", position: { x: 30, y: 12 }, rotation: 0, scale: { x: 1, y: 1 }, attachedTo: token.id, width: 140, height: 26, metadata: { "com.dndicas.owlbear/overlay": { version: 1, tokenId: token.id, role: "backdrop", overlayWidth: 140 } } },
            { id: "overlay-bar", name: "Bar", type: "SHAPE", layer: "TEXT", visible: true, locked: false, createdUserId: "u1", zIndex: 2, lastModified: "", lastModifiedUserId: "u1", position: { x: 30, y: 12 }, rotation: 0, scale: { x: 1, y: 1 }, attachedTo: token.id, width: 70, height: 14, style: { fillColor: "#00ff00" }, metadata: { "com.dndicas.owlbear/overlay": { version: 1, tokenId: token.id, role: "bar", barWidth: 70, overlayWidth: 140, barColor: "#00ff00" } } },
            { id: "overlay-temp", name: "Temp", type: "SHAPE", layer: "TEXT", visible: true, locked: false, createdUserId: "u1", zIndex: 3, lastModified: "", lastModifiedUserId: "u1", position: { x: 30, y: 30 }, rotation: 0, scale: { x: 1, y: 1 }, attachedTo: token.id, width: 35, height: 8, fillOpacity: 1, style: { fillColor: LEGACY_TEMP_BAR_COLOR }, metadata: { "com.dndicas.owlbear/overlay": { version: 1, tokenId: token.id, role: "tempBar", barWidth: 35, overlayWidth: 140, barColor: LEGACY_TEMP_BAR_COLOR } } },
        ]

        vi.mocked(fetchOwlbearSheetById).mockResolvedValueOnce({
            _id: "sheet-1",
            name: "Kael",
            hpCurrent: 20,
            hpMax: 40,
            hpTemp: 0,
        } as never)
        sdkMock.scene.items.getItems.mockResolvedValue([token, ...overlays])
        sdkMock.scene.items.getItemBounds.mockResolvedValue({ width: 140, height: 140, center: { x: 100, y: 100 } })
        sdkMock.scene.items.updateItems.mockRejectedValueOnce({ error: { message: "\"updates[2]\" does not match any of the allowed types" } })

        render(<OwlbearGmSceneController runtime={readyGmRuntime} session={readySession} />)

        await waitFor(() => expect(sdkMock.scene.items.deleteItems).toHaveBeenCalledWith(["overlay-backdrop", "overlay-bar", "overlay-temp"]))
        expect(sdkMock.scene.items.addItems).toHaveBeenCalled()
        expect(updateTokenOverlayIds).toHaveBeenCalledWith("token-recreate-overlay", expect.arrayContaining([expect.any(String)]))
    })
})
