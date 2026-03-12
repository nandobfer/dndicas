"use client"

import { UseFormReturn } from "react-hook-form"
import { SheetInput } from "./sheet-input"
import { LongRestButton } from "./long-rest-button"
import type { PatchSheetBody, CharacterSheet } from "../types/character-sheet.types"

interface SheetHeaderProps {
    sheet: CharacterSheet
    form: UseFormReturn<PatchSheetBody>
}

export function SheetHeader({ sheet, form }: SheetHeaderProps) {
    const { register } = form

    return (
        <div className="space-y-4">
            {/* Name + long rest */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1">
                    <SheetInput
                        label="Nome do Personagem"
                        placeholder="Nome do Personagem"
                        className="text-lg font-bold"
                        {...register("name")}
                    />
                </div>
                <LongRestButton sheetId={sheet._id} className="self-end sm:self-auto mt-1 sm:mt-5" />
            </div>

            {/* Identity row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <SheetInput label="Classe" placeholder="Ex: Guerreiro" {...register("class")} />
                <SheetInput label="Subclasse" placeholder="Ex: Campeão" {...register("subclass")} />
                <SheetInput
                    label="Nível"
                    type="number"
                    min={1}
                    max={20}
                    {...register("level", { valueAsNumber: true })}
                />
                <SheetInput label="Raça" placeholder="Ex: Humano" {...register("race")} />
                <SheetInput label="Origem" placeholder="Ex: Soldado" {...register("origin")} />
                <SheetInput label="Multiclasse" placeholder="Notas" {...register("multiclassNotes")} />
            </div>
        </div>
    )
}
