import { render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useDiceResultConsoleApi } from "@/features/dice-roller/hooks/use-dice-result-console-api"

const setDiceOverrideMock = vi.hoisted(() => vi.fn())
const clearScopedDiceOverrideMock = vi.hoisted(() => vi.fn())
const listScopedDiceOverridesMock = vi.hoisted(() => vi.fn())
const getPartyPlayersMock = vi.hoisted(() => vi.fn())
const loadOwlbearSdkMock = vi.hoisted(() => vi.fn())

vi.mock("@/features/dice-roller/dice-api", () => ({
    setDiceOverride: (...args: unknown[]) => setDiceOverrideMock(...args),
    clearScopedDiceOverride: (...args: unknown[]) => clearScopedDiceOverrideMock(...args),
    listScopedDiceOverrides: (...args: unknown[]) => listScopedDiceOverridesMock(...args),
}))

vi.mock("@/features/owlbear/sdk", () => ({
    loadOwlbearSdk: () => loadOwlbearSdkMock(),
}))

function HookHarness() {
    const { currentPlayerId, currentPlayerName, owlbearRoomId } = useDiceResultConsoleApi()
    return (
        <div
            data-testid="dice-result-hook"
            data-player-id={currentPlayerId ?? ""}
            data-player-name={currentPlayerName ?? ""}
            data-room-id={owlbearRoomId ?? ""}
        />
    )
}

describe("useDiceResultConsoleApi", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, "info").mockImplementation(() => undefined)
        vi.spyOn(console, "table").mockImplementation(() => undefined)
        vi.spyOn(console, "error").mockImplementation(() => undefined)
        setDiceOverrideMock.mockResolvedValue(null)
        clearScopedDiceOverrideMock.mockResolvedValue({ deletedCount: 0 })
        listScopedDiceOverridesMock.mockResolvedValue([])
        getPartyPlayersMock.mockResolvedValue([
            { id: "player-kael", name: "Kael", role: "PLAYER" },
            { id: "player-nando", name: "Nando", role: "GM" },
        ])
        loadOwlbearSdkMock.mockResolvedValue({
            isAvailable: true,
            isReady: true,
            room: { id: "room-1" },
            player: {
                getId: vi.fn().mockResolvedValue("player-kael"),
                getName: vi.fn().mockResolvedValue("Kael"),
                getRole: vi.fn().mockResolvedValue("PLAYER"),
            },
            party: {
                getPlayers: getPartyPlayersMock,
            },
        })
    })

    afterEach(() => {
        delete window.diceResult
        window.history.replaceState({}, "", "/")
        vi.restoreAllMocks()
    })

    it("registers the local API without loading Owlbear SDK on the normal site", async () => {
        render(<HookHarness />)

        await waitFor(() => {
            expect(window.diceResult).toBeDefined()
        })

        await window.diceResult!.exact("d20", 12)

        expect(loadOwlbearSdkMock).not.toHaveBeenCalled()
        expect(setDiceOverrideMock).toHaveBeenCalledWith({
            action: "exact",
            dice: "d20",
            value: 12,
        })
    })

    it("supports player-id overrides inside Owlbear and loads the party mapping", async () => {
        window.history.replaceState({}, "", "/owlbear/action")
        render(<HookHarness />)

        await waitFor(() => {
            expect(window.diceResult).toBeDefined()
            expect(document.querySelector("[data-testid='dice-result-hook']")?.getAttribute("data-player-id")).toBe("player-kael")
            expect(document.querySelector("[data-testid='dice-result-hook']")?.getAttribute("data-room-id")).toBe("room-1")
        })

        await window.diceResult!.min("player-nando", "d20", 20)

        expect(setDiceOverrideMock).toHaveBeenCalledWith({
            action: "min",
            dice: "d20",
            value: 20,
            owlbearPlayerId: "player-nando",
        })
        expect(getPartyPlayersMock).toHaveBeenCalledTimes(1)
    })

    it("includes the current Owlbear player in the player-id mapping when party players omit them", async () => {
        window.history.replaceState({}, "", "/owlbear/action")
        getPartyPlayersMock.mockResolvedValue([
            { id: "player-nando", name: "Nando", role: "GM" },
        ])

        render(<HookHarness />)

        await waitFor(() => {
            expect(console.table).toHaveBeenCalledWith([
                { id: "player-kael", name: "Kael", role: "PLAYER" },
                { id: "player-nando", name: "Nando", role: "GM" },
            ])
        })
        expect(console.info).toHaveBeenCalledWith("[Owlbear] playerId mapping")
        expect(console.error).not.toHaveBeenCalled()
    })

    it("deduplicates the current Owlbear player in the player-id mapping", async () => {
        window.history.replaceState({}, "", "/owlbear/action")
        getPartyPlayersMock.mockResolvedValue([
            { id: "player-kael", name: "Kael From Party", role: "GM" },
            { id: "player-nando", name: "Nando", role: "GM" },
        ])

        render(<HookHarness />)

        await waitFor(() => {
            expect(console.table).toHaveBeenCalledWith([
                { id: "player-kael", name: "Kael", role: "PLAYER" },
                { id: "player-nando", name: "Nando", role: "GM" },
            ])
        })
    })

    it("targets the current Owlbear player for the legacy two-argument signature", async () => {
        window.history.replaceState({}, "", "/owlbear/action")
        render(<HookHarness />)

        await waitFor(() => {
            expect(window.diceResult).toBeDefined()
            expect(document.querySelector("[data-testid='dice-result-hook']")?.getAttribute("data-player-name")).toBe("Kael")
        })

        await window.diceResult!.exact("d20", 18)

        expect(setDiceOverrideMock).toHaveBeenCalledWith({
            action: "exact",
            dice: "d20",
            value: 18,
            owlbearPlayerId: "player-kael",
        })
    })
})
