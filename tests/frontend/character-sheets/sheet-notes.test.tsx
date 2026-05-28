import * as React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { UseFormWatch } from "react-hook-form"
import { SheetNotes } from "@/features/character-sheets/components/sheet-notes"
import type { CharacterSheet, PatchSheetBody } from "@/features/character-sheets/types/character-sheet.types"

vi.mock("@/features/character-sheets/api/character-sheets-queries", () => ({
    usePatchSheet: () => ({ isPending: false }),
}))

vi.mock("@/features/character-sheets/components/compact-rich-input", () => ({
    CompactRichInput: ({
        label,
        onBlur,
    }: {
        label: string
        onBlur: (value: string) => void
    }) => (
        <label>
            {label}
            <input aria-label={label} onBlur={() => onBlur(`<p>${label}</p>`)} />
        </label>
    ),
}))

const baseSheet = {
    _id: "sheet-1",
    appearance: "",
    history: "",
    notes: "",
} as CharacterSheet

describe("SheetNotes", () => {
    it("renders appearance, history, and notes rich text fields", () => {
        const form = {
            watch: vi.fn(() => undefined) as unknown as UseFormWatch<PatchSheetBody>,
            setFieldLocally: vi.fn(),
            patchField: vi.fn(),
        }

        render(<SheetNotes sheet={baseSheet} form={form} />)

        expect(screen.getByLabelText("Aparência")).toBeInTheDocument()
        expect(screen.getByLabelText("História")).toBeInTheDocument()
        expect(screen.getByLabelText("Notas")).toBeInTheDocument()
    })

    it("persists each field on blur", () => {
        const form = {
            watch: vi.fn(() => undefined) as unknown as UseFormWatch<PatchSheetBody>,
            setFieldLocally: vi.fn(),
            patchField: vi.fn(),
        }

        render(<SheetNotes sheet={baseSheet} form={form} />)

        fireEvent.blur(screen.getByLabelText("Aparência"))
        fireEvent.blur(screen.getByLabelText("História"))
        fireEvent.blur(screen.getByLabelText("Notas"))

        expect(form.patchField).toHaveBeenCalledWith("appearance", "<p>Aparência</p>")
        expect(form.patchField).toHaveBeenCalledWith("history", "<p>História</p>")
        expect(form.patchField).toHaveBeenCalledWith("notes", "<p>Notas</p>")
    })
})
