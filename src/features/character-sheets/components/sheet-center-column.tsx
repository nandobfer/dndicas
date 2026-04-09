"use client"

import { Plus, Trash2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { UseFormWatch } from "react-hook-form"
import { PatchSheetBody } from "../types/character-sheet.types"
import { usePatchSheet, useAttacks, useAddAttack, usePatchAttack, useRemoveAttack } from "../api/character-sheets-queries"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { CharacterSheet } from "../types/character-sheet.types"
import { CalcTooltip } from "./calc-tooltip"
import { SheetInput } from "./sheet-input"
import { CompactRichInput } from "./compact-rich-input"
import { useAttackNameSync } from "./hooks/use-attack-name-sync"

interface SheetCenterColumnProps {
    sheet: CharacterSheet
    form: {
        watch: UseFormWatch<PatchSheetBody>
        setFieldLocally: (field: keyof PatchSheetBody, value: unknown) => void
        patchField: (field: keyof PatchSheetBody, value: unknown) => void
    }
    isReadOnly?: boolean
}

const formatMod = (v: number) => (v >= 0 ? `+${v}` : `${v}`)

export function SheetCenterColumn({ sheet, form, isReadOnly = false }: SheetCenterColumnProps) {
    const { watch, setFieldLocally, patchField } = form
    const currentValues = watch()
    const currentSheet = { ...sheet, ...currentValues } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)
    const { isPending: isLoading } = usePatchSheet(sheet?._id)

    const { data: attacks = [] } = useAttacks(sheet._id)
    const addAttack = useAddAttack(sheet._id)
    const patchAttack = usePatchAttack(sheet._id)
    const removeAttack = useRemoveAttack(sheet._id)

    const { handleAttackNameChange } = useAttackNameSync({
        calc,
        isReadOnly,
        onPatch: (attackId, data) => patchAttack.mutate({ attackId, data }),
    })

    return (
        <div className="space-y-4">
            {/* Combat stats top row: Iniciativa | Deslocamento | Tamanho | Percepção Passiva */}
            <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40 text-center">Iniciativa</span>
                    <CalcTooltip formula={calc.initiative.formula} parts={calc.initiative.parts} result={calc.initiative.result}>
                        <span className="text-xl font-black text-white">{formatMod(calc.initiative.value)}</span>
                    </CalcTooltip>
                </div>

                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40 text-center">Deslocamento</span>
                    <SheetInput
                        value={String(currentValues.movementSpeed ?? sheet.movementSpeed ?? "")}
                        onChangeValue={(val) => patchField("movementSpeed", val)}
                        placeholder="9m"
                        isLoading={isLoading}
                        inputClassName="text-xl font-black text-center"
                        className="items-center"
                        readOnlyMode={isReadOnly}
                    />
                </div>

                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40 text-center">Tamanho</span>
                    <SheetInput
                        value={String(currentValues.size ?? sheet.size ?? "")}
                        onChangeValue={(v) => patchField("size" as keyof PatchSheetBody, v)}
                        placeholder="Médio"
                        isLoading={isLoading}
                        inputClassName="text-xl font-black text-center"
                        className="items-center w-full"
                        readOnlyMode={isReadOnly}
                    />
                </div>

                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                    <span className="text-[8px] font-black uppercase tracking-widest text-white/40 text-center leading-tight">Percepção Passiva</span>
                    <CalcTooltip formula={calc.passivePerception.formula} parts={calc.passivePerception.parts} result={calc.passivePerception.result}>
                        <span className="text-xl font-black text-white">{calc.passivePerception.value}</span>
                    </CalcTooltip>
                </div>
            </div>

            {/* Armas e Truques de Dano */}
            <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
                <div className="text-center py-1.5 border-b border-white/10 bg-white/[0.03]">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Armas e Truques de Dano</span>
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[minmax(0,2fr)_80px_minmax(0,2.5fr)_auto] gap-1 px-2 py-1 border-b border-white/5">
                    {["Nome", "Bônus Atq", "Dano e Tipo", ""].map((h) => (
                        <span key={h} className="text-[8px] font-black uppercase tracking-widest text-white/30 text-center">
                            {h}
                        </span>
                    ))}
                </div>

                {/* Attack rows */}
                <div className="divide-y divide-white/5">
                    <AnimatePresence initial={false}>
                        {attacks.map((attack) => (
                            <motion.div
                                key={attack._id}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="grid grid-cols-[minmax(0,2fr)_80px_minmax(0,2.5fr)_auto] gap-1 px-2 py-1 items-center"
                            >
                            <CompactRichInput
                                value={attack.name}
                                onChange={() => {}}
                                onBlur={(v) => handleAttackNameChange(attack._id, v)}
                                placeholder="Nome"
                                disabled={isReadOnly}
                            />
                            <SheetInput
                                compact
                                value={String(attack.attackBonus ?? "")}
                                onChangeValue={(v) => patchAttack.mutate({ attackId: attack._id, data: { attackBonus: v } })}
                                placeholder="+7"
                                inputClassName="text-center text-xs"
                                className="w-[80px]"
                                readOnlyMode={isReadOnly}
                            />
                            <CompactRichInput
                                value={attack.damageType}
                                onChange={() => {}}
                                onBlur={(v) => patchAttack.mutate({ attackId: attack._id, data: { damageType: v } })}
                                placeholder="Dano e tipo"
                                editorClassName="text-xs"
                                disabled={isReadOnly}
                            />
                            <button
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => !isReadOnly && removeAttack.mutate(attack._id)}
                                className="text-red-400/30 hover:text-red-400 transition-colors flex-shrink-0 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {!isReadOnly && (
                <div className="px-2 pb-2 pt-1">
                    <button
                        type="button"
                        onClick={() => addAttack.mutate({ name: "Novo Ataque", attackBonus: "", damageType: "" })}
                        className="w-full flex items-center justify-center gap-2 py-1.5 border border-dashed border-white/10 rounded text-[9px] font-bold uppercase tracking-wider text-white/30 hover:text-white/60 hover:border-white/20 transition-all"
                    >
                        <Plus className="w-3 h-3" /> Adicionar ataque
                    </button>
                </div>
                )}
            </div>

            {/* Características de Classe */}
            <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
                <div className="p-2">
                    <CompactRichInput
                        variant="full"
                        label="Características de Classe"
                        value={currentValues.classFeatures ?? sheet.classFeatures ?? ""}
                        onChange={(v) => setFieldLocally("classFeatures" as keyof PatchSheetBody, v)}
                        onBlur={(v) => patchField("classFeatures" as keyof PatchSheetBody, v)}
                        placeholder="Descreva as características de classe... use @para mencionar"
                        isLoading={isLoading}
                        minRows={5}
                        disabled={isReadOnly}
                    />
                </div>
            </div>

            {/* Traços de Espécies + Talentos */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
                    <div className="p-2">
                        <CompactRichInput
                            variant="full"
                            label="Traços de Espécies"
                            value={currentValues.speciesTraits ?? sheet.speciesTraits ?? ""}
                            onChange={(v) => setFieldLocally("speciesTraits" as keyof PatchSheetBody, v)}
                            onBlur={(v) => patchField("speciesTraits" as keyof PatchSheetBody, v)}
                            placeholder="Traços raciais... use @ para mencionar"
                            isLoading={isLoading}
                            minRows={5}
                            disabled={isReadOnly}
                        />
                    </div>
                </div>

                <div className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
                    <div className="p-2">
                        <CompactRichInput
                            variant="full"
                            label="Talentos"
                            value={currentValues.featuresNotes ?? sheet.featuresNotes ?? ""}
                            onChange={(v) => setFieldLocally("featuresNotes" as keyof PatchSheetBody, v)}
                            onBlur={(v) => patchField("featuresNotes" as keyof PatchSheetBody, v)}
                            placeholder="@alerta, @atirador, @sortudo..."
                            isLoading={isLoading}
                            minRows={5}
                            disabled={isReadOnly}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
