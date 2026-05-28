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
    const fields = [
        {
            field: "appearance" as const,
            label: "Aparência",
            placeholder: "Descrição física, roupas, marcas, postura... use @ para mencionar",
        },
        {
            field: "history" as const,
            label: "História",
            placeholder: "Origem, jornada, vínculos, eventos marcantes... use @ para mencionar",
        },
        {
            field: "notes" as const,
            label: "Notas",
            placeholder: "Anotações livres, recompensas, NPCs... use @ para mencionar",
        },
    ]

    return (
        <GlassCard>
            <GlassCardContent className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
                {fields.map((item) => (
                    <CompactRichInput
                        key={item.field}
                        variant="full"
                        label={item.label}
                        value={watch(item.field) ?? sheet[item.field] ?? ""}
                        onChange={(v) => setFieldLocally(item.field as keyof PatchSheetBody, v)}
                        onBlur={(v) => patchField(item.field as keyof PatchSheetBody, v)}
                        placeholder={item.placeholder}
                        isLoading={isLoading}
                        minRows={5}
                        excludeId={sheet._id}
                        disabled={isReadOnly}
                    />
                ))}
            </GlassCardContent>
        </GlassCard>
    )
}
