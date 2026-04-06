"use client"

import { UseFormReturn } from "react-hook-form"
import { cn } from "@/core/utils"
import { CalcTooltip } from "./calc-tooltip"
import { SheetInput } from "./sheet-input"
import type { PatchSheetBody, AttributeType, SkillName } from "../types/character-sheet.types"
import { useCharacterCalculations } from "../hooks/use-character-calculations"
import type { CharacterSheet } from "../types/character-sheet.types"
import { SKILL_ATTRIBUTE_MAP } from "../utils/dnd-calculations"

import { usePatchSheet } from "../api/character-sheets-queries"

const ATTRIBUTES: { key: AttributeType; label: string; abbr: string; color: string }[] = [
    { key: "strength", label: "Força", abbr: "FOR", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
    { key: "dexterity", label: "Destreza", abbr: "DES", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
    { key: "constitution", label: "Constituição", abbr: "CON", color: "text-red-400 border-red-500/30 bg-red-500/10" },
    { key: "intelligence", label: "Inteligência", abbr: "INT", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
    { key: "wisdom", label: "Sabedoria", abbr: "SAB", color: "text-slate-300 border-slate-500/30 bg-slate-500/10" },
    { key: "charisma", label: "Carisma", abbr: "CAR", color: "text-purple-400 border-purple-500/30 bg-purple-500/10" }
]

const SAVING_THROW_LABELS: Record<AttributeType, string> = {
    strength: "Força",
    dexterity: "Destreza",
    constitution: "Constituição",
    intelligence: "Inteligência",
    wisdom: "Sabedoria",
    charisma: "Carisma",
}

interface SheetLeftColumnProps {
    sheet: CharacterSheet
    form: any
}

export function SheetLeftColumn({ sheet, form }: SheetLeftColumnProps) {
    const { watch, patchField } = form
    const currentValues = watch()
    const currentSheet = { ...sheet, ...currentValues } as CharacterSheet
    const calc = useCharacterCalculations(currentSheet)
    const { isPending: isLoading } = usePatchSheet(sheet?._id)

    const formatMod = (v: number) => (v >= 0 ? `+${v}` : `${v}`)

    return (
        <div className="space-y-4">
            {/* Inspiration + Proficiency Bonus */}
            <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                    <input
                        type="checkbox"
                        checked={watch("inspiration") || false}
                        onChange={(e) => patchField("inspiration", e.target.checked)}
                        className="w-4 h-4 accent-amber-400 bg-white/5 border-white/10 rounded"
                    />
                    <span className="text-xs font-semibold text-white/50 group-hover:text-white/80 transition-colors">Inspiração</span>
                </label>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Bônus de Prof.</span>
                    <CalcTooltip formula={calc.profBonus.formula}>
                        <span className="text-sm font-bold text-white/90">{formatMod(calc.profBonus.value)}</span>
                    </CalcTooltip>
                </div>
            </div>

            {/* Attributes */}
            <div className="grid grid-cols-3 gap-2">
                {ATTRIBUTES.map(({ key, abbr, color }) => (
                    <div key={key} className={cn("rounded-lg border p-2 flex flex-col items-center gap-1 transition-all", color)}>
                        <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">{abbr}</span>
                        <CalcTooltip formula={calc.attrMods[key].formula}>
                            <span className="text-xl font-black">{formatMod(calc.attrMods[key].value)}</span>
                        </CalcTooltip>
                        <SheetInput
                            compact
                            type="number"
                            min={1}
                            max={30}
                            value={String(currentValues[key] || 10)}
                            onChangeValue={(val) => patchField(key as keyof PatchSheetBody, parseInt(val) || 10)}
                            isLoading={isLoading}
                            className="h-8 bg-transparent border-0 border-t border-white/10 pt-1"
                        />
                    </div>
                ))}
            </div>

            {/* Saving Throws */}
            <div className="space-y-1 bg-white/5 p-3 rounded-lg border border-white/10">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Testes de Resistência</h3>
                {(Object.keys(SAVING_THROW_LABELS) as AttributeType[]).map((attr) => {
                    const proficient = !!(currentSheet.savingThrows as Record<string, boolean> | undefined)?.[attr]
                    return (
                        <div key={attr} className="flex items-center gap-2 group">
                            <input
                                type="checkbox"
                                className="w-3.5 h-3.5 accent-violet-400 bg-white/5 border-white/10 rounded"
                                checked={proficient}
                                onChange={(e) => {
                                    const curr = (currentSheet.savingThrows as Record<string, boolean> | undefined) ?? {}
                                    patchField("savingThrows", {
                                        ...curr,
                                        [attr]: e.target.checked
                                    })
                                }}
                            />
                            <CalcTooltip formula={calc.savingThrows[attr].formula}>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] w-6 text-center font-bold text-white/40">
                                        {formatMod(calc.savingThrows[attr].value)}
                                    </span>
                                    <span className="text-xs text-white/60 group-hover:text-white/90 transition-colors">
                                        {SAVING_THROW_LABELS[attr]}
                                    </span>
                                </div>
                            </CalcTooltip>
                        </div>
                    )
                })}
            </div>

            {/* Skills */}
            <div className="space-y-1 bg-white/5 p-3 rounded-lg border border-white/10">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Perícias</h3>
                {(Object.keys(SKILL_ATTRIBUTE_MAP) as SkillName[]).sort().map((skill) => {
                    const skillData = (currentSheet.skills as Record<string, { proficient: boolean; expertise: boolean }> | undefined)?.[skill] ?? {
                        proficient: false,
                        expertise: false
                    }
                    const attrAbbr = (() => {
                        const a = SKILL_ATTRIBUTE_MAP[skill]
                        return ATTRIBUTES.find((x) => x.key === a)?.abbr ?? ""
                    })()
                    return (
                        <div key={skill} className="flex items-center gap-1.5 group">
                            {/* Proficiency */}
                            <input
                                type="checkbox"
                                className="w-3 h-3 accent-violet-400 bg-white/5 border-white/10 rounded"
                                checked={skillData.proficient}
                                onChange={(e) => {
                                    const curr =
                                        (currentSheet.skills as Record<string, { proficient: boolean; expertise: boolean }> | undefined) ?? {}
                                    patchField("skills", {
                                        ...curr,
                                        [skill]: { ...curr[skill], proficient: e.target.checked }
                                    })
                                }}
                            />
                            {/* Expertise */}
                            <input
                                type="checkbox"
                                className="w-3 h-3 accent-amber-400 bg-white/5 border-white/10 rounded"
                                checked={skillData.expertise}
                                title="Especialização"
                                onChange={(e) => {
                                    const curr =
                                        (currentSheet.skills as Record<string, { proficient: boolean; expertise: boolean }> | undefined) ?? {}
                                    patchField("skills", {
                                        ...curr,
                                        [skill]: { ...curr[skill], expertise: e.target.checked }
                                    })
                                }}
                            />
                            <CalcTooltip formula={calc.skills[skill]?.formula ?? ""}>
                                <span className="text-[10px] text-white/60 group-hover:text-white/90 transition-colors">
                                    <span className="font-bold text-white/40 mr-1 w-6 inline-block text-center">
                                        {formatMod(calc.skills[skill]?.value ?? 0)}
                                    </span>
                                    {skill}
                                    <span className="text-white/20 ml-1 text-[8px] uppercase">({attrAbbr})</span>
                                </span>
                            </CalcTooltip>
                        </div>
                    )
                })}
            </div>

            {/* Passive Perception */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5 mx-1">
                <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Percepção Passiva</span>
                <CalcTooltip formula={calc.passivePerception.formula}>
                    <span className="text-sm font-bold text-white/70">{calc.passivePerception.value}</span>
                </CalcTooltip>
            </div>
        </div>
    )
}
