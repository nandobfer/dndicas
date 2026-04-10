"use client"

import type { UseFormWatch } from "react-hook-form"
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card"
import { CompactRichInput } from "./compact-rich-input"
import { usePatchSheet } from "../api/character-sheets-queries"
import type { CharacterSheet, PatchSheetBody } from "../types/character-sheet.types"

interface SheetNotesProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        setFieldLocally: (field: keyof PatchSheetBody, value: unknown) => void
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

export function SheetNotes({ sheet, form, isReadOnly = false }: SheetNotesProps) {
    const { watch, setFieldLocally, patchField } = form
    const { isPending: isLoading } = usePatchSheet(sheet._id)

    return (
        <GlassCard>
            <GlassCardContent className="p-4">
                <CompactRichInput
                    variant="full"
                    label="Notas"
                    value={watch("notes") ?? sheet.notes ?? ""}
                    onChange={(v) => setFieldLocally("notes" as keyof PatchSheetBody, v)}
                    onBlur={(v) => patchField("notes" as keyof PatchSheetBody, v)}
                    placeholder="Anotações livres, histórico, recompensas, NPCs... use @ para mencionar"
                    isLoading={isLoading}
                    minRows={5}
                    excludeId={sheet._id}
                    disabled={isReadOnly}
                />
            </GlassCardContent>
        </GlassCard>
    )
}
