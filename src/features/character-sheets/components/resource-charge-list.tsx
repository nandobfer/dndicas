"use client"

import { useCallback, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Plus, Trash2 } from "lucide-react"
import type { UseFormWatch } from "react-hook-form"
import { fetchFeat } from "@/features/feats/api/feats-api"
import { fetchItemById } from "@/features/items/api/items-api"
import { fetchTraitById } from "@/features/traits/api/traits-api"
import { CompactRichInput } from "./compact-rich-input"
import { GlassCheckbox } from "./glass-checkbox"
import { SheetInput } from "./sheet-input"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import type { CharacterSheet, CharacterResourceCharge, PatchSheetBody } from "../types/character-sheet.types"
import { buildBoundResourceCharge, clampResourceChargeRow, createResourceChargeId, extractResourceChargeMention } from "../utils/resource-charges"

interface ResourceChargeListProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

export function ResourceChargeList({ sheet, form, isReadOnly = false }: ResourceChargeListProps) {
    const { watch, patchField } = form
    const [focusRowId, setFocusRowId] = useState<string | null>(null)
    const watchedValues = watch()
    const rows = useMemo(
        () => watchedValues.resourceCharges ?? sheet.resourceCharges ?? [],
        [sheet.resourceCharges, watchedValues.resourceCharges]
    )
    const currentSheet = useMemo(
        () => ({ ...sheet, ...watchedValues, resourceCharges: rows }) as CharacterSheet,
        [rows, sheet, watchedValues]
    )
    const calc = useCharacterCalculations(currentSheet)

    const patchRows = useCallback((nextRows: CharacterResourceCharge[]) => {
        patchField("resourceCharges", nextRows.map(clampResourceChargeRow))
    }, [patchField])

    const handleAddRow = useCallback(() => {
        if (isReadOnly) return
        const rowId = createResourceChargeId()
        patchRows([
            ...rows,
            { id: rowId, name: "", total: 0, used: 0, source: null },
        ])
        setFocusRowId(rowId)
    }, [isReadOnly, patchRows, rows])

    const handlePatchRow = useCallback((rowId: string, data: Partial<CharacterResourceCharge>) => {
        patchRows(
            rows.map((row) => row.id === rowId ? { ...row, ...data } : row)
        )
    }, [patchRows, rows])

    const handleRemoveRow = useCallback((rowId: string) => {
        if (isReadOnly) return
        patchRows(rows.filter((row) => row.id !== rowId))
    }, [isReadOnly, patchRows, rows])

    const handleNameBlur = useCallback(async (rowId: string, nameHtml: string) => {
        if (isReadOnly) return

        const currentRow = rows.find((row) => row.id === rowId)
        if (!currentRow) return

        const mention = extractResourceChargeMention(nameHtml)
        if (!mention) {
            handlePatchRow(rowId, { name: nameHtml, source: null })
            return
        }

        try {
            const entity =
                mention.entityType === "Habilidade"
                    ? await fetchTraitById(mention.id)
                    : mention.entityType === "Talento"
                        ? await fetchFeat(mention.id)
                        : await fetchItemById(mention.id)

            const nextRow = buildBoundResourceCharge({
                entityId: mention.id,
                entityType: mention.entityType as "Habilidade" | "Talento" | "Item",
                kind: "manual-name-mention",
                nameHtml,
                charges: entity.charges,
            }, {
                level: currentSheet.level,
                proficiencyBonus: calc.profBonus.value,
                attributeModifiers: {
                    strength: calc.attrMods.strength.value,
                    dexterity: calc.attrMods.dexterity.value,
                    constitution: calc.attrMods.constitution.value,
                    intelligence: calc.attrMods.intelligence.value,
                    wisdom: calc.attrMods.wisdom.value,
                    charisma: calc.attrMods.charisma.value,
                },
            }, currentRow)

            if (!nextRow) {
                handlePatchRow(rowId, { name: nameHtml, source: null })
                return
            }

            handlePatchRow(rowId, nextRow)
        } catch {
            handlePatchRow(rowId, { name: nameHtml, source: null })
        }
    }, [calc.attrMods.charisma.value, calc.attrMods.constitution.value, calc.attrMods.dexterity.value, calc.attrMods.intelligence.value, calc.attrMods.strength.value, calc.attrMods.wisdom.value, calc.profBonus.value, currentSheet.level, handlePatchRow, isReadOnly, rows])

    return (
        <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
            <div className="text-center py-1.5 border-b border-white/10 bg-white/[0.03]">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Recursos e Cargas</span>
            </div>

            <div className="grid grid-cols-[minmax(0,2fr)_72px_minmax(0,1.4fr)_auto] gap-1 px-2 py-1 border-b border-white/5">
                {["Nome", "Total", "Gastos", ""].map((header) => (
                    <span key={header} className="text-[8px] font-black uppercase tracking-widest text-white/30 text-center">
                        {header}
                    </span>
                ))}
            </div>

            <div className="divide-y divide-white/5">
                <AnimatePresence initial={false}>
                    {rows.map((row) => (
                        <motion.div
                            key={row.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="grid grid-cols-[minmax(0,2fr)_72px_minmax(0,1.4fr)_auto] gap-1 px-2 py-1 items-center"
                        >
                            <CompactRichInput
                                value={row.name}
                                onChange={() => {}}
                                onBlur={(value) => handleNameBlur(row.id, value)}
                                placeholder="Nome"
                                disabled={isReadOnly}
                                focusToken={!isReadOnly && focusRowId === row.id ? row.id : null}
                                onAutoFocusApplied={() => setFocusRowId(null)}
                            />
                            <SheetInput
                                compact
                                type="number"
                                min={0}
                                showControls
                                value={String(row.total)}
                                onChangeValue={(value) => handlePatchRow(row.id, { total: parseInt(value, 10) || 0 })}
                                inputClassName="text-center text-xs"
                                className="w-[72px]"
                                readOnlyMode={isReadOnly}
                            />
                            <div className="flex min-h-6 flex-wrap items-center justify-center gap-1">
                                {row.total > 0 ? Array.from({ length: row.total }).map((_, index) => (
                                    <GlassCheckbox
                                        key={`${row.id}-${index}`}
                                        size="sm"
                                        checked={index < row.used}
                                        onChange={() => handlePatchRow(row.id, { used: index < row.used ? index : index + 1 })}
                                        accentColor="#0ea5e9"
                                        disabled={isReadOnly}
                                    />
                                )) : (
                                    <span className="text-[8px] text-white/20">—</span>
                                )}
                            </div>
                            {!isReadOnly && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveRow(row.id)}
                                    className="text-red-400/30 hover:text-red-400 transition-colors flex-shrink-0 flex items-center justify-center"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {!isReadOnly && (
                <div className="px-2 pb-2 pt-1">
                    <button
                        type="button"
                        onClick={handleAddRow}
                        className="w-full flex items-center justify-center gap-2 py-1.5 border border-dashed border-white/10 rounded text-[9px] font-bold uppercase tracking-wider text-white/30 hover:text-white/60 hover:border-white/20 transition-all"
                    >
                        <Plus className="w-3 h-3" /> Adicionar recurso
                    </button>
                </div>
            )}
        </div>
    )
}
