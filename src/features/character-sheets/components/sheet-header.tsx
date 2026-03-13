"use client"

import { Search } from "lucide-react"
import { SheetInput } from "./sheet-input"
import { LongRestButton } from "./long-rest-button"
import type { PatchSheetBody, CharacterSheet } from "../types/character-sheet.types"
import { usePatchSheet } from "../api/character-sheets-queries"

interface SheetHeaderProps {
    sheet: CharacterSheet
    form: any // Using specific hook return type instead of UseFormReturn
}

export function SheetHeader({ sheet, form }: SheetHeaderProps) {
    const { watch, patchField } = form
    const { isPending: isLoading } = usePatchSheet(sheet?._id)

    return (
        <div className="space-y-4">
            {/* Name + long rest */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1">
                    <SheetInput
                        label="Nome do Personagem"
                        placeholder="Nome do Personagem"
                        className="text-lg font-bold"
                        value={watch("name") || ""}
                        onChangeValue={(val) => patchField("name", val)}
                        isLoading={isLoading}
                    />
                </div>
                <LongRestButton sheetId={sheet._id} className="self-end sm:self-auto mt-1 sm:mt-5" />
            </div>

            {/* Identity row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <SheetInput
                    label="Classe"
                    placeholder="Ex: Guerreiro"
                    value={watch("class") || ""}
                    onChangeValue={(val) => patchField("class", val)}
                    isLoading={isLoading}
                    icon={<Search className="h-4 w-4" />}
                    onActionClick={() => {}} // TODO: Catalog selection
                />
                <SheetInput
                    label="Subclasse"
                    placeholder="Ex: Campeão"
                    value={watch("subclass") || ""}
                    onChangeValue={(val) => patchField("subclass", val)}
                    isLoading={isLoading}
                    icon={<Search className="h-4 w-4" />}
                    onActionClick={() => {}}
                />
                <SheetInput
                    label="Nível"
                    type="number"
                    min={1}
                    max={20}
                    value={watch("level")}
                    onChangeValue={(val) => patchField("level", parseInt(val) || 1)}
                    isLoading={isLoading}
                    icon={<Search className="h-4 w-4" />}
                    onActionClick={() => {}}
                />
                <SheetInput
                    label="Raça"
                    placeholder="Ex: Humano"
                    value={watch("race") || ""}
                    onChangeValue={(val) => patchField("race", val)}
                    isLoading={isLoading}
                    icon={<Search className="h-4 w-4" />}
                    onActionClick={() => {}}
                />
                <SheetInput
                    label="Origem"
                    placeholder="Ex: Soldado"
                    value={watch("origin") || ""}
                    onChangeValue={(val) => patchField("origin", val)}
                    isLoading={isLoading}
                    icon={<Search className="h-4 w-4" />}
                    onActionClick={() => {}}
                />
                <SheetInput
                    label="Multiclasse"
                    placeholder="Notas"
                    value={watch("multiclassNotes") || ""}
                    onChangeValue={(val) => patchField("multiclassNotes", val)}
                    isLoading={isLoading}
                />
            </div>
        </div>
    )
}
