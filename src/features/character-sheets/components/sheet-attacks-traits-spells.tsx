"use client"

import type { UseFormWatch } from "react-hook-form"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import type { CharacterSheet, PatchSheetBody } from "../types/character-sheet.types"
import { SheetAttacksAndTraits } from "./sheet-attacks-and-traits"
import { SpellList } from "./spell-list"

interface SheetAttacksTraitsSpellsProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        setFieldLocally: (field: keyof PatchSheetBody, value: unknown) => void
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
    forceDesktopLayout?: boolean
}

export function SheetAttacksTraitsSpells({ sheet, form, isReadOnly = false, forceDesktopLayout = false }: SheetAttacksTraitsSpellsProps) {
    return (
        <div className="space-y-4">
            <GlassCard>
                <GlassCardContent className="pt-4 pb-4">
                    <SheetAttacksAndTraits sheet={sheet} form={form} isReadOnly={isReadOnly} forceDesktopLayout={forceDesktopLayout} />
                </GlassCardContent>
            </GlassCard>

            <SpellList sheet={sheet} form={form} isReadOnly={isReadOnly} />
        </div>
    )
}
