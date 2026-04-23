"use client"

import type { UseFormWatch } from "react-hook-form"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import type { CharacterSheet, PatchSheetBody } from "../types/character-sheet.types"
import { SheetAttributesLeft } from "./sheet-attributes-left"
import { SheetAttributesRight } from "./sheet-attributes-right"
import { ItemList } from "./item-list"

interface SheetAttributesAndItemsProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        setFieldLocally: (field: keyof PatchSheetBody, value: unknown) => void
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
    forceDesktopLayout?: boolean
}

export function SheetAttributesAndItems({ sheet, form, isReadOnly = false, forceDesktopLayout = false }: SheetAttributesAndItemsProps) {
    return (
        <div className="space-y-4">
            <div className={forceDesktopLayout ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4 lg:grid-cols-2"}>
                <GlassCard>
                    <GlassCardContent className="pt-4 pb-4">
                        <SheetAttributesLeft sheet={sheet} form={form} isReadOnly={isReadOnly} />
                    </GlassCardContent>
                </GlassCard>

                <GlassCard>
                    <GlassCardContent className="pt-4 pb-4">
                        <SheetAttributesRight sheet={sheet} form={form} isReadOnly={isReadOnly} />
                    </GlassCardContent>
                </GlassCard>
            </div>

            <ItemList sheet={sheet} form={form} isReadOnly={isReadOnly} />
        </div>
    )
}
