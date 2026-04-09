"use client"

import type { UseFormWatch } from "react-hook-form"
import type { CharacterSheet } from "../types/character-sheet.types"
import type { PatchSheetBody } from "../types/character-sheet.types"
import { ItemList } from "./item-list"
import { SpellList } from "./spell-list"

interface SheetRightColumnProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

export function SheetRightColumn({ sheet, form, isReadOnly = false }: SheetRightColumnProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ItemList sheet={sheet} form={form} isReadOnly={isReadOnly} />
            <SpellList sheet={sheet} form={form} isReadOnly={isReadOnly} />
        </div>
    )
}
