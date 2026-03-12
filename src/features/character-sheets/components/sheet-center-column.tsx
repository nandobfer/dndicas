"use client"

import { UseFormReturn } from "react-hook-form"
import { Plus, Trash2 } from "lucide-react"
import { CalcTooltip } from "./calc-tooltip"
import { SheetInput } from "./sheet-input"
import type { PatchSheetBody, CharacterSheet } from "../types/character-sheet.types"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { useAttacks, useAddAttack, usePatchAttack, useRemoveAttack } from "../api/character-sheets-queries"

interface SheetCenterColumnProps {
    sheet: CharacterSheet
    form: UseFormReturn<PatchSheetBody>
}

const formatMod = (v: number) => (v >= 0 ? `+${v}` : `${v}`)

export function SheetCenterColumn({ sheet, form }: SheetCenterColumnProps) {
    const { register, watch } = form
    const currentSheet = { ...sheet, ...watch() } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)

    const { data: attacks = [] } = useAttacks(sheet._id)
    const addAttack = useAddAttack(sheet._id)
    const patchAttack = usePatchAttack(sheet._id)  
    const removeAttack = useRemoveAttack(sheet._id)

    return (
        <div className="space-y-4">
            {/* Combat Stats Row */}
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">CA</span>
                    <CalcTooltip formula={calc.armorClass.formula}>
                        <span className="text-xl font-black text-white">{calc.armorClass.value}</span>
                    </CalcTooltip>
                    <SheetInput
                        compact
                        type="number"
                        placeholder="Override"
                        {...register("armorClassOverride", { valueAsNumber: true, setValueAs: (v) => v === "" ? null : Number(v) })}
                    />
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Iniciativa</span>
                    <CalcTooltip formula={calc.initiative.formula}>
                        <span className="text-xl font-black text-white">{formatMod(calc.initiative.value)}</span>
                    </CalcTooltip>
                    <SheetInput
                        compact
                        type="number"
                        placeholder="Override"
                        {...register("initiativeOverride", { valueAsNumber: true, setValueAs: (v) => v === "" ? null : Number(v) })}
                    />
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Deslocamento</span>
                    <input
                        type="number"
                        className="text-xl font-black text-white bg-transparent text-center w-full focus:outline-none"
                        {...register("movementSpeed", { valueAsNumber: true })}
                    />
                    <span className="text-[9px] text-white/30">pés</span>
                </div>
            </div>

            {/* HP */}
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Pontos de Vida</h3>
                <div className="grid grid-cols-3 gap-2">
                    <SheetInput
                        label="Máximo"
                        type="number"
                        min={0}
                        {...register("hpMax", { valueAsNumber: true })}
                    />
                    <SheetInput
                        label="Atual"
                        type="number"
                        {...register("hpCurrent", { valueAsNumber: true })}
                    />
                    <SheetInput
                        label="Temporário"
                        type="number"
                        min={0}
                        {...register("hpTemp", { valueAsNumber: true })}
                    />
                </div>
                {/* HP bar */}
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-green-500/70 to-green-400/50 rounded-full transition-all duration-300"
                        style={{
                            width: (currentSheet.hpMax ?? 0) > 0
                                ? `${Math.max(0, Math.min(100, ((currentSheet.hpCurrent ?? 0) / (currentSheet.hpMax ?? 1)) * 100))}%`
                                : "0%",
                        }}
                    />
                </div>
            </div>

            {/* Hit Dice + Death Saves */}
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Dado de Vida</h3>
                    <div className="flex gap-2">
                        <SheetInput
                            label="Total"
                            placeholder="Ex: 8d8"
                            className="flex-1"
                            {...register("hitDiceTotal")}
                        />
                        <SheetInput
                            label="Usados"
                            type="number"
                            min={0}
                            className="w-16"
                            {...register("hitDiceUsed", { valueAsNumber: true })}
                        />
                    </div>
                </div>

                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Testes de Morte</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <SheetInput
                            label="Sucessos"
                            type="number"
                            min={0}
                            max={3}
                            {...register("deathSavesSuccess", { valueAsNumber: true })}
                        />
                        <SheetInput
                            label="Falhas"
                            type="number"
                            min={0}
                            max={3}
                            {...register("deathSavesFailure", { valueAsNumber: true })}
                        />
                    </div>
                </div>
            </div>

            {/* Spellcasting */}
            {currentSheet.spellcastingAttribute && (
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Magia</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[8px] text-white/40 uppercase tracking-wide text-center">CD de Magia</span>
                            <CalcTooltip formula={calc.spellSaveDC.formula}>
                                <span className="text-lg font-black text-white">{calc.spellSaveDC.value}</span>
                            </CalcTooltip>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[8px] text-white/40 uppercase tracking-wide text-center">Ataque Mágico</span>
                            <CalcTooltip formula={calc.spellAttackBonus.formula}>
                                <span className="text-lg font-black text-white">{formatMod(calc.spellAttackBonus.value)}</span>
                            </CalcTooltip>
                        </div>
                        <SheetInput
                            label="Atributo"
                            placeholder="wis"
                            {...register("spellcastingAttribute")}
                        />
                    </div>
                </div>
            )}

            {/* Attacks */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Ataques</h3>
                    <button
                        type="button"
                        onClick={() => addAttack.mutate({ name: "Novo Ataque", attackBonus: 0, damageType: "" })}
                        className="text-white/40 hover:text-white/70 transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="space-y-1.5">
                    {attacks.map((attack) => (
                        <div key={attack._id} className="flex items-center gap-1.5">
                            <input
                                className="flex-1 min-w-0 text-xs bg-white/5 border border-white/10 rounded px-2 h-7 text-white focus:outline-none focus:border-white/30"
                                defaultValue={attack.name}
                                placeholder="Nome"
                                onBlur={(e) => patchAttack.mutate({ attackId: attack._id, data: { name: e.target.value } })}
                            />
                            <input
                                className="w-14 text-center text-xs bg-white/5 border border-white/10 rounded px-1 h-7 text-white focus:outline-none focus:border-white/30"
                                type="number"
                                defaultValue={attack.attackBonus}
                                placeholder="Bon."
                                onBlur={(e) => patchAttack.mutate({ attackId: attack._id, data: { attackBonus: Number(e.target.value) } })}
                            />
                            <input
                                className="w-20 text-xs bg-white/5 border border-white/10 rounded px-2 h-7 text-white focus:outline-none focus:border-white/30"
                                defaultValue={attack.damageType}
                                placeholder="Dano"
                                onBlur={(e) => patchAttack.mutate({ attackId: attack._id, data: { damageType: e.target.value } })}
                            />
                            <button
                                type="button"
                                onClick={() => removeAttack.mutate(attack._id)}
                                className="text-red-400/50 hover:text-red-400 transition-colors flex-shrink-0"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    {attacks.length === 0 && (
                        <p className="text-[10px] text-white/30 italic text-center py-2">Nenhum ataque cadastrado</p>
                    )}
                </div>
            </div>

            {/* Coins */}
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Moedas</h3>
                <div className="grid grid-cols-5 gap-1.5">
                    {(["cp", "sp", "ep", "gp", "pp"] as const).map((coin) => (
                        <SheetInput
                            key={coin}
                            label={coin.toUpperCase()}
                            type="number"
                            min={0}
                            compact
                            // Accessing nested coin fields via register
                            {...register(`coins.${coin}` as keyof PatchSheetBody, { valueAsNumber: true })}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
