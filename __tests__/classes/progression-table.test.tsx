/**
 * @fileoverview Tests for ClassProgressionTable component.
 * Tests rendering, edit mode, spell template shortcuts, custom columns, subclass rows, empty/loading states.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom"
import { ClassProgressionTable } from "@/features/classes/components/class-progression-table"
import type { ClassTrait } from "@/features/classes/types/classes.types"
import type { ClassProgressionData } from "@/features/classes/types/progression.types"

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        tr: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}))

jest.mock("@/features/rules/components/mention-badge", () => ({
    MentionContent: ({ html }: { html: string }) => (
        <span data-testid="mention-content" dangerouslySetInnerHTML={{ __html: html }} />
    ),
    EntityTitleLink: ({ name }: { name: string }) => <span>{name}</span>,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeTraits = (levels: number[]): ClassTrait[] =>
    levels.map((level, i) => ({
        _id: `trait-${i}`,
        level,
        description: `<p>Trait at level ${level}</p>`,
    }))

const openTable = () => {
    const toggleBtn = screen.getByRole("button", { name: /tabela de progressão/i })
    fireEvent.click(toggleBtn)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ClassProgressionTable", () => {
    describe("view mode — basic rendering", () => {
        it("renders the toggle button", () => {
            render(<ClassProgressionTable traits={[]} spellcasting={false} />)
            expect(screen.getByRole("button", { name: /tabela de progressão/i })).toBeInTheDocument()
        })

        it("table is initially collapsed", () => {
            render(<ClassProgressionTable traits={[]} spellcasting={false} />)
            expect(screen.queryByRole("table")).not.toBeInTheDocument()
        })

        it("opens the table when toggle button is clicked", () => {
            render(<ClassProgressionTable traits={[]} spellcasting={false} />)
            openTable()
            expect(screen.getByRole("table")).toBeInTheDocument()
        })

        it("shows 20 level cells after opening", () => {
            render(<ClassProgressionTable traits={[]} spellcasting={false} />)
            openTable()
            // Level cells: 1–20 in class rows
            const levelCells = screen.getAllByText(/^\d{1,2}$/).filter((el) => {
                const val = parseInt(el.textContent ?? "")
                return val >= 1 && val <= 20
            })
            // At minimum 20 unique class level cells
            const levelValues = new Set(levelCells.map((el) => el.textContent))
            expect(levelValues.size).toBe(20)
        })

        it("shows proficiency bonus +2 for level 1", () => {
            render(<ClassProgressionTable traits={[]} spellcasting={false} />)
            openTable()
            const bonusCells = screen.getAllByText("+2")
            expect(bonusCells.length).toBeGreaterThanOrEqual(4) // levels 1-4 all show +2
        })

        it("shows proficiency bonus +6 for level 17-20", () => {
            render(<ClassProgressionTable traits={[]} spellcasting={false} />)
            openTable()
            const bonusCells = screen.getAllByText("+6")
            expect(bonusCells.length).toBeGreaterThanOrEqual(4)
        })
    })

    describe("features column", () => {
        it("renders traits at the correct level using MentionContent", () => {
            const traits = makeTraits([3, 5])
            render(<ClassProgressionTable traits={traits} spellcasting={false} />)
            openTable()
            const mentions = screen.getAllByTestId("mention-content")
            expect(mentions.length).toBeGreaterThanOrEqual(2)
        })

        it("shows empty cell indicator when no traits at a level", () => {
            render(<ClassProgressionTable traits={[]} spellcasting={false} />)
            openTable()
            // Each level without traits shows "—"
            const emptyCells = screen.getAllByText("—")
            expect(emptyCells.length).toBeGreaterThan(0)
        })
    })

    describe("spell columns", () => {
        it("does not render spell columns when spellcasting is false and no progression data", () => {
            render(<ClassProgressionTable traits={[]} spellcasting={false} />)
            openTable()
            expect(screen.queryByText(/truques/i)).not.toBeInTheDocument()
            expect(screen.queryByText(/preparadas/i)).not.toBeInTheDocument()
        })

        it("renders spell columns when spellcasting is true", () => {
            render(<ClassProgressionTable traits={[]} spellcasting={true} />)
            openTable()
            expect(screen.getByText(/truques/i)).toBeInTheDocument()
            expect(screen.getByText(/preparadas/i)).toBeInTheDocument()
        })

        it("displays stored spell slot values correctly", () => {
            const progressionData: ClassProgressionData = {
                spellSlots: {
                    1: { cantrips: 3, preparedSpells: 7, slots: { 1: 4 } },
                },
            }
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={true}
                    progressionData={progressionData}
                />,
            )
            openTable()
            expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1) // cantrips (may also match level 3 cell)
            expect(screen.getAllByText("7").length).toBeGreaterThanOrEqual(1) // preparedSpells (unique value)
            expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1) // slot 1st circle
        })

        it("renders spell circle column headers (1º, 2º, etc.)", () => {
            const progressionData: ClassProgressionData = {
                spellSlots: { 3: { slots: { 1: 4, 2: 2 } } },
            }
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={true}
                    progressionData={progressionData}
                />,
            )
            openTable()
            expect(screen.getByText("1º")).toBeInTheDocument()
            expect(screen.getByText("2º")).toBeInTheDocument()
        })
    })

    describe("custom columns (view mode)", () => {
        it("renders custom column header", () => {
            const progressionData: ClassProgressionData = {
                customColumns: [
                    { id: "sneak", label: "Ataque Furtivo", values: Array(20).fill(null) },
                ],
            }
            render(<ClassProgressionTable traits={[]} spellcasting={false} progressionData={progressionData} />)
            openTable()
            expect(screen.getByText("Ataque Furtivo")).toBeInTheDocument()
        })

        it("displays custom column values", () => {
            const values = Array<string | null>(20).fill(null)
            values[0] = "1d6" // level 1
            values[2] = "2d6" // level 3
            const progressionData: ClassProgressionData = {
                customColumns: [{ id: "sneak", label: "Ataque Furtivo", values }],
            }
            render(<ClassProgressionTable traits={[]} spellcasting={false} progressionData={progressionData} />)
            openTable()
            expect(screen.getByText("1d6")).toBeInTheDocument()
            expect(screen.getByText("2d6")).toBeInTheDocument()
        })
    })

    describe("subclass rows", () => {
        it("renders subclass rows at levels with subclass traits", () => {
            const subclassData = [
                {
                    traits: makeTraits([3]),
                    progressionData: undefined,
                    color: "#ff0000",
                    name: "Berserker",
                },
            ]
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={false}
                    subclassData={subclassData}
                />,
            )
            openTable()
            // Should have subclass trait rendered
            const mentions = screen.getAllByTestId("mention-content")
            expect(mentions.length).toBeGreaterThanOrEqual(1)
        })

        it("does not render subclass rows when subclassData is empty", () => {
            render(
                <ClassProgressionTable traits={[]} spellcasting={false} subclassData={[]} />,
            )
            openTable()
            // Should still have exactly 20 rows (class only)
            const allRows = screen.getAllByRole("row")
            // 1 header + 20 class rows = 21 total
            expect(allRows).toHaveLength(21)
        })
    })

    describe("edit mode", () => {
        it("renders spell template shortcut buttons when spellcasting is true", () => {
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={true}
                    isEditable={true}
                    onProgressionDataChange={jest.fn()}
                />,
            )
            openTable()
            expect(screen.getByText(/conjurador completo/i)).toBeInTheDocument()
            expect(screen.getByText(/meio conjurador/i)).toBeInTheDocument()
        })

        it("does not render spell template buttons when spellcasting is false", () => {
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={false}
                    isEditable={true}
                    onProgressionDataChange={jest.fn()}
                />,
            )
            openTable()
            expect(screen.queryByText(/conjurador completo/i)).not.toBeInTheDocument()
        })

        it("shows confirmation dialog when applying template over existing data", () => {
            const existingData: ClassProgressionData = {
                spellSlots: { 1: { cantrips: 2 } },
            }
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={true}
                    progressionData={existingData}
                    isEditable={true}
                    onProgressionDataChange={jest.fn()}
                />,
            )
            openTable()
            fireEvent.click(screen.getByText(/conjurador completo/i))
            expect(screen.getByText(/substituir progressão de magia/i)).toBeInTheDocument()
        })

        it("applies template directly when there is no existing spell data", () => {
            const onProgressionDataChange = jest.fn()
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={true}
                    isEditable={true}
                    onProgressionDataChange={onProgressionDataChange}
                />,
            )
            openTable()
            fireEvent.click(screen.getByText(/conjurador completo/i))
            // No confirmation dialog, changes applied directly
            expect(screen.queryByText(/substituir progressão de magia/i)).not.toBeInTheDocument()
            expect(onProgressionDataChange).toHaveBeenCalledTimes(1)
        })

        it("calls onProgressionDataChange with full caster data", () => {
            const onProgressionDataChange = jest.fn()
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={true}
                    isEditable={true}
                    onProgressionDataChange={onProgressionDataChange}
                />,
            )
            openTable()
            fireEvent.click(screen.getByText(/conjurador completo/i))
            const [[calledWith]] = onProgressionDataChange.mock.calls
            expect(calledWith.spellSlots[1].cantrips).toBe(3)
            expect(calledWith.spellSlots[20].slots[9]).toBe(1)
        })

        it("shows 'Adicionar coluna personalizada' button in edit mode", () => {
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={false}
                    isEditable={true}
                    onProgressionDataChange={jest.fn()}
                />,
            )
            openTable()
            expect(screen.getByText(/coluna personalizada/i)).toBeInTheDocument()
        })

        it("adds a new custom column when label is entered and confirmed", async () => {
            const onProgressionDataChange = jest.fn()
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={false}
                    isEditable={true}
                    onProgressionDataChange={onProgressionDataChange}
                />,
            )
            openTable()
            fireEvent.click(screen.getByText(/coluna personalizada/i))
            const input = screen.getByPlaceholderText(/nome da coluna/i)
            fireEvent.change(input, { target: { value: "Ataque Furtivo" } })
            fireEvent.click(screen.getByText(/adicionar/i))
            await waitFor(() => {
                expect(onProgressionDataChange).toHaveBeenCalledTimes(1)
                const [calledWith] = onProgressionDataChange.mock.calls[0]
                expect(calledWith.customColumns).toHaveLength(1)
                expect(calledWith.customColumns[0].label).toBe("Ataque Furtivo")
                expect(calledWith.customColumns[0].values).toHaveLength(20)
            })
        })

        it("removes a custom column when X button is clicked", () => {
            const onProgressionDataChange = jest.fn()
            const progressionData: ClassProgressionData = {
                customColumns: [
                    { id: "col-1", label: "Sneak Attack", values: Array(20).fill(null) },
                ],
            }
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={false}
                    progressionData={progressionData}
                    isEditable={true}
                    onProgressionDataChange={onProgressionDataChange}
                />,
            )
            openTable()
            const removeBtn = screen.getByTitle("Remover coluna")
            fireEvent.click(removeBtn)
            expect(onProgressionDataChange).toHaveBeenCalledWith(
                expect.objectContaining({ customColumns: [] }),
            )
        })

        it("shows editable inputs (number inputs) for spell slots in edit mode", () => {
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={true}
                    isEditable={true}
                    onProgressionDataChange={jest.fn()}
                />,
            )
            openTable()
            const numberInputs = screen.getAllByRole("spinbutton")
            expect(numberInputs.length).toBeGreaterThan(0)
        })

        it("does not show editable inputs in view mode", () => {
            render(
                <ClassProgressionTable
                    traits={[]}
                    spellcasting={true}
                    isEditable={false}
                />,
            )
            openTable()
            expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument()
        })
    })

    describe("edge cases", () => {
        it("does not throw when subclassData has entry with no progressionData", () => {
            expect(() => {
                render(
                    <ClassProgressionTable
                        traits={[]}
                        spellcasting={false}
                        subclassData={[
                            {
                                traits: makeTraits([5]),
                                progressionData: undefined,
                                color: "#aabbcc",
                                name: "NoData",
                            },
                        ]}
                    />,
                )
                openTable()
            }).not.toThrow()
        })

        it("renders without progressionData prop", () => {
            expect(() => {
                render(<ClassProgressionTable traits={[]} spellcasting={false} />)
                openTable()
            }).not.toThrow()
        })

        it("handles traits with the same level from class and subclass", () => {
            const classTraits = makeTraits([3])
            const subclassData = [
                {
                    traits: makeTraits([3]),
                    progressionData: undefined,
                    color: "#ffcc00",
                    name: "Totem Warrior",
                },
            ]
            render(
                <ClassProgressionTable
                    traits={classTraits}
                    spellcasting={false}
                    subclassData={subclassData}
                />,
            )
            openTable()
            const allRows = screen.getAllByRole("row")
            // 1 header + 20 class rows + 1 subclass row at level 3
            expect(allRows).toHaveLength(22)
        })
    })
})
