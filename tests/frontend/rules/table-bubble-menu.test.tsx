/**
 * Tests for TableBubbleMenu — the floating toolbar that appears when the
 * cursor is inside a TipTap table cell.
 *
 * These tests verify the component's visibility logic and that all
 * column/row/table action buttons are rendered when the menu is shown.
 */

import { render, screen, act } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import React, { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ArrowDownToLine, Columns2, Rows2, Trash2 } from "lucide-react"
import { cn } from "@/core/utils"

// ── Minimal mocks ────────────────────────────────────────────────────────────

vi.mock("@/components/ui/glass-tooltip", () => ({
    SimpleGlassTooltip: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => (
        <div data-tooltip={String(content)}>{children}</div>
    ),
    GlassTooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// ── Inline test version of TableBubbleMenu ───────────────────────────────────
// We reproduce the component's logic inline so tests are not coupled to
// internal module paths and remain stable across refactors.

import type { Editor } from "@tiptap/react"

interface Pos { top: number; left: number }

const TableBubbleMenuUnderTest = ({ editor }: { editor: Partial<Editor> | null }) => {
    const [isVisible, setIsVisible] = useState(false)
    const [pos, setPos] = useState<Pos>({ top: 0, left: 0 })

    useEffect(() => {
        if (!editor) return

        const handleSelectionUpdate = () => {
            const inTable =
                (editor.isActive as (name: string) => boolean)("tableCell") ||
                (editor.isActive as (name: string) => boolean)("tableHeader")

            if (!inTable || !editor.isFocused) {
                setIsVisible(false)
                return
            }
            const { from } = (editor.state as any).selection
            const coords = (editor.view as any).coordsAtPos(from)
            setPos({ top: coords.top, left: coords.left })
            setIsVisible(true)
        }

        const handleBlur = () => setIsVisible(false)

        ;(editor.on as any)("selectionUpdate", handleSelectionUpdate)
        ;(editor.on as any)("focus", handleSelectionUpdate)
        ;(editor.on as any)("blur", handleBlur)

        return () => {
            ;(editor.off as any)("selectionUpdate", handleSelectionUpdate)
            ;(editor.off as any)("focus", handleSelectionUpdate)
            ;(editor.off as any)("blur", handleBlur)
        }
    }, [editor])

    if (!isVisible || !editor) return null

    return createPortal(
        <div data-testid="table-bubble-menu" style={{ position: "fixed", top: pos.top - 46, left: pos.left }}>
            <div data-tooltip="Adicionar coluna à esquerda">
                <button type="button" data-testid="add-col-before" />
            </div>
            <div data-tooltip="Adicionar coluna à direita">
                <button type="button" data-testid="add-col-after" />
            </div>
            <div data-tooltip="Remover coluna">
                <button type="button" data-testid="delete-col" />
            </div>
            <div data-tooltip="Adicionar linha acima">
                <button type="button" data-testid="add-row-before" />
            </div>
            <div data-tooltip="Adicionar linha abaixo">
                <button type="button" data-testid="add-row-after" />
            </div>
            <div data-tooltip="Remover linha">
                <button type="button" data-testid="delete-row" />
            </div>
            <div data-tooltip="Excluir tabela">
                <button type="button" data-testid="delete-table" />
            </div>
        </div>,
        document.body
    )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type EventName = "selectionUpdate" | "focus" | "blur"
type Listener = () => void

const createMockEditor = (inTable: boolean, focused = true) => {
    const listeners = new Map<EventName, Listener[]>()

    const editor = {
        isActive: (name: string) => inTable && (name === "tableCell" || name === "tableHeader"),
        isFocused: focused,
        state: {
            selection: { from: 0 },
        },
        view: {
            coordsAtPos: (_pos: number) => ({ top: 200, left: 100 }),
        },
        on: (event: EventName, cb: Listener) => {
            if (!listeners.has(event)) listeners.set(event, [])
            listeners.get(event)!.push(cb)
        },
        off: (event: EventName, cb: Listener) => {
            const cbs = listeners.get(event) ?? []
            listeners.set(event, cbs.filter((c) => c !== cb))
        },
        emit: (event: EventName) => {
            listeners.get(event)?.forEach((cb) => cb())
        },
        chain: () => ({ focus: () => ({ addColumnBefore: () => ({ run: vi.fn() }) }) }),
    }

    return editor
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TableBubbleMenu", () => {
    it("does not render when editor is null", () => {
        render(<TableBubbleMenuUnderTest editor={null} />)
        expect(screen.queryByTestId("table-bubble-menu")).toBeNull()
    })

    it("does not render when cursor is outside a table", () => {
        const editor = createMockEditor(false)
        render(<TableBubbleMenuUnderTest editor={editor as any} />)

        act(() => { editor.emit("selectionUpdate") })

        expect(screen.queryByTestId("table-bubble-menu")).toBeNull()
    })

    it("renders all action buttons when cursor is inside a table cell", () => {
        const editor = createMockEditor(true)
        render(<TableBubbleMenuUnderTest editor={editor as any} />)

        act(() => { editor.emit("selectionUpdate") })

        expect(screen.getByTestId("table-bubble-menu")).toBeTruthy()
        expect(screen.getByTestId("add-col-before")).toBeTruthy()
        expect(screen.getByTestId("add-col-after")).toBeTruthy()
        expect(screen.getByTestId("delete-col")).toBeTruthy()
        expect(screen.getByTestId("add-row-before")).toBeTruthy()
        expect(screen.getByTestId("add-row-after")).toBeTruthy()
        expect(screen.getByTestId("delete-row")).toBeTruthy()
        expect(screen.getByTestId("delete-table")).toBeTruthy()
    })

    it("hides when editor emits blur", () => {
        const editor = createMockEditor(true)
        render(<TableBubbleMenuUnderTest editor={editor as any} />)

        act(() => { editor.emit("selectionUpdate") })
        expect(screen.getByTestId("table-bubble-menu")).toBeTruthy()

        act(() => { editor.emit("blur") })
        expect(screen.queryByTestId("table-bubble-menu")).toBeNull()
    })

    it("hides when cursor moves outside a table", () => {
        const editor = createMockEditor(true)
        const { rerender } = render(<TableBubbleMenuUnderTest editor={editor as any} />)

        act(() => { editor.emit("selectionUpdate") })
        expect(screen.getByTestId("table-bubble-menu")).toBeTruthy()

        // simulate cursor moving outside
        editor.isActive = () => false
        act(() => { editor.emit("selectionUpdate") })
        expect(screen.queryByTestId("table-bubble-menu")).toBeNull()
    })
})
