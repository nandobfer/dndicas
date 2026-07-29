import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { UseFormWatch } from "react-hook-form"
import { SheetNotes } from "@/features/character-sheets/components/sheet-notes"
import type { CharacterSheet, CharacterSheetNotePage, PatchSheetBody } from "@/features/character-sheets/types/character-sheet.types"

vi.mock("framer-motion", () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
        div: ({
            children,
            custom: _custom,
            variants: _variants,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            transition: _transition,
            ...props
        }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => <div {...props}>{children}</div>,
    },
}))

vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({
    usePatchSheet: () => ({ isPending: false }),
}))

vi.mock("@/features/character-sheets/components/compact-rich-input", () => ({
    CompactRichInput: ({
        label,
        value,
        onChange,
        onBlur,
        disabled,
    }: {
        label?: string
        value: string
        onChange: (value: string) => void
        onBlur: (value: string) => void
        disabled?: boolean
    }) => (
        <label>
            {label}
            <input
                aria-label={label}
                disabled={disabled}
                value={value}
                onChange={(event) => onChange(event.currentTarget.value)}
                onBlur={(event) => onBlur(event.currentTarget.value)}
            />
        </label>
    ),
}))

const baseSheet = {
    _id: "sheet-1",
    appearance: "",
    history: "",
    notes: "<p>Notas antigas</p>",
    notePages: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as CharacterSheet

function renderSheetNotes({ sheet = baseSheet, isReadOnly = false }: { sheet?: CharacterSheet; isReadOnly?: boolean } = {}) {
    const patchField = vi.fn()
    const setFieldLocally = vi.fn()

    function Harness() {
        const [values, setValues] = React.useState<Partial<PatchSheetBody>>({
            notes: sheet.notes,
            notePages: sheet.notePages,
        })
        const form = {
            watch: vi.fn((field: keyof PatchSheetBody) => values[field]) as unknown as UseFormWatch<PatchSheetBody>,
            setFieldLocally: (field: keyof PatchSheetBody, value: unknown) => {
                setFieldLocally(field, value)
                setValues((current) => ({ ...current, [field]: value }))
            },
            patchField: (field: keyof PatchSheetBody, value: unknown) => {
                patchField(field, value)
                setValues((current) => ({ ...current, [field]: value }))
            },
        }

        return <SheetNotes sheet={sheet} form={form} isReadOnly={isReadOnly} />
    }

    const rendered = render(<Harness />)

    return { patchField, setFieldLocally, ...rendered }
}

describe("SheetNotes", () => {
    it("renders appearance, history, and the legacy notes field as page 1", () => {
        const { container } = renderSheetNotes()

        expect(screen.getByLabelText("Aparência")).toBeInTheDocument()
        expect(screen.getByLabelText("História")).toBeInTheDocument()
        expect(screen.getByLabelText("Notas")).toHaveValue("<p>Notas antigas</p>")
        expect(screen.getByText("Página 1 de 1")).toBeInTheDocument()
        expect(container.querySelector(".lg\\:grid-cols-2")).toContainElement(screen.getByLabelText("Aparência"))
        expect(container.querySelector(".lg\\:grid-cols-2")).toContainElement(screen.getByLabelText("História"))
        expect(container.querySelector(".lg\\:grid-cols-2")).not.toContainElement(screen.getByLabelText("Notas"))
    })

    it("persists appearance, history, and page 1 notes on blur", () => {
        const { patchField } = renderSheetNotes()

        fireEvent.change(screen.getByLabelText("Aparência"), { target: { value: "<p>Aparência</p>" } })
        fireEvent.blur(screen.getByLabelText("Aparência"))
        fireEvent.change(screen.getByLabelText("História"), { target: { value: "<p>História</p>" } })
        fireEvent.blur(screen.getByLabelText("História"))
        fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "<p>Notas</p>" } })
        fireEvent.blur(screen.getByLabelText("Notas"))

        expect(patchField).toHaveBeenCalledWith("appearance", "<p>Aparência</p>")
        expect(patchField).toHaveBeenCalledWith("history", "<p>História</p>")
        expect(patchField).toHaveBeenCalledWith("notes", "<p>Notas</p>")
    })

    it("adds and edits extra note pages without replacing the legacy notes field", () => {
        const { patchField } = renderSheetNotes()

        fireEvent.click(screen.getByLabelText("Adicionar página de notas"))

        expect(screen.getByText("Página 2 de 2")).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "<p>Página extra</p>" } })
        fireEvent.blur(screen.getByLabelText("Notas"))

        expect(patchField).toHaveBeenCalledWith("notePages", [
            expect.objectContaining({ content: "<p>Página extra</p>" }),
        ])
        expect(patchField).not.toHaveBeenCalledWith("notes", "<p>Página extra</p>")
    })

    it("removes an extra blank note page when syncing", () => {
        const { patchField } = renderSheetNotes()

        fireEvent.click(screen.getByLabelText("Adicionar página de notas"))
        fireEvent.blur(screen.getByLabelText("Notas"))

        expect(patchField).toHaveBeenLastCalledWith("notePages", [])
        expect(screen.getByText("Página 1 de 1")).toBeInTheDocument()
        expect(screen.getByLabelText("Notas")).toHaveValue("<p>Notas antigas</p>")
    })

    it("removes rich text pages that only contain empty markup", () => {
        const notePages: CharacterSheetNotePage[] = [{
            id: "page-2",
            content: "<p>Conteúdo</p>",
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
        }]
        const { patchField } = renderSheetNotes({ sheet: { ...baseSheet, notePages } })

        fireEvent.click(screen.getByLabelText("Próxima página"))
        fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "<p><br></p>" } })
        fireEvent.blur(screen.getByLabelText("Notas"))

        expect(patchField).toHaveBeenLastCalledWith("notePages", [])
        expect(screen.getByText("Página 1 de 1")).toBeInTheDocument()
    })

    it("keeps the first notes page even when it is empty", () => {
        const { patchField } = renderSheetNotes({ sheet: { ...baseSheet, notes: "" } })

        fireEvent.blur(screen.getByLabelText("Notas"))

        expect(patchField).toHaveBeenCalledWith("notes", "")
        expect(patchField).not.toHaveBeenCalledWith("notePages", expect.anything())
        expect(screen.getByText("Página 1 de 1")).toBeInTheDocument()
    })

    it("navigates between existing note pages", () => {
        const notePages: CharacterSheetNotePage[] = [{
            id: "page-2",
            content: "<p>Segunda página</p>",
            createdAt: "2026-01-02T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
        }]

        renderSheetNotes({ sheet: { ...baseSheet, notePages } })

        fireEvent.click(screen.getByLabelText("Próxima página"))

        expect(screen.getByText("Página 2 de 2")).toBeInTheDocument()
        expect(screen.getByLabelText("Notas")).toHaveValue("<p>Segunda página</p>")

        fireEvent.click(screen.getByLabelText("Página anterior"))

        expect(screen.getByText("Página 1 de 2")).toBeInTheDocument()
        expect(screen.getByLabelText("Notas")).toHaveValue("<p>Notas antigas</p>")
    })

    it("disables note creation and editing in read-only mode", () => {
        renderSheetNotes({ isReadOnly: true })

        expect(screen.getByLabelText("Adicionar página de notas")).toBeDisabled()
        expect(screen.getByLabelText("Notas")).toBeDisabled()
    })
})
