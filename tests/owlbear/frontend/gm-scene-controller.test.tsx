import * as React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { canManageGmScene, OwlbearGmSceneController } from "@/features/owlbear/gm-scene-controller"

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const useRoomLinkedSheetsMock = vi.hoisted(() => vi.fn())
const useRoomNpcsMock = vi.hoisted(() => vi.fn())

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

vi.mock("@owlbear-rodeo/sdk", () => ({
    default: sdkMock,
    buildShape: vi.fn(() => ({
        name: vi.fn().mockReturnThis(),
        attachedTo: vi.fn().mockReturnThis(),
        layer: vi.fn().mockReturnThis(),
        disableHit: vi.fn().mockReturnThis(),
        position: vi.fn().mockReturnThis(),
        width: vi.fn().mockReturnThis(),
        height: vi.fn().mockReturnThis(),
        shapeType: vi.fn().mockReturnThis(),
        fillColor: vi.fn().mockReturnThis(),
        fillOpacity: vi.fn().mockReturnThis(),
        strokeColor: vi.fn().mockReturnThis(),
        strokeOpacity: vi.fn().mockReturnThis(),
        strokeWidth: vi.fn().mockReturnThis(),
        metadata: vi.fn().mockReturnThis(),
        build: vi.fn().mockReturnValue({ id: "overlay-mock-" + Math.random(), type: "SHAPE", metadata: {} }),
    })),
}))

vi.mock("@/features/owlbear/sdk", async () => {
    const actual = await vi.importActual<typeof import("@/features/owlbear/sdk")>("@/features/owlbear/sdk")
    return {
        ...actual,
        loadOwlbearSdk: vi.fn(async () => sdkMock),
        loadOwlbearSdkModule: vi.fn(async () => ({
            buildShape: vi.fn(() => ({
                name: vi.fn().mockReturnThis(),
                attachedTo: vi.fn().mockReturnThis(),
                layer: vi.fn().mockReturnThis(),
                disableHit: vi.fn().mockReturnThis(),
                position: vi.fn().mockReturnThis(),
                width: vi.fn().mockReturnThis(),
                height: vi.fn().mockReturnThis(),
                shapeType: vi.fn().mockReturnThis(),
                fillColor: vi.fn().mockReturnThis(),
                fillOpacity: vi.fn().mockReturnThis(),
                strokeColor: vi.fn().mockReturnThis(),
                strokeOpacity: vi.fn().mockReturnThis(),
                strokeWidth: vi.fn().mockReturnThis(),
                metadata: vi.fn().mockReturnThis(),
                build: vi.fn().mockReturnValue({ id: "overlay-mock", type: "SHAPE", metadata: {} }),
            })),
        })),
        fetchOwlbearSheetById: vi.fn(async () => ({
            _id: "sheet-1",
            name: "Kael",
            hpCurrent: 38,
            hpMax: 45,
        })),
        fetchOwlbearRoomNpcById: vi.fn(async () => ({
            name: "Goblin",
            hpCurrent: 7,
            hpMax: 7,
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
    sdkMock.scene.items.updateItems.mockResolvedValue(undefined)
    sdkMock.scene.items.addItems.mockResolvedValue(undefined)
    sdkMock.scene.items.deleteItems.mockResolvedValue(undefined)
    sdkMock.scene.items.onChange.mockReturnValue(() => undefined)
    sdkMock.contextMenu.create.mockResolvedValue(undefined)
    sdkMock.contextMenu.remove.mockResolvedValue(undefined)
    sdkMock.action.open.mockResolvedValue(undefined)
    sdkMock.action.close.mockResolvedValue(undefined)
    sdkMock.player.deselect.mockResolvedValue(undefined)

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
                session={{ sessionStatus: "idle", sessionToken: null, sessionExpiresAt: null }}
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
