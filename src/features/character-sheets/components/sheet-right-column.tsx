"use client"

import type { CharacterSheet } from "../types/character-sheet.types"
import { ItemList } from "./item-list"
import { SpellList } from "./spell-list"

interface SheetRightColumnProps {
    sheet: CharacterSheet
    form: any
}

export function SheetRightColumn({ sheet, form }: SheetRightColumnProps) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <ItemList sheet={sheet} form={form} />
            <SpellList sheet={sheet} form={form} />
        </div>
    )
}

