import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DiceRollerPanel } from "@/features/dice-roller/components/dice-roller-panel"
import { DiceRollerProvider } from "@/features/dice-roller/components/dice-roll-context"
import { DiceRollerFab } from "@/features/dice-roller/components/dice-roller-fab"
import { requestDiceRoll } from "@/features/dice-roller/dice-api"
import { colors } from "@/lib/config/colors"

const diceBoxMocks = vi.hoisted(() => ({
    clearDice: vi.fn(),
    constructor: vi.fn(),
    dicePositions: [] as Array<{ x: number, y: number, z: number }>,
    initialize: vi.fn(),
    render: vi.fn(),
    roll: vi.fn(),
    simulateThrow: vi.fn(),
    spawnDice: vi.fn(),
    startClickThrow: vi.fn(),
    swapDiceFace: vi.fn(),
}))

vi.mock("@/features/dice-roller/dice-api", () => ({
    requestDiceRoll: vi.fn(),
}))

const requestDiceRollMock = vi.mocked(requestDiceRoll)

describe("DiceRollerPanel", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        diceBoxMocks.dicePositions.length = 0
        diceBoxMocks.initialize.mockResolvedValue(undefined)
        diceBoxMocks.roll.mockResolvedValue([])
        diceBoxMocks.startClickThrow.mockImplementation((notation: string) => {
            const values = notation.split("@")[1]?.split(/[!,]/).map((value) => Number(value)).filter(Number.isFinite) ?? []
            return {
                vectors: values.map((value) => ({ value })),
                result: values,
            }
        })
        globalThis.__DNDICAS_DICE_BOX_LOADER__ = async () => class MockDiceBox {
            diceList: Array<{
                body: {
                    angularVelocity: { set: (x: number, y: number, z: number) => void }
                    position: { copy: (position: { x?: number, y?: number, z?: number }) => void }
                    sleepState?: number
                    type?: number
                    velocity: { set: (x: number, y: number, z: number) => void }
                }
                getLastValue: () => { value: number }
                position: { x: number, y: number, z: number, set: (x: number, y: number, z: number) => void }
            }> = []
            display = { containerWidth: 160, containerHeight: 120, scale: 10 }
            renderer = { render: diceBoxMocks.render }
            scene = {}
            camera = {}

            constructor(container: string, config?: Record<string, unknown>) {
                diceBoxMocks.constructor(container, config)
            }

            clearDice = diceBoxMocks.clearDice
            initialize = diceBoxMocks.initialize
            roll = diceBoxMocks.roll
            simulateThrow = diceBoxMocks.simulateThrow
            startClickThrow = diceBoxMocks.startClickThrow
            swapDiceFace = diceBoxMocks.swapDiceFace
            spawnDice = (vector: unknown) => {
                diceBoxMocks.spawnDice(vector)
                const position = {
                    x: 0,
                    y: 0,
                    z: 0,
                    set: (x: number, y: number, z: number) => {
                        position.x = x
                        position.y = y
                        position.z = z
                        diceBoxMocks.dicePositions.push({ x, y, z })
                    },
                }
                this.diceList.push({
                    body: {
                        angularVelocity: { set: vi.fn() },
                        position: {
                            copy: (nextPosition) => {
                                position.x = nextPosition.x ?? position.x
                                position.y = nextPosition.y ?? position.y
                                position.z = nextPosition.z ?? position.z
                            },
                        },
                        velocity: { set: vi.fn() },
                    },
                    getLastValue: () => ({ value: 0 }),
                    position,
                })
            }
        } as never
        requestDiceRollMock.mockResolvedValue({
            rollId: "roll-1",
            label: "Rolagem manual",
            terms: [{ dice: "d20", quantity: 1, results: [14] }],
            mode: "normal",
            selectedD20: { kept: 14, reason: "normal" },
            diceTotal: 14,
            modifier: 2,
            total: 16,
            createdAt: "2026-01-01T00:00:00.000Z",
        })
    })

    afterEach(() => {
        globalThis.__DNDICAS_DICE_BOX_LOADER__ = undefined
    })

    it("renders the manual roller and submits a roll", async () => {
        render(<DiceRollerPanel />)

        expect(screen.queryByText("Dice Roller")).not.toBeInTheDocument()
        expect(screen.queryByText("Rolagem manual")).not.toBeInTheDocument()
        expect(screen.queryByText("Resultado gerado pelo servidor. Overrides ocultos afetam só o valor bruto do dado.")).not.toBeInTheDocument()
        expect(screen.queryByText("Nome da rolagem")).not.toBeInTheDocument()
        expect(screen.queryByText("Fórmula")).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: "d20" })).toBeInTheDocument()
        expect(screen.getAllByTestId("dice-visual-die")).toHaveLength(1)
        expect(screen.queryByText("preparando dados")).not.toBeInTheDocument()
        expect(screen.getByTestId("dice-loading-ellipsis")).toBeInTheDocument()

        await waitFor(() => {
            expect(diceBoxMocks.constructor).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    baseScale: 67,
                    theme_customColorset: expect.objectContaining({ texture: "stainedglass" }),
                })
            )
        })
        await waitFor(() => {
            expect(diceBoxMocks.startClickThrow).toHaveBeenCalledWith("1d20@20")
            expect(diceBoxMocks.spawnDice).toHaveBeenCalledTimes(1)
            expect(diceBoxMocks.simulateThrow).toHaveBeenCalled()
            expect(diceBoxMocks.render).toHaveBeenCalled()
            expect(diceBoxMocks.roll).not.toHaveBeenCalled()
        })

        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(screen.getByText("16")).toBeInTheDocument()
        })
        await waitFor(() => {
            expect(diceBoxMocks.roll).toHaveBeenCalledWith("1d20@14!!")
        })
    })

    it("renders one visual die per selected die", async () => {
        render(
            <DiceRollerPanel
                preset={{
                    label: "Dano",
                    terms: [
                        { dice: "d6", quantity: 2 },
                        { dice: "d4", quantity: 1 },
                    ],
                    source: "sheet",
                }}
            />
        )

        expect(screen.getAllByTestId("dice-visual-die")).toHaveLength(3)
        expect(screen.getAllByTestId("dice-visual-die").map((node) => node.getAttribute("data-dice"))).toEqual(["d6", "d6", "d4"])
        expect(screen.getAllByTestId("dice-visual-die").map((node) => node.getAttribute("data-value"))).toEqual(["6", "6", "4"])
        await waitFor(() => {
            expect(diceBoxMocks.constructor).toHaveBeenCalled()
        })
        expect(diceBoxMocks.startClickThrow).toHaveBeenCalledWith("1d6+1d6+1d4@6,6,4")
        expect(new Set(diceBoxMocks.dicePositions.map((position) => position.x)).size).toBeGreaterThan(1)
        expect(diceBoxMocks.roll).not.toHaveBeenCalled()
    })

    it("wraps standby dice into additional rows when the selection is wide", async () => {
        render(
            <DiceRollerPanel
                preset={{
                    label: "Muitos dados",
                    terms: [
                        { dice: "d6", quantity: 4 },
                        { dice: "d4", quantity: 3 },
                    ],
                    source: "manual",
                }}
            />
        )

        await waitFor(() => {
            expect(diceBoxMocks.startClickThrow).toHaveBeenCalledWith("1d6+1d6+1d6+1d6+1d4+1d4+1d4@6,6,6,6,4,4,4")
        })
        expect(diceBoxMocks.dicePositions).toHaveLength(7)
        expect(new Set(diceBoxMocks.dicePositions.map((position) => position.y)).size).toBeGreaterThan(1)
    })

    it("renders the 3D stage with D&D dice types", () => {
        render(
            <DiceRollerPanel
                preset={{
                    label: "Shapes",
                    terms: [
                        { dice: "d4", quantity: 1 },
                        { dice: "d6", quantity: 1 },
                        { dice: "d8", quantity: 1 },
                        { dice: "d10", quantity: 1 },
                        { dice: "d12", quantity: 1 },
                        { dice: "d20", quantity: 1 },
                        { dice: "d100", quantity: 1 },
                    ],
                    source: "manual",
                }}
            />
        )

        expect(screen.getByTestId("dice-box-canvas-stage")).toBeInTheDocument()
        expect(screen.getAllByTestId("dice-visual-die").map((node) => node.getAttribute("data-dice"))).toEqual([
            "d4",
            "d6",
            "d8",
            "d10",
            "d12",
            "d20",
            "d10",
            "d10",
        ])
    })

    it("renders d100 as two visual d10 dice", () => {
        render(<DiceRollerPanel />)

        const d100Button = screen.getByRole("button", { name: "d100" })
        expect(d100Button).toBeInTheDocument()
        expect(d100Button).toHaveStyle({ color: colors.rarity.divine })

        fireEvent.click(d100Button)

        const d100Dice = screen.getAllByTestId("dice-visual-die").filter((node) => node.getAttribute("data-source-dice") === "d100")
        expect(d100Dice).toHaveLength(2)
        expect(d100Dice.map((node) => node.getAttribute("data-dice"))).toEqual(["d10", "d10"])
    })

    it("rolls d100 in the 3D stage as two predetermined d10 dice", async () => {
        requestDiceRollMock.mockResolvedValueOnce({
            rollId: "roll-d100",
            label: "Rolagem manual",
            terms: [{ dice: "d100", quantity: 1, results: [88] }],
            mode: "normal",
            diceTotal: 88,
            modifier: 0,
            total: 88,
            createdAt: "2026-01-01T00:00:00.000Z",
        })

        render(
            <DiceRollerPanel
                preset={{
                    label: "Percentil",
                    terms: [{ dice: "d100", quantity: 1 }],
                    source: "manual",
                }}
            />
        )

        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(screen.getAllByText("88").length).toBeGreaterThan(0)
        })
        await waitFor(() => {
            expect(diceBoxMocks.roll).toHaveBeenCalledWith("1d10+1d10@8,8!!")
        })

        const d100Dice = screen.getAllByTestId("dice-visual-die").filter((node) => node.getAttribute("data-source-dice") === "d100")
        expect(d100Dice).toHaveLength(2)
        expect(d100Dice.map((node) => node.getAttribute("data-value"))).toEqual(["8", "8"])
    })

    it("keeps the numeric result visible when the 3D stage cannot initialize", async () => {
        diceBoxMocks.initialize.mockRejectedValueOnce(new Error("WebGL unavailable"))

        render(<DiceRollerPanel />)

        await waitFor(() => {
            expect(screen.getByText("Visual 3D indisponível neste navegador.")).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(screen.getByText("16")).toBeInTheDocument()
        })
    })

    it("renders two d20s in the stage for advantage and disadvantage", async () => {
        render(<DiceRollerPanel />)

        fireEvent.click(screen.getByRole("button", { name: "Vantagem" }))

        await waitFor(() => {
            const d20Dice = screen.getAllByTestId("dice-visual-die").filter((node) => node.getAttribute("data-dice") === "d20")
            expect(d20Dice).toHaveLength(2)
            expect(d20Dice.map((node) => node.getAttribute("data-roll-role"))).toEqual(["kept", "discarded"])
        })
        await waitFor(() => {
            expect(diceBoxMocks.startClickThrow).toHaveBeenCalledWith("1d20+1d20@20,20")
        })
        expect(new Set(diceBoxMocks.dicePositions.slice(-2).map((position) => position.x)).size).toBe(2)

        fireEvent.click(screen.getByRole("button", { name: "Desvantagem" }))

        await waitFor(() => {
            const d20Dice = screen.getAllByTestId("dice-visual-die").filter((node) => node.getAttribute("data-dice") === "d20")
            expect(d20Dice).toHaveLength(2)
            expect(d20Dice.map((node) => node.getAttribute("data-roll-role"))).toEqual(["kept", "discarded"])
        })
    })

    it("renders kept and discarded d20 results after an advantage roll", async () => {
        requestDiceRollMock.mockResolvedValueOnce({
            rollId: "roll-adv",
            label: "Rolagem manual",
            terms: [{ dice: "d20", quantity: 1, results: [18] }],
            mode: "advantage",
            selectedD20: { kept: 18, discarded: 7, reason: "advantage" },
            diceTotal: 18,
            modifier: 2,
            total: 20,
            createdAt: "2026-01-01T00:00:00.000Z",
        })

        render(<DiceRollerPanel />)

        fireEvent.click(screen.getByRole("button", { name: "Vantagem" }))
        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(screen.getByText("20")).toBeInTheDocument()
        })

        const d20Dice = screen.getAllByTestId("dice-visual-die").filter((node) => node.getAttribute("data-dice") === "d20")
        expect(d20Dice).toHaveLength(2)
        expect(d20Dice.map((node) => node.getAttribute("data-roll-role"))).toEqual(["kept", "discarded"])
        await waitFor(() => {
            expect(diceBoxMocks.roll).toHaveBeenCalledWith("1d20+1d20@18,7!!")
        })

        await waitFor(() => {
            expect(screen.getAllByText("18").length).toBeGreaterThan(0)
            expect(d20Dice.map((node) => node.getAttribute("data-value"))).toEqual(["18", "7"])
        })
    })

    it("highlights critical success and keeps it active until returning to standby", async () => {
        requestDiceRollMock.mockResolvedValueOnce({
            rollId: "roll-crit-success",
            label: "Rolagem manual",
            terms: [{ dice: "d20", quantity: 1, results: [20] }],
            mode: "normal",
            selectedD20: { kept: 20, reason: "normal" },
            diceTotal: 20,
            modifier: 0,
            total: 20,
            createdAt: "2026-01-01T00:00:00.000Z",
        })

        render(<DiceRollerPanel />)

        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(screen.getByTestId("dice-visual-stage")).toHaveAttribute("data-critical-state", "critical-success")
        })
        expect(screen.getByTestId("dice-visual-stage")).toHaveAttribute("data-border-color", colors.rarity.uncommon)
        expect(screen.getByTestId("dice-critical-banner")).toHaveTextContent("Sucesso crítico")
        expect(screen.getByTestId("dice-result-summary")).toHaveAttribute("data-critical-state", "critical-success")
        expect(screen.getByTestId("dice-critical-summary-badge")).toHaveTextContent("Sucesso crítico")

        fireEvent.click(screen.getByRole("button", { name: "d4" }))

        expect(screen.getByTestId("dice-visual-stage")).toHaveAttribute("data-critical-state", "none")
        expect(screen.queryByTestId("dice-critical-banner")).not.toBeInTheDocument()
        expect(screen.queryByTestId("dice-result-summary")).not.toBeInTheDocument()
    })

    it("treats only the kept die as critical during disadvantage", async () => {
        requestDiceRollMock.mockResolvedValueOnce({
            rollId: "roll-crit-failure",
            label: "Rolagem manual",
            terms: [{ dice: "d20", quantity: 1, results: [1] }],
            mode: "disadvantage",
            selectedD20: { kept: 1, discarded: 20, reason: "disadvantage" },
            diceTotal: 1,
            modifier: 0,
            total: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
        })

        render(<DiceRollerPanel />)

        fireEvent.click(screen.getByRole("button", { name: "Desvantagem" }))
        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(screen.getByTestId("dice-visual-stage")).toHaveAttribute("data-critical-state", "critical-failure")
        })
        expect(screen.getByTestId("dice-visual-stage")).toHaveAttribute("data-border-color", colors.rarity.artifact)
        expect(screen.getByTestId("dice-critical-banner")).toHaveTextContent("Falha crítica")
        expect(screen.getByTestId("dice-critical-summary-badge")).toHaveTextContent("Falha crítica")
    })

    it("clears the result and resets the visual stage when the combination changes", async () => {
        render(<DiceRollerPanel />)

        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(screen.getByText("16")).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole("button", { name: "d4" }))

        expect(screen.queryByText("16")).not.toBeInTheDocument()
        expect(screen.getAllByTestId("dice-visual-die").map((node) => node.getAttribute("data-dice"))).toEqual(["d20", "d4"])
        expect(diceBoxMocks.startClickThrow).toHaveBeenCalledWith("1d20+1d4@20,4")
        expect(diceBoxMocks.clearDice).toHaveBeenCalled()
        expect(diceBoxMocks.roll).toHaveBeenCalledTimes(1)
    })

    it("clears the result when the modifier changes", async () => {
        render(<DiceRollerPanel />)

        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(screen.getByText("16")).toBeInTheDocument()
        })

        const modifierInput = screen.getByRole("spinbutton")
        fireEvent.change(modifierInput, { target: { value: "3" } })
        fireEvent.blur(modifierInput)

        expect(screen.queryByText("16")).not.toBeInTheDocument()
    })

    it("does not mark mixed rolls as critical even when a d20 shows 20", async () => {
        requestDiceRollMock.mockResolvedValueOnce({
            rollId: "roll-mixed",
            label: "Rolagem manual",
            terms: [
                { dice: "d20", quantity: 1, results: [20] },
                { dice: "d4", quantity: 1, results: [4] },
            ],
            mode: "normal",
            diceTotal: 24,
            modifier: 0,
            total: 24,
            createdAt: "2026-01-01T00:00:00.000Z",
        })

        render(<DiceRollerPanel />)

        fireEvent.click(screen.getByRole("button", { name: "d4" }))
        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(screen.getByTestId("dice-result-summary")).toBeInTheDocument()
        })
        expect(screen.getByTestId("dice-visual-stage")).toHaveAttribute("data-critical-state", "none")
        expect(screen.getByTestId("dice-result-summary")).toHaveAttribute("data-critical-state", "none")
        expect(screen.queryByTestId("dice-critical-banner")).not.toBeInTheDocument()
        expect(screen.queryByTestId("dice-critical-summary-badge")).not.toBeInTheDocument()
    })

    it("colors the visual stage by roll mode", async () => {
        render(<DiceRollerPanel />)

        const stage = screen.getByTestId("dice-visual-stage")
        expect(stage).toHaveAttribute("data-mode", "normal")
        expect(stage).toHaveAttribute("data-border-color", colors.rarity.rare)

        fireEvent.click(screen.getByRole("button", { name: "Vantagem" }))

        await waitFor(() => {
            expect(stage).toHaveAttribute("data-mode", "advantage")
            expect(stage).toHaveAttribute("data-border-color", colors.rarity.uncommon)
        })

        fireEvent.click(screen.getByRole("button", { name: "Desvantagem" }))

        await waitFor(() => {
            expect(stage).toHaveAttribute("data-mode", "disadvantage")
            expect(stage).toHaveAttribute("data-border-color", colors.rarity.artifact)
        })
    })

    it("only shows d20 roll mode for exactly 1d20 and sends normal mode otherwise", async () => {
        render(<DiceRollerPanel />)

        expect(screen.getByRole("button", { name: "Vantagem" })).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "d4" }))

        expect(screen.queryByRole("button", { name: "Vantagem" })).not.toBeInTheDocument()
        expect(screen.queryByText("Vantagem/desvantagem afeta o primeiro d20 da rolagem.")).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        await waitFor(() => {
            expect(requestDiceRoll).toHaveBeenCalledWith(expect.objectContaining({ mode: "normal" }))
        })
    })

    it("locks dice controls while advantage or disadvantage is selected", async () => {
        render(<DiceRollerPanel />)

        fireEvent.click(screen.getByRole("button", { name: "Vantagem" }))

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "d4" })).toBeDisabled()
            expect(screen.getByRole("button", { name: "Adicionar d20" })).toBeDisabled()
            expect(screen.getByRole("button", { name: "Remover d20" })).toBeDisabled()
        })

        fireEvent.click(screen.getByRole("button", { name: "Padrão" }))

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "d4" })).not.toBeDisabled()
            expect(screen.getByRole("button", { name: "Adicionar d20" })).not.toBeDisabled()
            expect(screen.getByRole("button", { name: "Remover d20" })).not.toBeDisabled()
        })
    })

    it("clears the roller without restoring the default d20", () => {
        render(<DiceRollerPanel />)

        fireEvent.click(screen.getByRole("button", { name: "limpar" }))

        expect(screen.queryAllByTestId("dice-visual-die")).toHaveLength(0)
        expect(screen.queryByText("1d20")).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "Rolar dados" }))

        expect(screen.getByText("Adicione pelo menos um dado.")).toBeInTheDocument()
    })

    it("renders the dice fab as icon only", () => {
        render(
            <DiceRollerProvider>
                <DiceRollerFab />
            </DiceRollerProvider>
        )

        expect(screen.getByLabelText("Abrir rolagem de dados")).toBeInTheDocument()
        expect(screen.queryByText("Dados")).not.toBeInTheDocument()
    })
})
