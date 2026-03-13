"use client"

import { Plus, Trash2 } from "lucide-react"
import { PatchSheetBody } from "../types/character-sheet.types"
import { usePatchSheet, useAttacks, useAddAttack, usePatchAttack, useRemoveAttack } from "../api/character-sheets-queries"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import { CharacterSheet } from "../types/character-sheet.types"
import { CalcTooltip } from "./calc-tooltip"
import { SheetInput } from "./sheet-input"

interface SheetCenterColumnProps {
    sheet: CharacterSheet
    form: any
}

const formatMod = (v: number) => (v >= 0 ? `+${v}` : `${v}`)

export function SheetCenterColumn({ sheet, form }: SheetCenterColumnProps) {
    const { watch, patchField } = form
    const currentValues = watch()
    const currentSheet = { ...sheet, ...currentValues } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)
    const { isPending: isLoading } = usePatchSheet(sheet?._id)

    const { data: attacks = [] } = useAttacks(sheet._id)
    const addAttack = useAddAttack(sheet._id)
    const patchAttack = usePatchAttack(sheet._id)  
    const removeAttack = useRemoveAttack(sheet._id)

    return (
        <div className="space-y-4">
            {/* Combat Stats Row */}
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1 group">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">CA</span>
                    <CalcTooltip formula={calc.armorClass.formula}>
                        <span className="text-xl font-black text-white">{calc.armorClass.value}</span>
                    </CalcTooltip>
                    <SheetInput
                        compact
                        type="number"
                        placeholder="Overrd"
                        value={currentValues.armorClassOverride || ""}
                        onChangeValue={(val) => patchField("armorClassOverride", val === "" ? null : parseInt(val))}
                        isLoading={isLoading}
                    />
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1 group">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Iniciativa</span>
                    <CalcTooltip formula={calc.initiative.formula}>
                        <span className="text-xl font-black text-white">{formatMod(calc.initiative.value)}</span>
                    </CalcTooltip>
                    <SheetInput
                        compact
                        type="number"
                        placeholder="Overrd"
                        value={currentValues.initiativeOverride || ""}
                        onChangeValue={(val) => patchField("initiativeOverride", val === "" ? null : parseInt(val))}
                        isLoading={isLoading}
                    />
                </div>
                <div className="rounded-lg bg-white/[0.03] border border-white/10 p-2 flex flex-col items-center gap-1 group">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Velocidade</span>
                    <SheetInput
                        compact
                        type="number"
                        value={String(currentValues.movementSpeed || 30)}
                        onChangeValue={(val) => patchField("movementSpeed", parseInt(val) || 30)}
                        isLoading={isLoading}
                        className="text-xl font-black"
                    />
                    <span className="text-[9px] text-white/30">pés</span>
                </div>
            </div>

            {/* HP */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Pontos de Vida</h3>
                    <div className="flex gap-1.5 h-1.5 w-24 bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-500/70 to-green-400/50 transition-all duration-300"
                            style={{
                                width:
                                    (currentSheet.hpMax ?? 0) > 0
                                        ? `${Math.max(0, Math.min(100, ((currentSheet.hpCurrent ?? 0) / (currentSheet.hpMax ?? 1)) * 100))}%`
                                        : "0%"
                            }}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <SheetInput
                        label="Máximo"
                        type="number"
                        min={0}
                        value={String(currentValues.hpMax || 0)}
                        onChangeValue={(val) => patchField("hpMax", parseInt(val) || 0)}
                        isLoading={isLoading}
                    />
                    <SheetInput
                        label="Atual"
                        type="number"
                        value={String(currentValues.hpCurrent || 0)}
                        onChangeValue={(val) => patchField("hpCurrent", parseInt(val) || 0)}
                        isLoading={isLoading}
                    />
                    <SheetInput
                        label="Temporário"
                        type="number"
                        min={0}
                        value={String(currentValues.hpTemp || 0)}
                        onChangeValue={(val) => patchField("hpTemp", parseInt(val) || 0)}
                        isLoading={isLoading}
                    />
                </div>
            </div>

            {/* Hit Dice + Death Saves */}
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Dado de Vida</h3>
                    <div className="flex gap-2">
                        <SheetInput
                            label="Total"
                            placeholder="Ex: 8d8"
                            className="flex-1"
                            value={currentValues.hitDiceTotal || ""}
                            onChangeValue={(val) => patchField("hitDiceTotal", val)}
                            isLoading={isLoading}
                        />
                        <SheetInput
                            label="Gasto"
                            type="number"
                            min={0}
                            className="w-16"
                            value={String(currentValues.hitDiceUsed || 0)}
                            onChangeValue={(val) => patchField("hitDiceUsed", parseInt(val) || 0)}
                            isLoading={isLoading}
                        />
                    </div>
                </div>

                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Testes de Morte</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <SheetInput
                            label="Sucessos"
                            type="number"
                            min={0}
                            max={3}
                            value={String(currentValues.deathSavesSuccess || 0)}
                            onChangeValue={(val) => patchField("deathSavesSuccess", parseInt(val) || 0)}
                            isLoading={isLoading}
                        />
                        <SheetInput
                            label="Falhas"
                            type="number"
                            min={0}
                            max={3}
                            value={String(currentValues.deathSavesFailure || 0)}
                            onChangeValue={(val) => patchField("deathSavesFailure", parseInt(val) || 0)}
                            isLoading={isLoading}
                        />
                    </div>
                </div>
            </div>

            {/* Spellcasting */}
            {currentSheet.spellcastingAttribute && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                    <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/40">Conjuração</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col items-center gap-1 group">
                            <span className="text-[8px] text-white/30 uppercase tracking-wide text-center">CD de Resistência</span>
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
                            value={currentValues.spellcastingAttribute || ""}
                            onChangeValue={(val) => patchField("spellcastingAttribute", val)}
                            isLoading={isLoading}
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
                    {attacks.length === 0 && <p className="text-[10px] text-white/30 italic text-center py-2">Nenhum ataque cadastrado</p>}
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
                            value={String(currentValues.coins?.[coin] || 0)}
                            onChangeValue={(val) => patchField(`coins.${coin}` as keyof PatchSheetBody, parseInt(val) || 0)}
                            isLoading={isLoading}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
