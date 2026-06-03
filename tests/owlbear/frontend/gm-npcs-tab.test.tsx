import * as React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getNpcHpBarColor, OwlbearGmNpcsTab } from "@/features/owlbear/gm-npcs-tab"
import type { OwlbearRoomNpc } from "@/features/owlbear/room-npcs-api"
import type { Monster } from "@/features/monsters/types/monsters.types"

const useRoomNpcsMock = vi.hoisted(() => vi.fn())
const useInfiniteNpcsMock = vi.hoisted(() => vi.fn())
const useInfiniteMonstersMock = vi.hoisted(() => vi.fn())

vi.mock("@/features/owlbear/use-room-npcs", () => ({
    useRoomNpcs: (...args: unknown[]) => useRoomNpcsMock(...args),
}))

vi.mock("@/features/monsters/api/npcs-queries", () => ({
    useInfiniteNpcs: (...args: unknown[]) => useInfiniteNpcsMock(...args),
}))

vi.mock("@/features/monsters/api/monsters-queries", () => ({
    useInfiniteMonsters: (...args: unknown[]) => useInfiniteMonstersMock(...args),
}))

vi.mock("@/components/ui/search-input", () => ({
    SearchInput: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
        <input aria-label={placeholder ?? "Buscar"} value={value} onChange={(event) => onChange(event.target.value)} />
    ),
}))

vi.mock("@/components/ui/glass-modal", () => ({
    GlassModal: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null,
    GlassModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassModalDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    GlassModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassModalTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock("@/components/ui/glass-dropdown-menu", () => ({
    GlassDropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    GlassDropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    GlassDropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
        <button type="button" onClick={onSelect}>{children}</button>
    ),
}))

vi.mock("@/components/ui/glass-image", () => ({
    GlassImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

vi.mock("@/features/monsters/components/npc-preview", () => ({
    NpcPreview: ({ monster }: { monster: Monster }) => <div data-testid="npc-preview">{monster.name}</div>,
}))

vi.mock("@/features/monsters/components/npc-form-modal", () => ({
    NpcFormModal: () => null,
}))

vi.mock("@/app/(dashboard)/my-sheets/_components/my-sheets-content", () => ({
    MySheetsContent: () => <div data-testid="login-view">Login View</div>,
}))

vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
        div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props}>{children}</div>,
        span: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: React.HTMLAttributes<HTMLSpanElement> & Record<string, unknown>) => <span {...props}>{children}</span>,
    },
}))

const runtime = {
    status: "ready" as const,
    role: "GM" as const,
    roomId: "room-1",
    playerId: "player-1",
    themeMode: "dark" as const,
    sceneReady: true,
}

const session = {
    sessionStatus: "ready" as const,
    sessionToken: "token-1",
    sessionExpiresAt: "2099-01-01T00:00:00.000Z",
}

const monster: Monster = {
    _id: "monster-1",
    id: "monster-1",
    name: "Lobo",
    originalName: "Wolf",
    source: "LDM",
    description: "Um lobo cinzento.",
    image: "",
    status: "active",
    type: "beast",
    size: "M",
    alignment: "unaligned",
    armorClass: 13,
    hitPointsFormula: "2d8 + 2",
    speed: "12m",
    attributes: { strength: 12, dexterity: 15, constitution: 12, intelligence: 3, wisdom: 12, charisma: 6 },
    savingThrows: {},
    skills: {},
    senses: {},
    sensesAndLanguages: [],
    challengeRating: "1/4",
    languages: "—",
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
    lairActions: [],
    regionalEffects: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
}

const bandit = {
    ...monster,
    _id: "monster-2",
    id: "monster-2",
    name: "Bandido",
    originalName: "Bandit",
}

function roomNpc(overrides: Partial<OwlbearRoomNpc> = {}): OwlbearRoomNpc {
    return {
        id: "room-npc-1",
        _id: "room-npc-1",
        roomId: "room-1",
        sourceKind: "monster",
        sourceId: "monster-1",
        hpCurrent: 12,
        hpMax: 20,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        source: monster,
        ...overrides,
    }
}

function renderTab(props: { isAuthenticated?: boolean; items?: OwlbearRoomNpc[]; updateNpc?: ReturnType<typeof vi.fn>; removeNpc?: ReturnType<typeof vi.fn> } = {}) {
    const updateNpc = props.updateNpc ?? vi.fn().mockResolvedValue(null)
    const removeNpc = props.removeNpc ?? vi.fn().mockResolvedValue(undefined)
    useRoomNpcsMock.mockReturnValue({
        items: props.items ?? [roomNpc(), roomNpc({ id: "room-npc-2", _id: "room-npc-2", sourceId: "monster-2", hpCurrent: 7, hpMax: 11, source: bandit })],
        isLoading: false,
        errorMessage: null,
        linkNpc: vi.fn(),
        updateNpc,
        removeNpc,
    })

    render(
        <OwlbearGmNpcsTab
            runtime={runtime}
            session={session}
            isAuthenticated={props.isAuthenticated ?? true}
            isAuthLoaded
        />
    )

    return { updateNpc, removeNpc }
}

describe("OwlbearGmNpcsTab", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useInfiniteNpcsMock.mockReturnValue({ data: { pages: [{ items: [] }] }, isLoading: false, isFetching: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() })
        useInfiniteMonstersMock.mockReturnValue({ data: { pages: [{ items: [] }] }, isLoading: false, isFetching: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() })
    })

    it("asks the GM to login before using the NPC tab", () => {
        renderTab({ isAuthenticated: false })

        expect(screen.getByTestId("login-view")).toBeInTheDocument()
        expect(useRoomNpcsMock).toHaveBeenCalledWith("room-1", "token-1", false)
    })

    it("renders room NPCs with HP and expands the preview", () => {
        renderTab()

        expect(screen.getByTestId("gm-room-npcs-table")).toBeInTheDocument()
        expect(screen.getByText("Lobo")).toBeInTheDocument()
        expect(screen.getByText("12/20 PV")).toBeInTheDocument()

        fireEvent.click(screen.getAllByText("Lobo")[0])

        expect(screen.getByTestId("npc-preview")).toHaveTextContent("Lobo")

        fireEvent.click(screen.getAllByText("Lobo")[0])

        expect(screen.queryByTestId("npc-preview")).not.toBeInTheDocument()
    })

    it("maps NPC HP to a continuous red-yellow-green bar color", () => {
        expect(getNpcHpBarColor(0, 20)).toBe("rgb(88, 0, 0)")
        expect(getNpcHpBarColor(10, 20)).toBe("rgb(234, 179, 8)")
        expect(getNpcHpBarColor(20, 20)).toBe("rgb(52, 211, 153)")
    })

    it("renders the calculated HP bar color", () => {
        renderTab({ items: [roomNpc({ hpCurrent: 10, hpMax: 20 })] })

        expect(screen.getByTestId("npc-hp-bar-room-npc-1")).toHaveStyle({
            width: "50%",
            backgroundColor: "rgb(234, 179, 8)",
        })
    })

    it("filters linked NPCs with local fuzzy search", () => {
        renderTab()

        fireEvent.change(screen.getByLabelText("Buscar NPCs da sala..."), { target: { value: "band" } })

        expect(screen.getByText("Bandido")).toBeInTheDocument()
        expect(screen.queryByText("Lobo")).not.toBeInTheDocument()
    })

    it("applies positive and negative HP deltas with clamping", async () => {
        const updateNpc = vi.fn().mockResolvedValue(null)
        renderTab({ items: [roomNpc()], updateNpc })

        const input = screen.getByLabelText("Ajustar vida de Lobo")
        fireEvent.change(input, { target: { value: "20" } })
        fireEvent.keyDown(input, { key: "Enter" })

        await waitFor(() => expect(updateNpc).toHaveBeenCalledWith("room-npc-1", { hpCurrent: 20 }))

        fireEvent.change(input, { target: { value: "-99" } })
        fireEvent.keyDown(input, { key: "Enter" })

        await waitFor(() => expect(updateNpc).toHaveBeenCalledWith("room-npc-1", { hpCurrent: 0 }))
    })

    it("confirms before removing the NPC from the room", async () => {
        const removeNpc = vi.fn().mockResolvedValue(undefined)
        renderTab({ items: [roomNpc()], removeNpc })

        fireEvent.click(screen.getByLabelText("Remover Lobo"))
        fireEvent.click(screen.getByRole("button", { name: "Remover" }))

        await waitFor(() => expect(removeNpc).toHaveBeenCalledWith("room-npc-1"))
    })
})
