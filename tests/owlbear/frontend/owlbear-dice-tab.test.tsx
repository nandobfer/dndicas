import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { OwlbearDiceTab } from "@/features/owlbear/owlbear-dice-tab"
import type { DiceRollResponse } from "@/features/dice-roller/types"
import type { OwlbearDiceHistoryEntry, OwlbearRuntimeState } from "@/features/owlbear/types"

interface HistoryEntryOverrides {
    id?: string
    playerName?: string
    playerId?: string
    playerRole?: "GM" | "PLAYER"
    characterName?: string
    status?: OwlbearDiceHistoryEntry["status"]
    createdAt?: string
    result?: Partial<DiceRollResponse>
}

const owlbearDiceHistoryMock = vi.hoisted(() => ({
    history: [] as OwlbearDiceHistoryEntry[],
    appendHistoryEntry: vi.fn(),
}))
const owlbearSdkMock = vi.hoisted(() => ({
    fetchOwlbearSheetById: vi.fn(),
    getRoomMetadataState: vi.fn(),
}))
const currentPlayerMock = vi.hoisted(() => ({
    currentPlayerId: "player-kael" as string | null,
    currentPlayerName: "Kael" as string | null,
    owlbearRoomId: "room-1" as string | null,
}))

const rollResult = {
    rollId: "roll-local",
    terms: [{ dice: "d20", quantity: 1, results: [14] }],
    mode: "normal",
    selectedD20: { kept: 14, reason: "normal" },
    diceTotal: 14,
    modifier: 0,
    total: 14,
    createdAt: "2026-01-01T00:00:00.000Z",
} as DiceRollResponse

vi.mock("@/features/dice-roller/components/dice-roller-panel", () => ({
    DiceRollerPanel: ({
        onRollAnimationStarted,
        onRollResolved,
    }: {
        onRollAnimationStarted?: (result: DiceRollResponse) => void
        onRollResolved?: (result: DiceRollResponse) => void
    }) => (
        <button
            type="button"
            data-testid="dice-roller-panel"
            onClick={() => {
                onRollAnimationStarted?.(rollResult)
                onRollResolved?.(rollResult)
            }}
        >
            Dice Roller Panel
        </button>
    ),
}))

vi.mock("@/features/dice-roller/hooks/use-dice-result-console-api", () => ({
    useDiceResultConsoleApi: () => currentPlayerMock,
}))

vi.mock("@/features/owlbear/sdk", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/features/owlbear/sdk")>()
    return {
        ...actual,
        fetchOwlbearSheetById: owlbearSdkMock.fetchOwlbearSheetById,
        getRoomMetadataState: owlbearSdkMock.getRoomMetadataState,
    }
})

vi.mock("@/features/owlbear/hooks/use-owlbear-dice-history", () => ({
    useOwlbearDiceHistory: () => ({
        history: owlbearDiceHistoryMock.history,
        isLoading: false,
        errorMessage: null,
        appendHistoryEntry: owlbearDiceHistoryMock.appendHistoryEntry,
    }),
}))

function createHistoryEntry(overrides: HistoryEntryOverrides = {}): OwlbearDiceHistoryEntry {
    const result = {
        rollId: overrides.id ?? "roll-1",
        terms: [{ dice: "d20", quantity: 1, results: [20] }],
        mode: "advantage",
        selectedD20: { kept: 20, discarded: 5, reason: "advantage" },
        diceTotal: 20,
        modifier: 2,
        total: 22,
        createdAt: "2026-01-01T00:00:00.000Z",
        ...(overrides.result ?? {}),
    } as DiceRollResponse

    return {
        id: overrides.id ?? result.rollId,
        playerName: overrides.playerName ?? "Nando",
        playerId: overrides.playerId,
        playerRole: overrides.playerRole,
        characterName: overrides.characterName,
        status: overrides.status ?? "resolved",
        createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
        result,
    }
}

function renderDiceTab(runtimeOverrides: Partial<OwlbearRuntimeState> = {}) {
    render(
        <OwlbearDiceTab
            runtime={{
                status: "ready",
                role: "PLAYER",
                roomId: "room-1",
                playerId: "player-1",
                themeMode: "dark",
                sceneReady: true,
                ...runtimeOverrides,
            }}
            session={{
                sessionStatus: "ready",
                sessionToken: "token-1",
                sessionExpiresAt: "2099-01-01T00:00:00.000Z",
                isAuthenticated: true,
            }}
        />
    )
}

describe("OwlbearDiceTab", () => {
    beforeEach(() => {
        owlbearDiceHistoryMock.history = [createHistoryEntry()]
        owlbearDiceHistoryMock.appendHistoryEntry.mockReset()
        owlbearSdkMock.fetchOwlbearSheetById.mockReset()
        owlbearSdkMock.getRoomMetadataState.mockReset()
        owlbearSdkMock.getRoomMetadataState.mockResolvedValue({
            version: 1,
            playerLinks: {},
            diceHistory: [],
        })
        owlbearSdkMock.fetchOwlbearSheetById.mockResolvedValue({ _id: "sheet-1", name: "Kael Thorne" })
        currentPlayerMock.currentPlayerId = "player-kael"
        currentPlayerMock.currentPlayerName = "Kael"
        currentPlayerMock.owlbearRoomId = "room-1"
    })

    it("renders the shared history alongside the embedded roller without the old header", () => {
        renderDiceTab()

        expect(screen.queryByText("Dados da sala")).not.toBeInTheDocument()
        expect(screen.queryByText(
            "Todos na sala veem a mesma rolagem em tempo real e compartilham o mesmo histórico recente."
        )).not.toBeInTheDocument()
        expect(screen.queryByText(/realizou a última rolagem compartilhada/i)).not.toBeInTheDocument()
        expect(screen.getByTestId("dice-roller-panel")).toBeInTheDocument()
        expect(screen.getByText("Nando")).toBeInTheDocument()
        expect(screen.getByText("HISTÓRICO")).toBeInTheDocument()
        expect(screen.queryByText("Histórico compartilhado")).not.toBeInTheDocument()
        expect(screen.queryByText("Mantém as 50 rolagens mais recentes da sala em cache no Owlbear."))
            .not.toBeInTheDocument()
        expect(screen.getByText("22")).toBeInTheDocument()
    })

    it("omits the normal mode label from standard history entries", () => {
        owlbearDiceHistoryMock.history = [
            createHistoryEntry({
                result: {
                    mode: "normal",
                    selectedD20: undefined,
                    terms: [{ dice: "d20", quantity: 1, results: [12] }],
                    diceTotal: 12,
                    modifier: 0,
                    total: 12,
                },
            }),
        ]

        renderDiceTab()

        expect(screen.queryByText("Normal")).not.toBeInTheDocument()
        expect(screen.queryByText("Vantagem")).not.toBeInTheDocument()
        expect(screen.queryByText("Desvantagem")).not.toBeInTheDocument()
    })

    it("keeps advantage and disadvantage labels visible when the roll mode requires it", () => {
        owlbearDiceHistoryMock.history = [
            createHistoryEntry({
                id: "roll-advantage",
                result: { mode: "advantage", selectedD20: { kept: 18, discarded: 4, reason: "advantage" } },
            }),
            createHistoryEntry({
                id: "roll-disadvantage",
                result: { mode: "disadvantage", selectedD20: { kept: 4, discarded: 18, reason: "disadvantage" } },
            }),
        ]

        renderDiceTab()

        expect(screen.getByText(/Vantagem/)).toBeInTheDocument()
        expect(screen.getByText(/Desvantagem/)).toBeInTheDocument()
        expect(screen.queryByText("Normal")).not.toBeInTheDocument()
    })

    it("renders the formula chip beside the player name", () => {
        renderDiceTab()

        const playerFormulaRow = screen.getByTestId("history-player-formula-row")

        expect(within(playerFormulaRow).getByText("Nando")).toBeInTheDocument()
        expect(within(playerFormulaRow).getByTestId("history-formula-chip")).toHaveTextContent("1d20+2")
    })

    it("renders rolling history entries with the same card and a loading result", () => {
        owlbearDiceHistoryMock.history = [createHistoryEntry({ status: "rolling" })]

        renderDiceTab()

        expect(screen.getByText("Nando")).toBeInTheDocument()
        expect(screen.getByTestId("history-formula-chip")).toHaveTextContent("1d20+2")
        expect(screen.getByLabelText("Resultado rolando")).toBeInTheDocument()
        expect(screen.getByText("1d20: rolando...")).toBeInTheDocument()
        expect(screen.queryByText("22")).not.toBeInTheDocument()
    })

    it("renders the linked character name instead of the Owlbear player name", () => {
        owlbearDiceHistoryMock.history = [
            createHistoryEntry({
                playerName: "Nando",
                characterName: "Sir Nandor",
            }),
        ]

        renderDiceTab()

        expect(screen.getByText("Sir Nandor")).toBeInTheDocument()
        expect(screen.queryByText("Nando")).not.toBeInTheDocument()
    })

    it("renders GM rolls as MESTRE with highlight", () => {
        owlbearDiceHistoryMock.history = [
            createHistoryEntry({
                playerName: "GM",
                playerRole: "GM",
            }),
        ]

        renderDiceTab({ role: "GM" })

        expect(screen.getByTestId("history-gm-display-name")).toHaveTextContent("MESTRE")
        expect(screen.getByTestId("history-gm-display-name")).toHaveClass("text-amber-200", "uppercase")
        expect(screen.queryByText("GM")).not.toBeInTheDocument()
    })

    it("stores the linked character name when appending a player roll", async () => {
        owlbearSdkMock.getRoomMetadataState.mockResolvedValue({
            version: 1,
            playerLinks: { "player-kael": "sheet-1" },
            diceHistory: [],
        })

        renderDiceTab()

        fireEvent.click(screen.getByTestId("dice-roller-panel"))

        await waitFor(() => {
            expect(owlbearDiceHistoryMock.appendHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({
                id: "roll-local",
                playerName: "Kael",
                playerId: "player-kael",
                playerRole: "PLAYER",
                characterName: "Kael Thorne",
                status: "rolling",
            }))
        })
        expect(owlbearSdkMock.fetchOwlbearSheetById).toHaveBeenCalledWith("sheet-1", "token-1")
    })

    it("falls back to the player name when appending a roll without a linked sheet", async () => {
        renderDiceTab()

        fireEvent.click(screen.getByTestId("dice-roller-panel"))

        await waitFor(() => {
            expect(owlbearDiceHistoryMock.appendHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({
                id: "roll-local",
                playerName: "Kael",
                playerId: "player-kael",
                playerRole: "PLAYER",
                characterName: undefined,
                status: "rolling",
            }))
        })
        expect(owlbearSdkMock.fetchOwlbearSheetById).not.toHaveBeenCalled()
    })

    it("uses configured dice colors on result chips", () => {
        owlbearDiceHistoryMock.history = [
            createHistoryEntry({
                result: {
                    mode: "normal",
                    selectedD20: undefined,
                    terms: [
                        { dice: "d20", quantity: 1, results: [12] },
                        { dice: "d6", quantity: 2, results: [3, 5] },
                    ],
                    diceTotal: 20,
                    modifier: 0,
                    total: 20,
                },
            }),
        ]

        renderDiceTab()

        expect(screen.getByTestId("history-dice-result-chip-roll-1-d20-0"))
            .toHaveClass("border-gray-400/20", "bg-gray-400/20", "text-gray-400")
        expect(screen.getByTestId("history-dice-result-chip-roll-1-d6-1"))
            .toHaveClass("border-blue-400/20", "bg-blue-400/20", "text-blue-400")
    })
})
